# MT-U3 — Capa 5: runbook de activación

> **Estado:** preparación. Ningún paso de este documento se ha ejecutado contra producción.
> **Rama:** `feature/saas-mt-u3`
> **Depende de:** Capas 1–4 aprobadas (auditoría de cierre en cada una).
> **Objetivo de este documento:** que la activación sea una secuencia mecánica, sin pasos
> implícitos ni decisiones de memoria — cada paso tiene su comando, su gate de salida y su
> reverso.

Este documento no reemplaza `MT-U3-CAPA0-operacion-scripts.md` (uso detallado de
`migrate-mt-u3-operativo.ts`/`rollback-mt-u3-operativo.ts`) ni
`MT-U3-helper-tenant-diseno.md` §6/§9 (diseño). Es el **orden de ejecución end-to-end**,
el eslabón que faltaba entre "los scripts existen y están aprobados" y "se activó sin
regresión".

---

## 0. Regla de orden dura (no negociable)

```
índices Enabled  →  backfill --execute  →  deploy del código (Capas 1-4)
```

**En ese orden, en el mismo despliegue, sin ventana entre pasos.** Activar un filtro
`where('empresaId',…)` antes del backfill hace desaparecer de la UI los documentos
históricos sin `empresaId` — regresión visible (R1, matriz de riesgos §10).

Ningún paso de este runbook se salta ni se reordena. Si un paso falla, se detiene la
secuencia — no se avanza al siguiente "para no perder tiempo".

---

## 1. Pre-requisitos (verificar antes de iniciar la secuencia)

- [ ] Capas 1, 2, 3 y 4 aprobadas en su auditoría de cierre (✅ ya ocurrió para las 4).
- [ ] `npx tsc --noEmit` en verde sobre el código a desplegar.
- [ ] Suites de test (`test:tenant`, `test:tickets`, `test:reimpresion`) en verde.
- [ ] Backup / point-in-time recovery de Firestore disponible y confirmado.
- [ ] Confirmado el proyecto/entorno de destino (`.env.local` / service account) —
      **nunca** avanzar sin haber verificado explícitamente contra qué proyecto se apunta.
- [ ] Ventana de mantenimiento comunicada (aunque el diseño busca "cero downtime", el
      backfill sobre colecciones grandes — `ventas`, `movimientos_inventario` — puede tardar).

---

## 2. Paso 1 — Desplegar índices y esperar `Enabled`

```bash
firebase deploy --only firestore:indexes
```

- `firestore.indexes.json` contiene 22 entradas: 6 originales + 6 con `empresaId`
  antepuesto (Capa 3, §8.1) + los índices nuevos introducidos por las queries de Capa 3
  (§8.2) — auditados y sin duplicados.
- El build de índices sobre colecciones grandes (`ventas`, `movimientos_inventario`) **no
  bloquea escrituras**, pero sí la disponibilidad de la query hasta que termine (R6).
  Verificar el estado en la consola de Firebase (Firestore → Índices) hasta que todos
  queden `Enabled` — nunca avanzar con alguno en `Building`.

**Gate de salida del Paso 1:**

```bash
npx tsx scripts/verificar-activacion-mt-u3.ts
```

Este script (nuevo, Capa 5) prueba cada índice de `firestore.indexes.json` ejecutando una
query real equivalente (`orderBy` encadenado, `limit(1)`, sin escribir nada). Si reporta
algún índice `NO LISTO`, **no avanzar al Paso 2** — esperar a que termine el build.

---

## 3. Paso 2 — Backfill (dry-run → revisión → `--execute`)

### 3.1 Dry-run (ya aprobado en Capa 0; re-confirmar si pasó tiempo desde entonces)

```bash
npx tsx scripts/migrate-mt-u3-operativo.ts
```

Revisar el reporte completo por colección (`examinados`/`tocados`/`saltados`/`anomalías`).
**Cualquier anomalía reportada bloquea el `--execute`** hasta investigarla manualmente
(MT-U1 §5 paso 7) — nunca se sobreescribe un `empresaId` inesperado.

### 3.2 Gate automatizado (Capa 5)

```bash
npx tsx scripts/verificar-activacion-mt-u3.ts
```

El mismo comando del Paso 1 también verifica (b): cero anomalías de `empresaId` en las 25
colecciones oficiales, vía `count()` — un chequeo más rápido que el dry-run completo
(no pagina), pensado para repetirse justo antes de `--execute` sin volver a correr el
reporte detallado entero. Si el dry-run del 3.1 no reportó anomalías, este gate debe
coincidir en cero.

**Si el gate PRE completo (índices + anomalías) no es ✅, no continuar.**

### 3.3 Ejecución real

```bash
npx tsx scripts/migrate-mt-u3-operativo.ts --execute
```

- Idempotente: si falla a mitad de camino, simplemente re-ejecutar.
- Revisar el resumen final: `anomalías == 0` y `errores == 0` antes de continuar. Si hay
  errores de escritura/lectura, es seguro re-ejecutar (idempotente) — no avanzar al Paso 3
  hasta que el resumen esté limpio.

---

## 4. Paso 3 — Deploy del código (Capas 1–4)

Deploy del build que contiene:
- `lib/tenant.ts` / `lib/tenant-context.ts` (Capa 1)
- Ledger + kardex estampando `empresaId` (Capa 2)
- Los 24 servicios migrados con `tenantQuery`/`stampEmpresaId`/`withEmpresaId` (Capa 3)
- `app/api/reservas/hold`, `app/api/reservas/disponibilidad`, webhook de Wompi con
  propagación de `empresaId` (Capa 4)

**Inmediatamente después** del Paso 2 (backfill `--execute`), sin ventana intermedia —
es la regla de orden dura de §0. En la práctica esto significa: el backfill y el deploy
del código se planean como una sola operación de mantenimiento, no como dos eventos
separados en el tiempo.

---

## 5. Paso 4 — Verificación post-activación

### 5.1 Gate automatizado — `docs sin empresaId == 0`

```bash
npx tsx scripts/verificar-activacion-mt-u3.ts --post
```

Por cada una de las 25 colecciones oficiales: `count(total) == count(where empresaId ==
fundacional)`. Cualquier discrepancia (`huérfanos != 0`) indica documentos escritos durante
la ventana del despliegue que no pasaron por el backfill ni por el código ya-estampado —
investigar antes de dar la activación por cerrada.

### 5.2 Regresión manual del POS (no automatizable desde este runbook)

Checklist mínimo de §9 Capa 5 — verificar cada flujo produce resultado idéntico al de
antes de activar:

- [ ] Venta simple (efectivo/transferencia/tarjeta) y venta mixta.
- [ ] Apertura y cierre de turno (incluye relevo).
- [ ] KDS: comanda nueva, adición, cancelación.
- [ ] Salón: separar cuenta, unir cuentas, trasladar cuenta.
- [ ] **Reserva pública nueva post-activación** (`/reservar` → hold → pago simulado o real
      → confirmación): verificar que la reserva y la agenda creadas por
      `/api/reservas/hold` traen `empresaId` correcto, y que `suscribirReservasActivas`
      (POS/Admin) la ve con normalidad.
- [ ] Cancelación de un hold expirado (limpieza automática vía `cancelarReserva`).
- [ ] Inventario: ajuste manual de stock, compra, merma — kardex refleja el movimiento.

**Ninguno de estos pasos tiene un script asociado en este runbook** — es intencional: son
verificación funcional, no de datos, y automatizarlos pertenece a un esfuerzo de testing
end-to-end fuera del alcance de MT-U3.

---

## 6. Rollback (si algo falla después del Paso 2)

Ver `MT-U3-CAPA0-operacion-scripts.md` §2 para el detalle de uso. Resumen de la decisión
que hay que tomar en el momento:

| Momento del fallo | Acción |
|---|---|
| Falla el backfill (Paso 3.3) antes de completar | Re-ejecutar `--execute` (idempotente). No revertir. |
| Falla el backfill y se decide no continuar con la activación | `rollback-mt-u3-operativo.ts --execute` — **seguro únicamente si el código de Capas 2/3 aún NO está desplegado** (ver limitación documentada en la cabecera del script). |
| El código ya se desplegó (Paso 4) y aparece una regresión | **No usar el rollback del backfill** — a partir de este punto ya no puede distinguir datos del backfill de datos legítimos nuevos. Revertir el **deploy del código** (Capas 1–4) primero; el backfill puede quedar aplicado sin problema (es un no-op para el sistema en modo mono-tenant anterior). |

---

## 7. Qué NO cubre este runbook (fuera de alcance de MT-U3)

- Activar una segunda empresa (MT-U11) — el mecanismo `esFundacional` de las rutas
  públicas de reservas (§4.6 del diseño) deberá reemplazarse antes de ese momento.
- `firestore.rules` (MT-U4) — este runbook activa el aislamiento de **aplicación**
  (Capas 1-4), no la red de seguridad dura de reglas.
- Migración de `configuracion` a `configuraciones/{empresaId}` (MT-U6).
- Cualquier paso de despliegue de infraestructura ajeno a Firestore (hosting, funciones,
  variables de entorno) — se asume gestionado por el proceso de deploy existente del
  proyecto.
