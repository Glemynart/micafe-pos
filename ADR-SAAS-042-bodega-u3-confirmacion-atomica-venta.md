# ADR-SAAS-042 — Bodega U3: confirmación atómica de venta

## Estado

**Aceptado e implementado hasta U3-C.** U3-A cerró contrato y autoridad, U3-B la resolución comercial y stock estricto, y U3-C publicó la confirmación atómica mediante PR #387. La compensación/anulación Bodega permanece fuera de alcance en U3-E.

- **Goal rector:** `G-SAAS-02`.
- **Milestone:** `M2 — Provisioning y onboarding`.
- **Epic:** `E2.2 — Configuración inicial`.
- **Relación:** ADR-SAAS-041 conserva la autoridad del vertical Bodega MVP-1; este ADR define exclusivamente la confirmación atómica de sus ventas.

## Decisión

La futura callable `confirmarVentaBodegaV1` será una frontera server-authoritative y ejecutará un único comando idempotente dentro de una transacción Firestore. U3-A no publica esa callable ni crea ventas: fija y prueba su contrato, autoridad y guard de anulación. U3-B resolverá cliente, producto y presentación; U3-C materializará la venta y sus efectos; U3-E implementará su compensación.

La entrada aceptada es exactamente:

```ts
{
  commandId: string, idempotencyKey: string, correlationId: string,
  causationId: string | null,
  payload: {
    clienteId: string,
    lineas: Array<{ productoId: string, presentacionId: string, cantidad: number }>,
    metodoPago: "efectivo" | "transferencia"
  }
}
```

El validador es allowlist y fail-closed: rechaza `empresaId`, `ventaId`, precio, factor, costo, impuestos, subtotales, total, stock, cuenta, turno, cantidad base y snapshots. `cantidad` es un entero positivo seguro; U3-B rechazará además cualquier multiplicación de factor, precio o costo que deje de ser un entero seguro.

## Modelo de línea persistida

```ts
schemaVersion: "BODEGA_MVP1_V1"

productoId; productoNombreSnapshot; unidadBaseSnapshot
presentacionId; presentacionNombreSnapshot
cantidadPresentaciones; factorUnidadBase; cantidadUnidadBase
precioPresentacionCOP; subtotalCOP
costoUnidadBaseCOP; costoPresentacionCOP; costoTotalLineaCOP

// Compatibilidad comercial legacy
id; nombre; cantidad; precioUnitario; subtotal; costoUnitario
```

`cantidadUnidadBase = cantidadPresentaciones × factorUnidadBase`. Factor, precio y costo son hechos resueltos únicamente por el servidor desde U2-B; inventario consumirá exclusivamente `cantidadUnidadBase`. La anulación futura usará snapshots persistidos, nunca presentación o configuración vigente.

## Autoridad

Antes de materializar efectos, y dentro de la transacción, se reutiliza `revalidarAutoridadFinancieraEnTransaccion` para releer empresa operativa, membresía activa y permiso `sell`. La capa Bodega exige además rol exacto `vendedor`, `vertical: BODEGA_MVP1` y capability `sell` habilitada en `configuraciones/{empresaId}`. El contexto inicial se deriva de Auth y membresía; ningún `empresaId` llega desde el comando.

## Presupuesto técnico y límite

`MAX_LINEAS_BODEGA_U3 = 50`, validado antes de abrir la transacción. En el peor caso U3-C tendrá aproximadamente 9 lecturas fijas (recibos/idempotencia, empresa, membresía, configuración, cliente, cuenta y turno) y hasta 5 por línea: producto, presentación, idempotencia de movimiento, inventario y, cuando `secuenciaLedger === 0` con stock inicial, la comprobación de la apertura lazy del ledger. Por tanto el máximo ejecutable es `9 + 5×50 = 259` lecturas. Tendrá hasta 6 escrituras fijas (venta, movimiento financiero/cuenta y recibo, índice y auditoría) y 3 por línea (movimiento de inventario, posible inicialización y actualización de producto): `6 + 3×50 = 156` documentos escritos. Como presupuesto conservador se reservan otras tres operaciones por línea para timestamps/metadatos, `6 + 6×50 = 306`, aún bajo el límite de 500 escrituras. U3-C también verificará el tamaño serializado de los snapshots antes de escribir, de modo que datos administrativos anómalamente extensos no puedan violar los límites de 1 MiB por documento y 10 MiB por petición de transacción.

## Anulación

La anulación genérica debe rechazar, antes de cualquier lectura de cuenta, movimiento o escritura, toda venta cuya `schemaVersion` sea `BODEGA_MVP1_V1`, con `ANULACION_BODEGA_NO_DISPONIBLE`. La ruta existente no conoce `cantidadUnidadBase`; permitirla corrompería una futura restitución de stock. La compensación específica pertenece únicamente a U3-E.

## Fuera de alcance

U3-A no crea ventas, movimientos de inventario o tesorería, cuentas, turnos, recibos de venta ni auditoría de venta; tampoco añade checkout, carrito, UI/PWA, crédito, cartera, despacho, tenant, usuarios, datos reales o despliegues.

## Evidencia de implementación

- PR #385 materializó U3-A; PR #386 materializó U3-B; PR #387 materializó U3-C en `origin/main @ 93f8819c7d9f58c0f6dc85e0f5daf04d23961df8`.
- `confirmarVentaBodegaV1` conserva sin cambios el envelope cerrado de este ADR y deriva tenant, autoridad, hechos comerciales, cuenta y turno exclusivamente en servidor.
- Para materializar la garantía de ADR-SAAS-041 sobre ventas propias, el documento de venta registra `cajeroId` desde `actorUid` server-side. `cajeroId` no forma parte del payload ni puede ser suministrado o sobrescrito por el cliente; no se introduce `vendedorId` ni una segunda relación comercial.
- La evidencia automatizada cubre efectivo con turno propio, transferencia sin turno, resolución de cuenta canónica, stock atómico, idempotencia y proyección sanitizada de las ventas propias del actor.
