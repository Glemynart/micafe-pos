# ADR-SAAS-097 — Bodega MVP-1: ventas retail Nevera, FIFO y cuenta de control

## Estado

**ACEPTADO — 2026-10-27.** El responsable aprobó la Alternativa A. Autoriza
implementar y probar el contrato en PRs; no autoriza crear eventos de apertura,
registrar ventas, modificar datos/Rules ni desplegar recursos remotos.

- **Fecha de propuesta:** 2026-10-27.
- **Fecha de aceptación:** 2026-10-27.
- **Goal:** `G-SAAS-02` → `M2` → `E2.2`.
- **Relacionados:** ADR-SAAS-091, ADR-SAAS-094 y ADR-SAAS-096.
- **Supersede parcialmente:** ADR-SAAS-091 solo respecto del origen del cargo
  de control Nevera: en vez de requerir un traslado Bodega→Nevera, la entrada
  directa positiva de stock Nevera genera el cargo interno correspondiente.
  No altera ventas a crédito de clientes Bodega ni pagos reales.

## Contexto

ADR-SAAS-094 separa los catálogos Bodega y Nevera. ADR-SAAS-096 aprobó registrar
el inventario directamente en Nevera con costo por unidad base, sin tocar
Bodega. ADR-SAAS-091 exige que la mercancía bajo control de Nevera tenga cargos
y abonos internos al costo y que la venta retail reconozca el ingreso una sola
vez.

La carga inicial de productos y existencias fue reportada como completada por
el responsable. El código vigente no implementa ventas Nevera. El ledger actual
conserva los movimientos y el costo unitario, pero deja `loteId` y
`capasConsumidasDetalle` en `null`; por ello todavía no demuestra costo FIFO ni
un saldo de control reconstruible para el stock ya cargado.

## Decisión aceptada

Separar tres registros relacionados, todos tenant-aware y server-authoritative:

1. **Stock y ledger:** `movimientos_inventario` sigue siendo la fuente del saldo
   físico. Cada entrada positiva Nevera crea dentro de la misma transacción una
   capa FIFO identificada por su `movimientoId`, con cantidad, costo COP por
   unidad base y secuencia del artículo. Cada salida consume capas FIFO y
   conserva en el movimiento los IDs/cantidades/costos de las capas consumidas.
2. **Cuenta de control:** agregar eventos append-only en
   `cuentas_control_nevera_movimientos`, con `empresaId`, catálogo `NEVERA`,
   tipo, importe COP, actor, fecha de servidor, `commandId`, referencia única
   al movimiento/venta y detalle por producto/capa. El saldo de control es la
   suma de cargos menos abonos por venta y ajustes de salida autorizados. Un
   resumen mutable, si se necesita por rendimiento, es solo una proyección
   transaccional reconstruible desde esos eventos.
3. **Venta retail:** un comando idempotente valida tenant, membresía y permiso
   `sell`; que producto, presentación y oferta estén activos y pertenezcan a
   Nevera; precio consumidor final vigente; pago permitido; reservas y
   existencia. En una sola transacción registra la venta pagada en efectivo o
   transferencia, consume el stock Nevera por FIFO y añade un abono de control
   igual al costo FIFO vendido. No crea una cuenta por cobrar externa ni toca
   Bodega. No hay fallback de precio o inventario al catálogo Bodega.

Una venta retail suma sus ingresos una sola vez. El abono de la cuenta interna
es una rendición al costo y no un segundo ingreso ni un pago capturado del
consumidor. El reporte distingue efectivo/transferencia retail de los cargos,
abonos y ajustes internos de Nevera.

### Entradas y ajustes de inventario

- Cada incremento directo de stock exige costo positivo por unidad base y
  produce atómicamente: movimiento positivo, capa FIFO y cargo de control por
  `cantidad × costoUnitarioCOP`.
- Una disminución administrativa debe indicar motivo, consumir las capas
  correspondientes y producir un evento `AJUSTE_SALIDA`; no se presenta como
  efectivo recibido ni como abono de cliente.
- Los costos, tenant, catálogo, saldo, FIFO, importe y snapshots se resuelven
  en servidor. Las escrituras directas del cliente a capas, ventas, eventos y
  proyecciones quedan denegadas por Rules.

### Reconciliación del stock ya cargado

Antes de habilitar ventas, ejecutar un preflight remoto **solo de lectura** que
reconstruya cantidades y capas desde el ledger de Nevera, ordenado por secuencia
del artículo, y compare el saldo reconstruido con cada producto actual.

- Si todo el historial está disponible y la reproducción coincide exactamente,
  una operación de apertura versionada e idempotente crea las capas restantes
  y un evento `CARGO_APERTURA` por su costo exacto, referenciado a los
  movimientos fuente. No modifica cantidades ni precios.
- Si falta un movimiento, el costo no es positivo, hay secuencias ambiguas o
  la reproducción no coincide con el saldo, se bloquean las ventas Nevera. El
  sistema no inventa una capa a partir del último costo del producto; se
  requiere reconciliación y una apertura autorizada basada en existencias y
  costo confirmados.
- Ejecutar la apertura en producción requerirá preflight/corte operativo y
  autorización propios, aunque se apruebe este ADR.

## Alternativas

### A. Reconstruir la apertura desde el ledger completo (recomendada)

Conserva los costos históricos por entrada y permite comprobar el saldo actual
antes de habilitar ventas. Falla de forma cerrada si el historial no alcanza
para una reconstrucción exacta.

### B. Crear una sola capa de apertura con el costo actual del producto

Es más simple, pero puede perder la composición FIFO del stock ya cargado e
inventar el costo histórico de unidades ingresadas a precios distintos. Se
rechaza como comportamiento automático.

### C. Esperar un conteo y costo inicial confirmados por Diana

Es la alternativa segura si el ledger no permite la reconstrucción, aunque
retrasa ventas Nevera. Es el fallback de A; el sistema no debe completar la
apertura con valores supuestos.

## Esquema e idempotencia mínimos

- **Capa FIFO:** ID único derivado del `movimientoId` positivo; incluye
  `empresaId`, `productoId`, `catalogoId`, `secuenciaArticulo`, unidades
  iniciales/restantes y `costoUnitarioCOP`. El restante es una proyección
  transaccional; cada consumo conserva un evento inmutable referenciado por
  venta, línea y capa.
- **Evento de control:** ID determinista por `commandId` y tipo de evento;
  campos mínimos: `schemaVersion`, `empresaId`, `catalogoId`, `tipo`, `importeCOP`,
  `actorUid`, `creadoEn`, referencia de origen y líneas con producto, cantidad,
  costo y capas. Repetir el mismo comando devuelve su recibo; una huella
  distinta falla sin efectos parciales.
- **Venta:** snapshots inmutables de producto, presentación, cantidad base,
  precio vigente/oferta, medio de pago, costo FIFO, capas consumidas y actor.
  Los importes se guardan en COP enteros y se validan contra overflow.

## Límites de autoridad y compatibilidad

- Admin gestiona stock y ajustes Nevera conforme a ADR-SAAS-096. Los usuarios
  con `sell` pueden registrar ventas retail Nevera; el servidor deriva tenant,
  actor y permisos de Auth/membresía.
- Los productos, presentaciones, precios y ofertas Nevera permanecen aislados
  de Bodega conforme a ADR-SAAS-094. Una oferta se resuelve por catálogo y
  presentación; nunca altera el precio base ni el otro catálogo.
- Las ventas y pagos Bodega existentes, cuentas por cobrar de clientes y
  snapshots históricos permanecen sin cambios. Los eventos Nevera no son
  facturas, compras a proveedor, egresos, deuda de un cliente externo ni
  declaración fiscal.

## Criterios de aceptación

1. El preflight de apertura detecta faltantes, duplicados, secuencias ambiguas,
   costos inválidos y diferencias de saldo; no escribe datos.
2. Una apertura reproducible conserva cantidades y precios, crea capas/eventos
   exactamente una vez y repetirla es no-op.
3. Entradas directas positivas crean stock, capa y cargo atómicamente; un fallo
   de cualquiera deja todos sin cambios.
4. Ventas concurrentes no sobre-venden stock; reintentos idénticos no duplican
   venta, pago, movimiento, consumo FIFO o abono.
5. El costo y abono coinciden con las capas FIFO exactas incluso para
   presentaciones con factor mayor que uno; ninguna cifra se redondea de forma
   que altere el total COP.
6. Una venta Nevera usa solo precio, oferta y stock Nevera; precios ausentes,
   presentaciones cruzadas, stock insuficiente y payload cross-tenant fallan
   sin mutaciones.
7. El ingreso retail y su medio de pago se registran una vez; el abono interno
   solo reduce el saldo de control al costo FIFO. `AJUSTE_SALIDA` es distinto
   de pago y requiere actor admin y motivo.
8. Rules niegan escrituras directas y lecturas no autorizadas de capas/eventos;
   pruebas de Functions/Emulator cubren roles, tenant, catálogo, ofertas,
   idempotencia, atomicidad, doble submit, concurrencia y rollback de
   transacciones.
9. Pruebas UI cubren venta Bodega sin regresión, venta Nevera, precio/oferta,
   medio de pago y mensajes de stock/costo no vendible.

## Riesgos y recuperación

- Si la apertura no se puede reconstruir, Nevera queda visible para inventario
  pero sus ventas se mantienen deshabilitadas hasta reconciliar costo y saldo.
- Un cambio de código no revierte ventas, pagos, movimientos o eventos. La
  recuperación detiene ventas nuevas, conserva el ledger y corrige errores
  solo con movimientos compensatorios idempotentes autorizados.
- Rules, Functions y App Hosting se despliegan por separado después de CI,
  Emulator, preflight de compatibilidad y autorización operativa. Este ADR no
  certifica el release ni autoriza ese corte.

## Registro de aceptación

El responsable respondió **«Aprobar alternativa A (Recomendada)»** el
2026-10-27. Queda aprobado que las entradas directas positivas de stock generen
capa FIFO y cargo interno al costo; que las ventas retail Nevera consuman FIFO y
generen un abono interno por el costo vendido; y que la apertura inicial se
reconstruya desde el ledger completo, sin inventar costos si la conciliación no
cuadra. Un ajuste de salida autorizado se registra separado de cualquier pago.

La aceptación habilita la implementación en código y las pruebas locales y de
Emulator. El preflight y eventual apertura en Firebase, el despliegue y la
activación de ventas son gates operativos independientes.
