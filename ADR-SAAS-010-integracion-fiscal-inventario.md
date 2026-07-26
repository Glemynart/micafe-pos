# ADR-SAAS-010 — Integración transaccional y contrato de estado operativo entre dominio Fiscal y dominio Inventario

## Estado

Aceptado. Especificación arquitectónica definitiva para la integración de B2 (Fiscal Core) con el dominio Operativo (Ledger / Tesorería) en B7-IMP.

---

## 1. Contrato formal de `estadoOperativo`

### 1.1 Propósito
El campo `estadoOperativo` en la entidad `Venta` representa el ciclo de vida y fase de aplicación de los efectos colaterales (descuento de inventario en el Ledger, acreditación de tesorería en `cuentas_bancarias` y registros en `transacciones_financieras`) tras la confirmación de emisión fiscal.

### 1.2 Valores permitidos
- **`PENDIENTE_EFECTOS`**: La venta fiscal ha sido confirmada atómicamente en backend (Fase 1: número asignado, `snapshotFiscal` inmutable incrustado). La venta es válida fiscalmente, pero sus efectos operativos en inventario y tesorería no han sido aplicados aún.
- **`COMPLETO`**: Fase 2 finalizada con éxito. El inventario (Ledger) ha sido descontado, la tesorería acreditada y la venta marcada como `COMPLETO` en una **única transacción atómica de Firestore**.
- **`ANULADA_SIN_EFECTOS`**: La venta fiscal fue anulada mediante solicitud explícita antes de haber aplicado los efectos operativos. No se emitieron movimientos al Ledger ni a tesorería.
- **`ANULADA_CON_EFECTOS`**: La venta fue anulada después de haber alcanzado el estado `COMPLETO`. El inventario fue devuelto al Ledger y el dinero fue debitado de tesorería de forma compensatoria.

### 1.3 Invariantes del Dominio Operativo (OPE-01 a OPE-09)
- **OPE-01:** Ningún reporte comercial, balance de utilidades ni cierre de caja contabiliza ventas en estado `PENDIENTE_EFECTOS` ni `ANULADA_*`.
- **OPE-02:** Los movimientos de inventario (`movimientos_inventario`) y tesorería (`transacciones_financieras`) se emiten una sola vez por venta (`claveIdempotencia` determinista).
- **OPE-03:** Una venta en `PENDIENTE_EFECTOS` jamás devuelve inventario ni debita dinero al ser anulada.
- **OPE-04:** La transición `PENDIENTE_EFECTOS -> COMPLETO` solo puede ser ejecutada si el descuento de inventario, la acreditación de tesorería y la actualización de `estadoOperativo = "COMPLETO"` ocurren dentro de la **misma transacción atómica Firestore**.
- **OPE-05:** El valor por defecto al crear la venta en `ConfirmarVentaFiscal` (Cloud Functions) es irreductiblemente `PENDIENTE_EFECTOS`.
- **OPE-06:** La transición a `COMPLETO` requiere que la venta esté previa y exactamente en `PENDIENTE_EFECTOS`.
- **OPE-07:** La anulación fiscal (`AnularVentaFiscal`) genera un registro inmutable pero no reescribe el `snapshotFiscal` original.
- **OPE-08:** `ANULADA_SIN_EFECTOS` y `ANULADA_CON_EFECTOS` son estados terminales inmutables.
- **OPE-09 (Estrategia Única Post-Cutover):** Tras la ejecución bloqueante del Backfill de B7, el 100% de las ventas en la base de datos poseen `estadoOperativo` explícito. Todas las consultas del sistema utilizan estrictamente `where("estadoOperativo", "==", "COMPLETO")`.

### 1.4 Máquina de Estados y Transiciones Válidas

```text
               ┌───────────────────────┐
               │    ConfirmarVenta     │
               └───────────┬───────────┘
                           │ (Creación Backend - Fase 1)
                           ▼
               ┌───────────────────────┐
               │   PENDIENTE_EFECTOS   │
               └───────┬───────┬───────┘
                       │       │
       (Aplicar Fase 2)│       │ (Anulación Explícita Pre-Efectos)
                       ▼       ▼
       ┌──────────────────┐  ┌───────────────────────┐
       │     COMPLETO     │  │  ANULADA_SIN_EFECTOS  │
       └────────┬─────────┘  └───────────────────────┘
                │
                │ (Anulación Post-Efectos)
                ▼
       ┌──────────────────┐
       │ANULADA_CON_EFECTOS│
       └──────────────────┘
```

| Estado Origen | Estado Destino | Actor / Ejecutor | Condición / Disparador |
|---|---|---|---|
| *(Nulo)* | `PENDIENTE_EFECTOS` | Cloud Function (`confirmarVentaFiscal`) | Confirmación atómica de venta fiscal (Fase 1). |
| `PENDIENTE_EFECTOS` | `COMPLETO` | Cliente POS / Worker Reconciliador | Transacción atómica de Ledger + Tesorería + Estado (Fase 2). |
| `PENDIENTE_EFECTOS` | `ANULADA_SIN_EFECTOS` | Usuario (Admin/Cajero) | Anulación explícita antes de aplicar efectos de inventario/tesorería. |
| `COMPLETO` | `ANULADA_CON_EFECTOS` | Usuario (Admin/Cajero) | Anulación con reversión compensatoria de Ledger y Tesorería. |

---

## 2. Estrategia única de compatibilidad para ventas históricas

### 2.1 Backfill Bloqueante Pre-Cutover
Para evitar mantener código ambiguo o bifurcaciones con `undefined/null` en los consumidores principales:

1. El Backfill de B7 es un **prerrequisito obligatorio y bloqueante** que se ejecuta durante la ventana de despliegue antes de habilitar el cutover.
2. El script de backfill recorre la totalidad de ventas históricas pre-B7 y les asigna explícitamente:
   - `estadoOperativo: "COMPLETO"` si la venta no estaba anulada.
   - `estadoOperativo: "ANULADA_CON_EFECTOS"` si la venta estaba anulada en el modelo legacy.

### 2.2 Consultas Unificadas en Consumidores
Al estar la base de datos 100% homogeneizada tras el backfill, todos los servicios (`turnos-service`, `reportes-service`, `cuentas-cobro-service`) utilizarán **únicamente** la condición estructural directa de Firestore:
`where("estadoOperativo", "==", "COMPLETO")`.

El helper `esVentaCompletada(venta)` queda simplificado a la verificación estricta:
`venta?.estadoOperativo === "COMPLETO"`.

---

## 3. Política del Reconciliador Operativo y fundamentación de retenciones

### 3.1 Fundamentación del Valor Fiscal sobre el Tiempo
Una venta fiscal confirmada en Fase 1 (`ConfirmarVentaFiscal`) ha consumido un número consecutivo y generado una factura legal inmutable (`snapshotFiscal`). Por tanto:
- **No se anula automáticamente por el paso del tiempo.** Si una terminal POS pierde conexión a internet o se apaga durante horas/días, el Reconciliador **no anulará la factura emitida**.
- Cuando la terminal vuelve a conectarse o se reabre el turno, la Fase 2 se ejecuta y promueve la venta a `COMPLETO`, garantizando que el dinero y el inventario correspondan a la factura emitida.

### 3.2 Política del Reconciliador y Manejo de Inconsistencias Operativas
1. **Intento de Conciliación:** El Reconciliador (cliente POS o Cloud Function) intenta aplicar la Fase 2 atómica (Ledger + Tesorería).
2. **Si el Inventario tiene incidencias (Ej: Stock bajo cero):** El Ledger aplica el descuento registrando la incidencia en el historial o permitiendo saldo negativo transitorio, y la venta pasa a `COMPLETO`. Una venta fiscal cobrada jamás se bloquea por falta de inventario en la Fase 2.
3. **Alerta Operativa (15 Minutos Configurable):**
   - Si una venta permanece en `PENDIENTE_EFECTOS` durante más de 15 minutos (parámetro `tiempoAlertaPendiente` en la configuración de caja), la interfaz del POS despliega una notificación visible de *"Venta pendiente de conciliación operativa"*.
   - Esto permite al cajero forzar la conciliación manualmente desde la UI si ocurrió un fallo de red en la terminal.
4. **Criterio para `ANULADA_SIN_EFECTOS`:**
   - Ocurre exclusivamente mediante acción explícita de un usuario autenticado (cajero/admin) desde la UI de anulaciones, o mediante la notificación de rechazo definitivo de una pasarela de pago (ej. Wompi webhook cancelado).

---

## 4. Contrato formal del Script de Backfill (`b7-ejecutar-backfill-fundacional.ts`)

Como herramienta crítica de producción, el script de backfill cumple los siguientes principios:

### 4.1 Idempotencia y Reejecución Segura
- **Guarda de Selección:** El script realiza consultas por lotes procesando únicamente ventas que carezcan de `estadoOperativo` (`where("estadoOperativo", "==", null)` o verificación de campo ausente).
- **Ejecución Parcial / Reintentos:** Si el script se interrumpe tras actualizar el 50% de las ventas, reejecutarlo retomará exactamente las ventas faltantes sin duplicar mutaciones ni sobrescribir ventas ya procesadas.

### 4.2 Lotes y Control de Rendimiento (*Batched Writes*)
- Utiliza `db.batch()` en bloques de **500 documentos** (límite del SDK de Firestore), minimizando el impacto en cuotas de lectura/escritura y evitando bloqueos de memoria.

### 4.3 Registro de Auditoría y Verificación Post-Backfill
- Al finalizar, el script registra un documento inmutable en `migraciones_log/b7_backfill_ventas` con la fecha, total de documentos escaneados, total de documentos actualizados y estado final (`EXITOSO`).
- **Comando de Verificación (`--verify`):** Incluye un flag `--verify` que realiza un escaneo de solo lectura confirmando que el resultado de ventas sin `estadoOperativo` en toda la base de datos sea estrictamente **0**.

---

## 5. Atomicidad estricta y control de concurrencia en la Fase 2

### 5.1 Garantía de Atomicidad en la Fase 2
La aplicación de la Fase 2 ocurre dentro de un `runTransaction` que agrupa tres operaciones inseparables:

```typescript
await runTransaction(db, async (tx) => {
  // 1. LECTURAS (reads-before-writes)
  const ventaSnap = await tx.get(ventaRef);
  if (!ventaSnap.exists()) throw new Error("Venta no encontrada");
  const venta = ventaSnap.data();

  // Guarda de Concurrencia / Idempotencia
  if (venta.estadoOperativo !== "PENDIENTE_EFECTOS") {
    return; // Ya fue completada o anulada por otro proceso. Retorno limpio (idempotente).
  }

  // 2. ESCRITURAS ATÓMICAS (Fase 2)
  // A. Ledger de Inventario
  await aplicarMovimientosEnTransaccion(tx, movimientosInventario);

  // B. Tesorería (Cuentas Bancarias + Transacciones Financieras)
  registrarMovimientosTesoreriaEnTransaccion(tx, venta);

  // C. Cambio de Estado Operativo de la Venta
  tx.update(ventaRef, {
    estadoOperativo: "COMPLETO",
    efectosAplicadosEn: serverTimestamp(),
  });
});
```

---

## 6. Validación en Firestore Rules (`firestore.rules`)

Las reglas de seguridad de Firestore imponen el contrato de estados para impedir modificaciones arbitrarias desde el cliente:

```javascript
match /ventas/{ventaId} {
  allow read: if puedeLeerTenant() && esAutenticado();
  allow create: if false;

  allow update: if puedeActualizarEnTenant() && esCajeroOAdmin() && (
    // 1. Transición Fase 2: PENDIENTE_EFECTOS -> COMPLETO
    (
      resource.data.estadoOperativo == 'PENDIENTE_EFECTOS' &&
      request.resource.data.estadoOperativo == 'COMPLETO' &&
      request.resource.data.snapshotFiscal == resource.data.snapshotFiscal &&
      request.resource.data.consecutivo == resource.data.consecutivo
    ) ||
    // 2. Anulación Pre-Efectos: PENDIENTE_EFECTOS -> ANULADA_SIN_EFECTOS
    (
      resource.data.estadoOperativo == 'PENDIENTE_EFECTOS' &&
      request.resource.data.estadoOperativo == 'ANULADA_SIN_EFECTOS' &&
      request.resource.data.estado == 'anulada'
    ) ||
    // 3. Anulación Post-Efectos: COMPLETO -> ANULADA_CON_EFECTOS
    (
      resource.data.estadoOperativo == 'COMPLETO' &&
      request.resource.data.estadoOperativo == 'ANULADA_CON_EFECTOS' &&
      request.resource.data.estado == 'anulada'
    )
  );

  allow delete: if false;
}
```

---

## 7. Inventario exhaustivo de consumidores y adaptación obligatoria

| Consumidor | Archivo / Función | Regla de Adaptación Obligatoria B7 (Post-Backfill) |
|---|---|---|
| **Cierre de Turno** | `lib/turnos-service.ts` (`calcularVentasTurno`) | Consulta estructurada `where("estadoOperativo", "==", "COMPLETO")`. |
| **Reportes Comerciales** | `lib/reportes-service.ts` (`generarReporte`) | Consulta estructurada `where("estadoOperativo", "==", "COMPLETO")`. |
| **Anulaciones** | `lib/ventas-service.ts` (`anularVenta`) | Máquina de estados según `estadoOperativo` (Ver Sección 8). |
| **Historial de Ventas** | `lib/ventas-service.ts` (`suscribirHistorialVentas`) | Renderiza según `estadoOperativo` (`Completada`, `Pendiente de efectos`, `Anulada`). |
| **Cuentas por Cobrar** | `lib/cuentas-cobro-service.ts` (`obtenerCuentasCobro`) | Consulta estructurada `where("estadoOperativo", "==", "COMPLETO")`. |

---

## 8. Flujo formal de Anulaciones por `estadoOperativo`

```typescript
switch (venta.estadoOperativo) {
  case "PENDIENTE_EFECTOS":
    // ANULACIÓN PRE-EFECTOS:
    // 1. NO toca el Ledger (no devuelve inventario porque nunca se descontó).
    // 2. NO toca cuentas_bancarias (no devuelve dinero porque nunca ingresó).
    // 3. Transiciona venta.estadoOperativo = "ANULADA_SIN_EFECTOS".
    // 4. Marca venta.estado = "anulada".
    break;

  case "COMPLETO":
    // ANULACIÓN POST-EFECTOS (COMPENSATORIA):
    // 1. Lee los ítems de la venta.
    // 2. Ejecuta aplicarMovimientosEnTransaccion para SUMAR inventario (devolución).
    // 3. Debita cuentas_bancarias y registra transacción financiera de egreso.
    // 4. Transiciona venta.estadoOperativo = "ANULADA_CON_EFECTOS".
    // 5. Marca venta.estado = "anulada".
    break;

  case "ANULADA_SIN_EFECTOS":
  case "ANULADA_CON_EFECTOS":
    throw new Error("La venta ya ha sido anulada previamente.");
}
```
