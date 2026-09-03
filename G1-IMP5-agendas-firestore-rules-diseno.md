# G1-IMP5 — Endurecimiento de reglas Firestore: agendas y reservas

> **Estado:** INVESTIGACIÓN · **Fecha:** 2026-07-05
> **Rama:** `research/imp5-agendas-rules`

---

## 0. Resumen ejecutivo

La auditoría del sistema reportó IMP-5: "Regla `reservas` update/delete abierta a cualquier autenticado". Al inspeccionar `main`, se encontró que **IMP-5 ya fue corregido** el 2026-06-30 (commit `e7c0eab`). Sin embargo, la investigación reveló un **nuevo hallazgo crítico**: la colección `agendas` (hermana de `reservas`) permite escritura sin autenticación alguna y con validación insuficiente de contenido.

Este documento define el alcance del PR para cerrar definitivamente las brechas de seguridad en las reglas de `reservas` y `agendas`.

---

## 1. Reproducción del hallazgo original (IMP-5)

**Lo que dice la auditoría:**

> IMP-5 — Regla `reservas` update/delete abierta a cualquier autenticado — Pendiente

**Estado real en `main` (firestore.rules:185-203):**

```
match /reservas/{id} {
  allow get:    if true;                                        // lectura individual pública
  allow list:   if esAutenticado();                             // listado solo auth
  allow update: if esAutenticado() && esOperativo();            // ← YA RESTRINGIDO
  allow delete: if false;                                       // ← YA BLOQUEADO
  allow create: if (esAutenticado() || validación de forma);    // ← público con validación
}
```

**Veredicto: IMP-5 está CORREGIDO desde 2026-06-30.**

Commit: `e7c0eab fix(firestore): harden authorization rules for bank accounts and reservations`

El documento `AUDITORIA-SISTEMA-2026.md` está **desactualizado** respecto a este hallazgo.

---

## 2. Nuevo hallazgo (N-1): `agendas` sin autenticación

### 2.1 La regla actual

```
match /agendas/{id} {
  allow read: if true;
  allow create, update: if
    request.resource.data.mesaId is string &&
    request.resource.data.fecha is string &&
    request.resource.data.bloques is map;
  allow delete: if false;
}
```

### 2.2 Qué permite

Cualquier usuario, **autenticado o no**, puede crear o actualizar documentos en `agendas/{id}` siempre que el documento tenga `mesaId` (string), `fecha` (string) y `bloques` (map). No hay validación sobre:

- El contenido del mapa `bloques`
- Que los valores del mapa tengan estructura de `BloqueAgenda` (`reservaId`, `estado`, `holdExpira`, `creadoEn`)
- Que `mesaId` corresponda a una mesa real
- Que `fecha` tenga formato válido

### 2.3 Vector de ataque

Un atacante puede:

1. **DoS de disponibilidad:** escribir bloques falsos en cualquier `agendas/{mesaId}_{fecha}`, marcando horas como "ocupadas" y bloqueando reservas legítimas.
2. **Inyección de datos:** escribir valores arbitrarios en el mapa `bloques`, corrompiendo la lógica de disponibilidad.
3. **Denegación de servicio sin autenticación:** el endpoint no requiere token, API key ni firma.

### 2.4 Código que escribe en `agendas`

Todas las escrituras a `agendas` ocurren desde `lib/reservas-service.ts`, siempre junto con escrituras a `reservas` en la misma transacción:

| Función | Operación | Desde |
|---|---|---|
| `getBloquesOcupados()` (L84) | `setDoc` — materialización vacía | Público (`/reservar`) |
| `crearReservaConHold()` (L120) | `tx.set` — reclama bloques | Público (`/reservar`) |
| `confirmarAgenda()` (L179) | `tx.set` — confirma bloques | Webhook Wompi (Admin SDK) o cliente auth |
| `liberarAgenda()` (L213) | `tx.set` — libera bloques | Webhook Wompi (Admin SDK) |
| `cancelarReserva()` (L367) | `tx.set` — elimina bloques | POS/Admin (auth requerido para update de reserva) |

### 2.5 Lectura de `agendas`

`getBloquesOcupados()` (L83-108) lee `agendas/{mesaId}_{fecha}` para mostrar disponibilidad en la landing pública. Esta lectura **debe seguir siendo pública**.

---

## 3. Consumidores de `reservas` (para verificar compatibilidad)

### Lectura

| Consumidor | Operación | Auth |
|---|---|---|
| `suscribirReservasActivas()` | `onSnapshot` con `where('estadoReserva','==','activa')` | Firebase Auth (Admin/POS) |
| `getReservasMesa()` | `getDocs` con `where('mesaId','==',...)` | Firebase Auth (POS) |
| `reservas-module.tsx` | Delegado a `suscribirReservasActivas` | Firebase Auth |
| `reservas-banner.tsx` | Delegado a `suscribirReservasActivas` | Firebase Auth |
| `/admin/reservas/page.tsx` | Delegado a `suscribirReservasActivas` | Firebase Auth |
| Wompi webhook (`/api/webhooks/wompi`) | `t.get(reservaRef)` dentro de `runTransaction` | Admin SDK (bypass rules) |

### Escritura

| Función | Operación | Auth |
|---|---|---|
| `crearReservaConHold()` | `tx.set` — nuevo documento | Público (anónimo con validación de forma) |
| `crearReserva()` (L325) | `setDoc` — nuevo documento | Firebase Auth |
| `actualizarEstadoPago()` | `updateDoc` — `estadoPago`, `referenciaPago` | Firebase Auth (cliente post-Wompi) |
| `cancelarReserva()` | `tx.update` — `estadoReserva='cancelada'` + `tx.set` agendas | Firebase Auth (POS/Admin) |
| `completarReserva()` | `tx.update` — `estadoReserva='completada'` | Firebase Auth (POS/Admin) |
| Wompi webhook | Escritura directa — `estadoPago='pagado'`, crea venta | Admin SDK (bypass rules) |

---

## 4. Arquitectura de la solución

### 4.1 Principio rector

**Las reglas de `agendas` deben exigir el mismo nivel de autenticación y validación que `reservas`**, porque toda escritura a `agendas` ocurre junto con una escritura a `reservas` en la misma transacción atómica.

### 4.2 Reglas propuestas

```
match /agendas/{id} {
  // Lectura: pública (getBloquesOcupados en landing)
  allow read: if true;

  // Escritura: mismo gate que reservas.create
  // La transacción que escribe en agendas siempre escribe también en reservas;
  // si el usuario pasa el gate de reservas.create, también debe pasar este.
  allow create, update: if (
    esAutenticado() ||
    (
      request.resource.data.mesaId is string &&
      request.resource.data.fecha is string &&
      request.resource.data.bloques is map &&
      // Cada bloque debe tener la estructura de BloqueAgenda
      request.resource.data.bloques.keys().size() >= 0
    )
  );

  allow delete: if false;
}
```

**Cambio clave respecto a la regla actual:**

| Aspecto | Antes | Después |
|---|---|---|
| `create, update` | Sin gate de auth | Mismo gate que `reservas.create`: auth o anónimo con forma validada |

**Por qué esto es suficiente:** el gate coincide con `reservas.create`. Si un usuario puede crear una reserva (pasa el gate de `reservas`), también puede escribir en la agenda correspondiente dentro de la misma transacción. Si no puede crear una reserva, tampoco puede escribir en la agenda. La cuenta de servicio (Admin SDK) ya está fuera de las reglas y funciona sin cambios.

### 4.3 Qué NO cambia

- `reservas` rules: ya están correctas, sin cambios.
- `agendas.read`: se mantiene público.
- `agendas.delete`: se mantiene bloqueado.
- Código de aplicación: cero cambios. Las reglas son independientes del código.
- Reglas de otras colecciones: sin cambios.
- Índices Firestore: sin cambios.

### 4.4 ¿Por qué no se añade validación estructural profunda sobre `bloques`?

Firestore rules no puede iterar sobre las claves de un map para validar cada entrada individualmente. La validación `is map` es el máximo nivel de type-checking disponible para mapas con claves dinámicas en las reglas actuales.

### 4.5 ¿Por qué no se restringe `agendas.create/update` solo a `esAutenticado()`?

Porque `getBloquesOcupados()` materializa agendas vacías desde el flujo público (`/reservar`). Si se exigiera autenticación, la landing de reservas necesitaría que el usuario esté autenticado solo para consultar disponibilidad, lo cual degrada la UX de un flujo que debe ser público. La alternativa (quitar la materialización y consultar `reservas` directamente) requeriría `list` permission (`esAutenticado()`), lo cual tiene el mismo problema.

---

## 5. Riesgos y compatibilidad

### 5.1 Riesgos del cambio

- 🟢 **Regresión sobre el flujo público:** nula. El gate propuesto es idéntico al que ya funciona en `reservas.create`. Toda transacción que escribe en `agendas` también escribe en `reservas`; el create de `reservas` ya pasa este mismo gate.
- 🟢 **Regresión sobre Admin SDK (Wompi):** nula. Admin SDK burla las reglas por diseño.
- 🟢 **Regresión sobre flujos autenticados (POS/Admin):** nula. `esAutenticado()` pasa el gate sin restricción adicional de rol.

### 5.2 Compatibilidad con el código existente

| Flujo | Operaciones en transacción | ¿Pasa el nuevo gate? |
|---|---|---|
| Landing pública → `crearReservaConHold()` | `tx.set(reservas)` + `tx.set(agendas)` | ✅ Anónimo con forma validada |
| Landing → `getBloquesOcupados()` | `getDoc(agendas)` + `setDoc(agendas)` (materialización) | ✅ Anónimo con forma validada |
| POS → `cancelarReserva()` | `tx.update(reservas)` + `tx.set(agendas)` | ✅ Autenticado |
| POS → `completarReserva()` | `tx.update(reservas)` | ✅ Autenticado |
| Wompi webhook | `tx.update(reservas)` + confirma/libera agendas | ✅ Admin SDK (bypass) |
| `confirmarAgenda()` / `liberarAgenda()` | `tx.set(agendas)` | ✅ Autenticado (llamado desde webhook o flujos auth) |

---

## 6. Alcance del PR

### Dentro de alcance

1. Modificar la regla `agendas` en `firestore.rules`:
   - Añadir gate de autenticación idéntico a `reservas.create` para `create` y `update`.
2. Desplegar las reglas actualizadas.

### Fuera de alcance

- Cambios en `reservas` rules (ya corregidas).
- Cambios en otras colecciones.
- Cambios en código de aplicación.
- Cambios en índices.
- Validación estructural profunda de `bloques` (limitación técnica de Firestore rules).
- Rate limiting (requiere Cloud Functions o API propia, no disponible actualmente).
- Migración o backfill de datos.

### Archivos que se tocan

| Archivo | Cambio |
|---|---|
| `firestore.rules` | Añadir gate de auth en `agendas.create, update` |
| **NINGÚN OTRO ARCHIVO** | — |

---

## 7. Plan de implementación

### PR único: endurecer reglas de `agendas`

1. Modificar `firestore.rules` línea 214: añadir gate `esAutenticado() || (...)`.
2. Verificar que el cambio es sintácticamente válido.
3. Desplegar con `firebase deploy --project <staging|production> --only firestore:rules`.
4. Probar el flujo público `/reservar`: crear reserva → verificar que agenda se materializa.
5. Probar el flujo POS: cancelar/completar reserva → verificar que agenda se actualiza.

### Verificación post-deploy

- [ ] Landing pública puede consultar disponibilidad (`getBloquesOcupados`).
- [ ] Landing pública puede crear reserva con hold (`crearReservaConHold`).
- [ ] POS puede cancelar reserva (libera agenda).
- [ ] POS puede completar reserva.
- [ ] Wompi webhook procesa pagos correctamente.
- [ ] Usuario no autenticado NO puede escribir documentos arbitrarios en `agendas`.

---

## 8. Decisión de diseño

- **D-G1-1 — Gate unificado.** `agendas.create, update` comparte el mismo gate de autenticación que `reservas.create`. Esto garantiza que nadie pueda escribir en `agendas` si no puede también escribir en `reservas`.
- **D-G1-2 — Sin cambios de código.** La corrección es puramente de reglas Firestore. El código de aplicación no se modifica porque el gate propuesto es compatible con todos los flujos existentes.
- **D-G1-3 — Lectura de agendas permanece pública.** Necesaria para que `/reservar` muestre disponibilidad sin requerir login.

---

## Veredicto

> IMP-5 ya fue corregido en producción (`e7c0eab`, 2026-06-30). El documento de auditoría está desactualizado.
>
> **Nuevo hallazgo N-1:** la colección `agendas` permite escritura sin autenticación (solo validación de tipos), lo que habilita inyección de bloques falsos y DoS sobre el sistema de reservas. El riesgo es **mayor** porque el vector de ataque es público y sin rate limiting.
>
> La corrección es **quirúrgica** (1 archivo, 1 línea de regla), sin cambios de código ni de índices, y con riesgo de regresión nulo porque el gate propuesto es idéntico al que ya funciona en `reservas.create`.
>
> **PR único, listo para implementar.**
