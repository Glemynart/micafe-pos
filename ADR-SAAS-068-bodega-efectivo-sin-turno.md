# ADR-SAAS-068 — Venta en efectivo Bodega sin turno obligatorio

## Estado

**PROPUESTO — pendiente de aprobación explícita del responsable.**

- **Fecha de propuesta:** 2026-10-10.
- **Goal:** `G-SAAS-02` → `M2` → `E2.2`.
- **Decisor:** responsable del proyecto. **Recomendación técnica:** Lead Engineer.
- **Relacionados:** ADR-SAAS-041, ADR-SAAS-042, ADR-SAAS-062 y la arquitectura
  server-authoritative R1.
- **Límite:** esta propuesta no cambia código, no sustituye por sí sola ADRs
  aceptados y no autoriza staging, producción ni cambios de datos.

## Contexto

El responsable confirmó que la administradora y dos vendedoras deben poder
registrar ventas en efectivo sin abrir un turno solo para cobrar, ingresando
cuánto dinero físico recibieron. La aplicación actual bloquea “Confirmar venta”
en el POS vendedor y en la venta directa de administración cuando no hay turno
abierto. La callable también resuelve el turno propio dentro de la transacción
para pagos en efectivo. El contrato actual de venta no incluye el monto
recibido; el servidor registra un ingreso por el total canónico en `caja-principal`.

El turno tiene una función de control, no solo de desbloqueo de UI: conserva
base de apertura, movimientos asociados y un cierre que compara efectivo
contado con el esperado. El cierre consulta exclusivamente ventas y
movimientos con su `turnoId`. Por tanto, una venta con `turnoId: null` no puede
presentarse como conciliada por el cierre de un turno. `writeMovement` ya
admite `turnoId: null` para movimientos que no pertenecen a un turno, pero eso
no define por sí solo cómo se audita efectivo recibido ni cómo se comunica el
alcance del cierre.

ADR-SAAS-062 permanece vigente para la solicitud y aprobación previa: el
servidor deriva cliente, líneas, precio y total; conserva la aprobación de un
solo uso; y vuelve a validar inventario al confirmar. La decisión aquí solo
afectaría la precondición de turno y los datos de pago en la confirmación
canónica. No cambia reservas, autorización, precios ni el momento de registrar
venta, inventario y ledger.

## Problema de decisión

¿Se mantiene el turno obligatorio, se permite cobrar sin turno manteniendo el
registro transaccional por venta, o se crea un nuevo ciclo de apertura/cierre
de caja compartida que sustituya los turnos individuales?

La propuesta debe preservar la autoridad financiera server-side y hacer
explícito que el cierre de un turno no concilia ventas que no pertenecen a ese
turno.

## Requisitos confirmados y límites

- Un miembro con membresía vigente, rol autorizado y permiso `sell` puede
  confirmar una venta Bodega en efectivo sin abrir un turno.
- El POS solicita el valor recibido. La venta, el total y el cambio siempre
  los calcula o valida el servidor desde el catálogo y el pago canónicos.
- La aprobación previa de ADR-SAAS-062 sigue requerida para la venta del
  vendedor; no se puede usar el cambio de pago para evitarla.
- Venta, ingreso a `caja-principal`, consumo de stock/reserva, consumo de la
  aprobación y recibo idempotente permanecen en la misma operación
  server-authoritative.
- No se amplía el alcance a crédito, pago mixto, otras verticales, fiscalidad,
  venta offline ni cambios a producción.

## Opciones

### Opción 1 — Mantener el turno obligatorio para efectivo

El cajero debe abrir un turno antes de confirmar toda venta en efectivo. No
cambia la arquitectura existente.

- **A favor:** base de apertura, ventas, movimientos y conteo final quedan
  conciliados dentro del modelo actual de turno.
- **En contra:** contradice el requisito operativo confirmado y añade un paso
  antes de cada jornada/cobro.

### Opción 2 — Efectivo sin turno, pago y ledger canónicos por venta

El turno deja de ser requisito para una venta Bodega en efectivo. Si el cajero
tiene un turno propio abierto, el servidor conserva el vínculo actual; si no,
la venta y el movimiento financiero se registran con `turnoId: null`. El
comando incluye `montoRecibidoCOP` solo para efectivo. Después de resolver el
total dentro de la transacción, el servidor exige un entero seguro mayor o
igual al total, deriva `cambioCOP = montoRecibidoCOP - total`, persiste ambos
valores en el snapshot de pago y acredita a `caja-principal` el total de la
venta. El cambio no es ingreso ni una segunda venta: el flujo neto de caja es
igual al total acreditado.

El backend conserva una única clave de idempotencia y rechaza el replay con el
mismo comando si cambió el monto recibido. El cierre de turno solo incluye las
ventas vinculadas a ese turno; nunca declara conciliado el efectivo sin turno.
El historial/consulta administrativa debe identificar las ventas en efectivo
sin turno y mostrar total, recibido y cambio para su revisión por venta y por
fecha. No se crea un documento de apertura/cierre nuevo.

- **A favor:** cumple el flujo pedido con el menor cambio de modelo; mantiene
  saldo y ledger en la autoridad canónica de la cuenta y no crea un turno
  ficticio.
- **En contra:** no hay arqueo automático de una base de apertura ni un cierre
  formal para el efectivo sin turno. El responsable del negocio debe aceptar
  ese límite y revisar el efectivo por ventas y el saldo de `caja-principal`.

### Opción 3 — Caja compartida diaria con cierre administrativo

Se elimina el turno individual como precondición, pero toda venta en efectivo
se asigna a una caja operativa por tenant y fecha de negocio. La administración
abre o valida una base compartida y realiza un conteo/cierre diario separado
del turno individual de los vendedores.

- **A favor:** conserva un arqueo formal y permite que dos vendedores recauden
  sobre la misma caja sin turnos por persona.
- **En contra:** crea un nuevo agregado persistente, estados, bloqueo de
  concurrencia, comandos de apertura/cierre, permisos, auditoría, UI,
  reportes, recuperación e invariantes de idempotencia. Amplía el MVP y requiere
  un diseño y estimación separados.

## Recomendación

Se recomienda la **Opción 2**, condicionada a que el responsable acepte
explícitamente que una venta sin turno no participa en el arqueo/cierre de un
turno. Es el ajuste mínimo al flujo confirmado por el responsable y puede
conservar la autoridad de la callable, el ledger de la cuenta y la auditoría
por venta sin introducir una segunda autoridad de caja. La interfaz de
administración debe hacer visible la diferencia entre “venta vinculada a turno”
y “venta en efectivo sin turno”; no debe presentarse esta última como
conciliación de cierre.

Si el cliente exige una declaración formal de efectivo contado y diferencia
diaria para esas ventas, la Opción 2 no basta; debe seleccionarse la Opción 3
mediante un alcance y ADR aprobados antes de implementar. No se debe simular el
cierre creando un turno oculto ni atribuir la venta al turno de otra persona.

## Efectos esperados si se aprueba la Opción 2

- Extender el envelope cerrado de `confirmarVentaBodegaV1` para aceptar
  `montoRecibidoCOP` únicamente si `metodoPago === "efectivo"`; el servidor
  rechaza cantidades faltantes, negativas, no enteras o menores al total.
- Persistir `pago.montoRecibidoCOP` y `pago.cambioCOP` como snapshots
  server-authoritative. No aceptar del cliente total, cambio, cuenta, `turnoId`
  ni valores de catálogo.
- No exigir la capacidad `shifts` para cobrar sin turno; conservar actor,
  tenant, membresía, lifecycle, `sell`, aprobación previa, catálogo, reserva,
  stock, caja e idempotencia revalidados en la transacción.
- Mantener `turnoId` del turno propio abierto si existe; en ausencia de turno,
  persistir `null` en venta y movimiento financiero. El cliente no puede elegir
  ni suministrar dicho vínculo.
- Asegurar que el recibo POS y el historial admin comuniquen recibido y cambio.
  La consulta administrativa identifica claramente ventas no asociadas a
  turno; el cierre de turnos queda limitado a sus propios movimientos.
- Añadir pruebas para falta/exceso de efectivo, cambio derivado, venta directa
  admin y venta aprobada por vendedor, replay idéntico/cambiado, error sin
  efectos parciales, falta de stock, turno propio existente/ausente y
  aislamiento tenant/rol.
- El rollback revierte la UI/contrato nuevo mediante PR. No se reescriben
  ventas ya confirmadas ni se borran movimientos financieros/inventario; los
  documentos creados bajo este contrato conservan sus snapshots.

## Gates y decisión requerida

La aceptación de esta propuesta permitiría implementar solo la Opción aprobada
en una PR separada. Antes de aceptar deben estar claros el impacto en el cierre
de caja, el reporte de ventas no asociadas a turno y el valor recibido/cambio.
No despliega, no crea tenants o vendedores reales y no autoriza cambios de
staging o producción.

**Decisión solicitada:** aprobar la Opción 2 con el límite de arqueo descrito,
rechazarla y mantener la Opción 1, o indicar que se requiere diseñar la Opción
3. Hasta esa decisión, el ADR permanece `PROPUESTO` y el comportamiento actual
no cambia.
