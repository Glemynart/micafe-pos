# IMP-4 — Validación de fondos en operaciones financieras

> **Estado:** DISEÑO · **Fecha:** 2026-07-08
> **Rama:** `research/imp-4-validacion-fondos`

---

## 0. Resumen ejecutivo

El sistema tiene 7 operaciones que descuentan saldo de cuentas bancarias. Solo **1 de 7** (`registrarCompra`) valida que existan fondos suficientes antes de debitar. Las otras 6 permiten dejar saldos negativos sin advertencia. Firestore no impide valores negativos en `increment(-X)`, y las reglas de seguridad no validan `saldo >= 0`.

**Solución:** agregar validación de fondos dentro de cada `runTransaction`, siguiendo el patrón que ya existe en `registrarCompra()`. Sin refactor, sin helpers compartidos, sin cambios de arquitectura. Puramente replicar un `if` de 3 líneas en 6 funciones.

---

## 1. Estado actual

| # | Función | Archivo | ¿Valida fondos? | Mecanismo de débito |
|---|---|---|---|---|
| 1 | `registrarCompra()` | `compras-service.ts:86-91` | **SÍ** | `increment(-total)` |
| 2 | `anularVenta()` | `ventas-service.ts:651` | **NO** | `increment(-monto)` |
| 3 | `guardarEgreso()` | `egresos-service.ts:46` | **NO** | `increment(-egreso.monto)` |
| 4 | `cerrarTurno()` (traslado) | `turnos-service.ts:317` | **NO** | `increment(-depositoEfectivo)` |
| 5 | `cerrarTurno()` (faltante) | `turnos-service.ts:351` | **NO** | `increment(diferencia)` con `diferencia < 0` |
| 6 | `registrarTransaccion()` (egreso) | `finanzas-service.ts:94-96` | **NO** | `saldoActual - tx.monto` (aritmética directa) |
| 7 | `trasladarEntreCuentas()` (origen) | `finanzas-service.ts:140` | **NO** | `saldoOrigen - params.monto` (aritmética directa) |

---

## 2. Evidencia encontrada

### 2.1 El patrón correcto ya existe

`registrarCompra()` (`compras-service.ts:82-92`) demuestra el patrón en producción:

```typescript
// ── LECTURA (dentro de runTransaction) ──
cuentaRef = doc(db, "cuentas_bancarias", params.cuentaId);
const cuentaSnap = await transaction.get(cuentaRef);
if (!cuentaSnap.exists()) throw new Error("La cuenta bancaria no existe.");

// ── VALIDACIÓN ──
const saldoDisponible = Number(cuentaSnap.data().saldo ?? 0);
if (saldoDisponible < params.total) {
  throw new Error(
    `Fondos insuficientes en la cuenta seleccionada. ` +
    `Saldo disponible: $${saldoDisponible.toLocaleString('es-CO')} — ` +
    `Total de la compra: $${params.total.toLocaleString('es-CO')}.`
  );
}

// ── ESCRITURA ──
transaction.update(cuentaRef, { saldo: increment(-params.total) });
```

### 2.2 Las otras 6 funciones carecen de validación

**`guardarEgreso()`** (`egresos-service.ts:43-46`):
```typescript
const cajaPrincipalSnap = await transaction.get(cajaPrincipalRef)
if (!cajaPrincipalSnap.exists()) throw new Error(...)
// ← SIN VALIDACIÓN DE SALDO
transaction.update(cajaPrincipalRef, { saldo: increment(-egreso.monto) })
```

**`anularVenta()`** (`ventas-service.ts:649-651`):
```typescript
const revertirMovimiento = (cuentaId: string, monto: number) => {
  if (monto <= 0 || !cuentaMap[cuentaId]) return;
  // ← SIN VALIDACIÓN DE SALDO
  transaction.update(doc(db, 'cuentas_bancarias', cuentaId), { saldo: increment(-monto) });
```

**`cerrarTurno()` — traslado** (`turnos-service.ts:311-317`):
```typescript
const cajaPrincipalRef = doc(db, 'cuentas_bancarias', 'caja-principal');
// ← SIN LECTURA NI VALIDACIÓN DE SALDO
transaction.update(cajaPrincipalRef, { saldo: increment(-depositoEfectivo) });
```

**`cerrarTurno()` — faltante** (`turnos-service.ts:349-351`):
```typescript
const diferencia = diferenciaEfectivo;  // puede ser negativo
if (diferencia !== 0) {
  // ← SIN LECTURA NI VALIDACIÓN DE SALDO
  transaction.update(cajaPrincipalRef, { saldo: increment(diferencia) });
```

**`registrarTransaccion()`** (`finanzas-service.ts:93-96`):
```typescript
const saldoActual = cuentaDoc.data().saldo || 0;
const nuevoSaldo = tx.tipo === 'ingreso'
  ? saldoActual + tx.monto
  : saldoActual - tx.monto;  // ← SIN VALIDACIÓN DE saldoActual >= tx.monto
transaction.update(cuentaRef, { saldo: nuevoSaldo });
```

**`trasladarEntreCuentas()`** (`finanzas-service.ts:134-140`):
```typescript
const saldoOrigen = origenSnap.data().saldo || 0;
// ← SIN VALIDACIÓN DE saldoOrigen >= params.monto
transaction.update(origenRef, { saldo: saldoOrigen - params.monto });
```

### 2.3 Escenarios de saldo negativo (confirmados por trazado de código)

| Escenario | Operación | Cómo se produce |
|---|---|---|
| A | Egreso sin fondos | Cajero gasta $100K con caja-principal en $50K → saldo = -$50K |
| B | Anulación que descuadra | Admin anula venta de $80K en efectivo con caja-principal en $30K → saldo = -$50K |
| C | Cierre con faltante excesivo | `depositoEfectivo` > `caja-principal.saldo` → saldo negativo |
| D | Traslado sin fondos | Admin traslada $50K de origen con $10K → origen = -$40K |
| E | Transacción manual de egreso | Admin registra egreso manual de $20K con cuenta en $5K → saldo = -$15K |

---

## 3. Principios arquitectónicos

1. **Validación atómica con la escritura.** Toda validación de fondos ocurre dentro del mismo `runTransaction` que ejecuta el débito. Sin TOCTOU.
2. **Error descriptivo y en español.** Todo rechazo incluye el saldo disponible y el monto solicitado con formato `es-CO`.
3. **Sin validación en frontend.** La fuente de verdad es Firestore; el cliente puede mostrar saldo desactualizado.
4. **Sin validación en Firestore Rules.** Las reglas no pueden acceder al valor previo del campo para comparar. La única validación efectiva es en capa de aplicación dentro de la transacción.
5. **Patrón uniforme.** Las 7 operaciones de débito siguen exactamente el mismo patrón de validación que `registrarCompra()`.
6. **Sin abstracción prematura.** No se crea un helper compartido. La validación son 3 líneas por función y el contexto semántico del mensaje de error difiere por operación.
7. **`cerrarTurno()` es operación de dominio, no omisión.** El cierre debe proteger la integridad financiera. Un futuro módulo de conciliación podrá modificar esta decisión sin afectar el resto de la arquitectura.

---

## 4. Causa raíz

Todas las operaciones financieras fueron migradas a `runTransaction` durante fases anteriores (9C, 9D, 10A, 10C), pero la validación de fondos solo se implementó en `registrarCompra()` — posiblemente porque fue la primera operación en migrarse y el patrón no se replicó en las demás por omisión, no por decisión de diseño.

---

## 5. Decisiones de diseño

### D1 · Patrón de validación: réplica de `registrarCompra()`

Cada operación de débito sigue exactamente este patrón:

```
1. Leer cuentaSnap dentro de runTransaction (si no se leyó antes)
2. saldoDisponible = cuentaSnap.data().saldo || 0
3. if (saldoDisponible < montoADebitar) throw Error("Fondos insuficientes...")
4. Ejecutar el débito normalmente
```

**Justificación:** es el patrón que ya funciona en producción. No requiere imports nuevos, no introduce abstracciones, no modifica la estructura de las transacciones. Cada función ya lee el documento de cuenta (o debe leerlo); solo falta el `if`.

**Formato canónico del mensaje de error — todas las operaciones:**

```
`Fondos insuficientes en ${nombreCuenta}. Saldo disponible: $${saldoDisponible.toLocaleString('es-CO')} — Monto requerido: $${monto.toLocaleString('es-CO')}.`
```

**Mensajes específicos por operación:**

| Operación | Mensaje de error |
|---|---|
| `registrarCompra()` | *(sin cambios)* `Fondos insuficientes en la cuenta seleccionada. Saldo disponible: $X — Total de la compra: $Y.` |
| `guardarEgreso()` | `Fondos insuficientes en Caja Registradora. Saldo disponible: $X — Monto del egreso: $Y.` |
| `anularVenta()` (efectivo) | `Fondos insuficientes en Caja Registradora para anular la venta #N. Saldo disponible: $X — Monto a revertir: $Y.` |
| `anularVenta()` (transferencia) | `Fondos insuficientes en Bancolombia para anular la venta #N. Saldo disponible: $X — Monto a revertir: $Y.` |
| `cerrarTurno()` (traslado) | `Fondos insuficientes en Caja Registradora para completar el cierre. Saldo disponible: $X — Depósito requerido: $Y. Registre los ingresos faltantes o contacte al administrador.` |
| `cerrarTurno()` (faltante) | `Fondos insuficientes en Caja Registradora para cubrir el faltante. Saldo disponible: $X — Faltante: $Y.` |
| `registrarTransaccion()` (egreso) | `Fondos insuficientes en ${nombreCuenta}. Saldo disponible: $X — Monto de la transacción: $Y.` |
| `trasladarEntreCuentas()` | `Fondos insuficientes en ${nombreOrigen}. Saldo disponible: $X — Monto a trasladar: $Y.` |

Todos los mensajes incluyen: nombre de la cuenta, saldo disponible, monto solicitado, y formato numérico `es-CO`. Ninguno es genérico (`"Fondos insuficientes."`).

### D2 · Sin helper compartido

No se crea un módulo `lib/validar-fondos.ts` ni un helper reutilizable.

**Justificación por principio de cohesión, acoplamiento y mantenibilidad:**

| Criterio | Evaluación |
|---|---|
| **Líneas duplicadas** | 3 líneas por función (18 líneas totales en 6 funciones). No justifica un módulo. |
| **Contexto semántico** | Cada operación tiene un mensaje de error distinto: "compra", "egreso", "anulación de venta", "cierre de turno", "traslado", "transacción". Un helper genérico requeriría un parámetro `operacion: string` para personalizar el mensaje, eliminando la ganancia de abstracción. |
| **Acoplamiento** | Un helper compartido acoplaría 4 archivos de servicio (`ventas-service`, `egresos-service`, `turnos-service`, `finanzas-service`) a un nuevo módulo. Si el helper cambia su firma, hay que tocar 4 archivos. Si cada servicio valida internamente, los cambios son locales. |
| **Cohesión** | La validación de fondos pertenece al dominio de cada operación, no es una responsabilidad transversal. `registrarCompra` necesita validar el total de la compra contra la cuenta seleccionada; `guardarEgreso` siempre es contra caja-principal; `trasladarEntreCuentas` valida la cuenta origen. Unificar esto en un helper fuerza una abstracción sobre contextos que son naturalmente distintos. |
| **Testabilidad** | Probar la validación dentro de cada `runTransaction` no requiere mockear un helper externo. |

**Veredicto:** no existe duplicación suficiente para justificar la abstracción. Cada función agrega 3-5 líneas. El patrón es el mismo, pero el contexto es distinto. Esto es "duplicación incidental", no "duplicación estructural".

### D3 · `cerrarTurno()`: validación con mensaje específico

El cierre de turno valida fondos para el traslado (`depositoEfectivo`) y para el faltante (`diferencia < 0`).

**Decisión actual (MVP sin conciliación):** si el débito dejaría `caja-principal` con saldo negativo, el cierre se rechaza con:

```
"Fondos insuficientes en Caja Registradora para completar el cierre.
 Saldo disponible: $X — Depósito requerido: $Y.
 Registre los ingresos faltantes o contacte al administrador."
```

**Decisión futura:** cuando exista un módulo de conciliación, este podrá autorizar cierres con saldo negativo como "faltante reconocido" sin modificar la validación aquí — el módulo de conciliación tendrá su propio permiso de sobregiro. Esta decisión está explícitamente documentada para que el futuro equipo sepa que es intencional, no una omisión.

### D4 · Mensajes de error con formato `es-CO`

Todos los mensajes de error de fondos insuficientes usan `toLocaleString('es-CO')` para consistencia con el resto de la UI financiera.

### D5 · Atomicidad garantizada por `runTransaction`

Todas las operaciones financieras ya usan `runTransaction`. La validación de fondos se inserta en la fase de lecturas de la transacción, antes de cualquier escritura. Si la validación falla, la transacción se aborta sin efectos secundarios. No se requiere `writeBatch` ni cambios en el mecanismo de atomicidad.

### D6 · `anularVenta()`: lectura condicional de cuenta

`anularVenta()` itera sobre métodos de pago y debita `caja-principal` y/o `bancolombia` según el método original. La función debe leer el documento de cuenta **una vez por cuenta afectada** (máximo 2 lecturas: caja-principal + bancolombia) y validar que el saldo cubre la suma de todos los débitos a esa cuenta.

**Ejemplo:** si una venta mixta débito $30K de caja-principal + $20K de bancolombia, se validan ambas cuentas por separado.

---

## 6. Archivos afectados

| Archivo | Cambio | Funciones |
|---|---|---|
| `lib/ventas-service.ts` | Agregar validación antes de `revertirMovimiento` | `anularVenta()` |
| `lib/egresos-service.ts` | Agregar validación después de `cajaPrincipalSnap.exists()` | `guardarEgreso()` |
| `lib/turnos-service.ts` | Leer `cajaPrincipalRef` + validar antes de traslado y faltante | `cerrarTurno()` |
| `lib/finanzas-service.ts` | Agregar validación en caso egreso de `registrarTransaccion()` y en `trasladarEntreCuentas()` | 2 funciones |
| `lib/compras-service.ts` | **Sin cambios** — ya tiene validación | — |

**Total: 4 archivos, 6 funciones, ~3-5 líneas por función.**

---

## 7. Riesgos aceptados

- **R-a1 — Rechazo de cierre de turno legítimo.** Si `caja-principal` tiene saldo menor al esperado (por ejemplo, porque un ingreso en efectivo no se registró correctamente), `cerrarTurno()` rechazará el cierre. Esto es **intencional**: es preferible un cierre rechazado con mensaje claro a un saldo negativo silencioso. La corrección operativa (registrar el ingreso faltante) es trivial y no requiere código.
- **R-a2 — Rechazo de anulación de venta.** Si `caja-principal` no tiene fondos para revertir una venta (por ejemplo, porque el efectivo ya fue trasladado a caja-fuerte), `anularVenta()` rechazará la operación. El administrador deberá primero trasladar fondos de vuelta a caja-principal. Esto es **intencional**: evita el escenario donde una anulación deja la caja registradora con saldo negativo.
- **R-a3 — Sin cambio en UX.** El mensaje de error de Firestore (`throw Error(...)`) se propaga al cliente como excepción. Los componentes que llaman estas funciones ya manejan errores con `try/catch` + `toast.error()`. No se requiere cambiar el frontend.

---

## 8. Riesgos descartados

- **R-d1 — Condición de carrera entre lectura y escritura.** Descartado: la validación ocurre dentro de `runTransaction`. Si otra operación concurrente modifica el saldo, Firestore reintenta la transacción automáticamente, releyendo el valor actualizado.
- **R-d2 — Necesidad de reglas Firestore adicionales.** Descartado: Firestore rules no pueden comparar `saldo` antes y después en una regla `allow update`. La validación en capa de aplicación es la única viable sin Cloud Functions.
- **R-d3 — Impacto en rendimiento.** Descartado: agregar una lectura adicional de un documento que ya se iba a leer (o ya se lee) no tiene impacto medible. `cerrarTurno()` es la única función que actualmente no lee `cajaPrincipalRef` antes del débito, y esa lectura ya es necesaria para obtener el nombre de la cuenta.

---

## 9. Compatibilidad

| Módulo | ¿Afectado? | Impacto |
|---|---|---|
| **POS / Caja** | No directamente | El cajero verá un toast de error si la operación se rechaza. El flujo normal no cambia. |
| **Cierre de turno** | Sí | `cerrarTurno()` ahora puede rechazar el cierre si `caja-principal` no cubre el depósito. |
| **Anulación de venta** | Sí | `anularVenta()` ahora puede rechazar la anulación si la cuenta no tiene fondos. |
| **Egresos** | Sí | `guardarEgreso()` ahora rechaza egresos mayores al saldo disponible. |
| **Finanzas (traslados)** | Sí | `trasladarEntreCuentas()` ahora rechaza traslados sin fondos en origen. |
| **Finanzas (transacciones)** | Sí | `registrarTransaccion()` ahora rechaza egresos manuales sin fondos. |
| **Compras** | No | Ya tiene validación. |
| **Reportes** | No | Solo lectura. |
| **Inventario** | No | Sin relación directa. |
| **Reservas / Wompi** | No | Solo hacen créditos. |
| **Reglas Firestore** | No | Sin cambios. |
| **Índices Firestore** | No | Sin cambios. |
| **Migraciones** | No | Sin cambios en datos. |

---

## 10. Roadmap de implementación

### PR-1 · `guardarEgreso()` + `anularVenta()`

**Objetivo:** validar fondos en las dos operaciones de débito más frecuentes.

Archivos: `lib/egresos-service.ts`, `lib/ventas-service.ts`.

Pruebas:
- Egreso con fondos suficientes → éxito.
- Egreso con fondos insuficientes → `Error("Fondos insuficientes...")`.
- Anulación de venta efectivo con fondos → éxito.
- Anulación de venta efectivo sin fondos → error descriptivo.
- Anulación de venta mixta (efectivo + transferencia) → valida ambas cuentas.

### PR-2 · `cerrarTurno()`

**Objetivo:** validar fondos en cierre de turno, con mensaje específico.

Archivos: `lib/turnos-service.ts`.

Pruebas:
- Cierre con `depositoEfectivo <= saldo caja-principal` → éxito.
- Cierre con `depositoEfectivo > saldo caja-principal` → error descriptivo.
- Faltante (`diferencia < 0`) con `|diferencia| <= saldo` → éxito.
- Faltante con `|diferencia| > saldo` → error descriptivo.

### PR-3 · `registrarTransaccion()` + `trasladarEntreCuentas()`

**Objetivo:** validar fondos en operaciones manuales de administrador.

Archivos: `lib/finanzas-service.ts`.

Pruebas:
- Egreso manual con fondos → éxito.
- Egreso manual sin fondos → error descriptivo.
- Traslado con fondos en origen → éxito.
- Traslado sin fondos en origen → error descriptivo.

**Justificación del orden:** PR-1 cubre las operaciones más frecuentes del cajero (egresos y anulaciones). PR-2 cubre el cierre de turno (operación diaria crítica). PR-3 cubre operaciones administrativas (menor frecuencia). PRs pequeños, independientes, mergeables en cualquier orden.

---

## 11. Definición de Done

Por PR:
- [ ] La validación se ejecuta **dentro** de `runTransaction`, en la fase de lecturas.
- [ ] El mensaje de error incluye saldo disponible y monto solicitado en formato `es-CO`.
- [ ] La operación exitosa no cambia su comportamiento.
- [ ] La operación rechazada lanza `Error` con mensaje descriptivo (no `console.error` mudo).
- [ ] `registrarCompra()` no se modifica (ya tiene validación).

Validación end-to-end:
- [ ] Egreso sin fondos → toast de error en el POS, egreso no registrado, saldo intacto.
- [ ] Anulación sin fondos → toast de error, venta no anulada, saldo intacto.
- [ ] Cierre de turno sin fondos → toast de error, turno permanece abierto, saldo intacto.
- [ ] Traslado sin fondos → toast de error en Finanzas, saldo intacto.
- [ ] Todas las operaciones con fondos suficientes funcionan exactamente igual que antes.

---

## 12. Fuera de alcance

- Validación en frontend (la fuente de verdad es Firestore).
- Reglas Firestore adicionales (no pueden comparar valores pre/post).
- Módulo de conciliación / arqueos / ajustes excepcionales.
- Corrección de saldos negativos históricos.
- Rate limiting o prevención de abuso.
- Notificaciones al administrador sobre rechazos por fondos insuficientes.
- Helper compartido de validación (ver D2).

---

## 13. Futuras mejoras

- **Módulo de conciliación:** permitir cierres de turno con faltante reconocido sin rechazar la operación.
- **Notificación proactiva:** alertar al admin cuando una cuenta está cerca de $0.
- ** Auditoría de saldos negativos históricos:** script único para detectar y reportar (no corregir) saldos negativos preexistentes.
- **Validación de saldo mínimo:** impedir que `caja-principal` baje de cierto umbral configurable.

---

## Veredicto

> IMP-4 es un hallazgo real. 6 de 7 operaciones de débito carecen de validación de fondos. La corrección es **quirúrgica**: replicar el patrón de 3 líneas que ya existe en `registrarCompra()` en las 6 funciones restantes.
>
> Sin refactor, sin helpers compartidos, sin cambios de arquitectura. 4 archivos, ~20 líneas netas nuevas. Cada PR es independiente y mergeable en cualquier orden.
>
> **3 PRs, riesgo bajo, listo para implementar.**
