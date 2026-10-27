# ADR-SAAS-091 — Bodega MVP-1: ventas a crédito, abonos y cuenta operativa de Nevera

## Estado

**ACEPTADO — 2026-10-26; parcialmente supersedido por ADR-SAAS-096.** El origen de existencias Nevera descrito como transferencia desde Bodega queda reemplazado por carga directa sobre el catálogo Nevera. El modelo de crédito de clientes, cuenta operativa, cargos/abonos al costo y controles de venta permanece vigente.

- **Fecha de propuesta:** 2026-10-26.
- **Fecha de aceptación:** 2026-10-26.
- **Aprobación:** el responsable aprobó expresamente ADR-SAAS-091 y ADR-SAAS-092
  en respuesta a la solicitud de aceptar ambas propuestas en PR #678.

- **Goal:** `G-SAAS-02` → `M2` → `E2.2`; validación posterior en `M3 / E3.1`.
- **Decisor de alcance:** responsable del proyecto.
- **Recomendación técnica:** Lead Engineer.
- **Relacionados:** ADR-SAAS-041, ADR-SAAS-042, ADR-SAAS-062, ADR-SAAS-064,
  ADR-SAAS-068, ADR-SAAS-070 y ADR-SAAS-071.
- **Supersede parcialmente:** ADR-SAAS-041 únicamente en sus exclusiones de
  crédito, cartera, abonos y ubicación interna de inventario; ADR-SAAS-062
  únicamente para permitir que una solicitud aprobada se confirme como venta
  pendiente de pago y para el ciclo de abonos descrito aquí. No cambia el
  requisito de aprobación previa, su TTL de 24 horas ni la autoridad de la
  venta de ADR-SAAS-042.
- **Límite:** preparar el contrato no crea cuentas, ventas, saldos, ubicaciones,
  existencias, abonos ni cambios remotos. No autoriza desplegar.

## Contexto

ADR-SAAS-041 define venta de contado y deja fuera crédito, cartera y abonos.
ADR-SAAS-062 ya proporciona una solicitud persistente: la solicitud del
vendedor y la aprobación administrativa no crean una venta ni descuentan
inventario; la venta se materializa en la confirmación canónica. Sin embargo,
esa confirmación Bodega solo admite efectivo o transferencia. La capacidad
genérica `cuenta_cobro` existente liquida una cuenta completa en un solo pago y
no ofrece abonos parciales; la plantilla de configuración Bodega solo habilita
efectivo y transferencia.

El inventario de producto actual mantiene un saldo por artículo y lo vincula a
un `espacioId`; el ledger no distingue ubicaciones físicas dentro del Espacio.
ADR-SAAS-041 define un solo Espacio operativo y aclara que Espacio no equivale
a una sede técnica. Reutilizar `espacioId` como nevera crearía semántica
incorrecta y no permitiría una transferencia interna trazable.

El responsable confirmó que el vendedor debe poder tomar una solicitud sin
registrar una venta pagada en ese instante; al entregar la mercancía se
confirmará la venta, ya sea pagada o pendiente. También confirmó abonos
parciales para que el saldo del cliente se mantenga actualizado. Para la
Nevera, confirmó que el cargo de control se valorice al costo de adquisición.

## Requisitos confirmados

1. La solicitud y su aprobación permanecen separadas de venta, inventario,
   caja e ingreso financiero. No se factura ni se descuenta stock al tomar el
   pedido.
2. Al entregar/confirmar el pedido, el vendedor puede seleccionar efectivo,
   transferencia o dejarlo pendiente de pago. Efectivo y transferencia
   registran la venta pagada; pendiente crea una cuenta por cobrar vinculada a
   la venta y cliente. Todas las selecciones se resuelven y validan en el
   servidor.
3. Un usuario autorizado puede registrar varios abonos parciales por venta;
   cada abono indica efectivo o transferencia y actualiza el saldo visible del
   cliente. El mismo abono no puede aplicarse más de una vez.
4. Al registrar un abono, la vendedora puede guardar una fecha de compromiso
   para el siguiente pago. Un nuevo compromiso conserva el anterior en el
   historial; no cambia el saldo, no agrega intereses y no bloquea ventas
   automáticamente.
5. La administración controla al menos las ubicaciones internas Bodega y
   Nevera dentro del único Espacio operativo. Los traslados preservan el stock
   total del tenant y no crean ventas ni ingresos.
6. Las ventas al detalle desde Nevera usan el canal consumidor final y su
   precio vigente. Una cuenta interna de Nevera permite controlar la mercancía
   cargada a costo y la que ya se vendió. No se presenta como cliente fiscal ni
   como factura de venta externa.
7. Nada en este ADR habilita crédito SaaS, interés, recargo, límite de crédito,
   cobro fiscal, factura DIAN, ni acceso a otro tenant.

## Alternativas

### Opción 1 — Conservar venta pagada al confirmar

La solicitud actual sigue siendo solo aprobación y el vendedor debe esperar a
que el cliente pague antes de confirmar.

- **A favor:** no cambia el contrato financiero actual.
- **En contra:** no representa el ciclo de entrega semanal a crédito ni permite
  asentar abonos parciales. No satisface el requisito comunicado.

### Opción 2 — Tratar la Nevera como cliente externo y venderle cada carga

Cada entrada de mercancía a la Nevera sería una venta B2B con ingreso y cuenta
por cobrar; luego las ventas al detalle producirían otras ventas.

- **A favor:** reutiliza literalmente cliente y cuenta de cobro.
- **En contra:** el sistema podría contar dos veces ingreso/margen por la misma
  mercancía y confundir una ubicación propia con un tercero. Requiere una
  decisión contable y tributaria adicional. No se recomienda para el MVP.

### Opción 3 — Ubicación interna y subledger operativo a costo (recomendada)

La carga a Nevera es un traslado interno y abre un cargo de control por el
costo snapshot de las unidades trasladadas. La venta al consumidor reconoce
una sola venta real al precio de consumidor final, reduce el stock de Nevera y
genera un abono operativo por el costo snapshot de lo vendido. El saldo de
control refleja el costo de mercancía todavía asignada a Nevera; no es ingreso,
cuenta por cobrar externa ni documento fiscal. Las ventas a crédito de clientes
reales usan otra cuenta por cobrar, ligada a cada venta.

- **A favor:** conserva la trazabilidad de lo cargado a Nevera, el saldo de
  producto bajo su custodia y el valor vendido sin duplicar el ingreso retail.
- **En contra:** requiere distinguir en UI y reportes el subledger de Nevera
  de las cuentas por cobrar reales. El costo y los abonos deben derivarse de
  snapshots del servidor.

## Decisión propuesta

Se recomienda la **Opción 3**, con el siguiente ciclo:

```text
solicitud del vendedor
  → aprobación de administración (sin venta ni descuento de stock)
  → al entregar, confirmar una sola vez:
       efectivo / transferencia → venta pagada
       cuenta por cobrar       → venta pendiente
  → abonos parciales por venta y cliente; saldo = total − abonos

traslado Bodega → Nevera
  → movimiento de inventario interno a costo snapshot
  → cargo operativo de Nevera al mismo costo
  → venta al detalle desde Nevera
  → venta consumidor final a precio retail y pago registrado una sola vez
  → descuento de stock Nevera y abono operativo por costo de lo vendido
```

La solicitud no se considera deuda ni venta antes de que se confirme la entrega.
Los abonos reales de clientes nunca modifican artículos, inventario ni el total
original de venta. El saldo se mantiene exacto en COP enteros; se rechazan
abonos cero, negativos o mayores al saldo, y no se crea automáticamente un
saldo a favor. Una venta pasa a `pagada` cuando los abonos aplicados igualan
exactamente su total; de lo contrario conserva saldo pendiente. Un pago puede
aplicarse a una venta seleccionada; repartirlo entre varias ventas requerirá un
comando/alcance explícito y no se infiere.

El cliente autorizado puede registrar una fecha opcional de compromiso de pago
en la factura. Cada cambio de fecha añade un evento con actor y timestamp de
servidor y conserva las fechas anteriores. El compromiso es seguimiento
operativo: no se trata como vencimiento fiscal, no altera el saldo, no genera
interés ni bloquea pedidos/ventas por sí mismo.

Los cargos/abonos de control de Nevera serán append-only, idempotentes y
vinculados a los comandos de traslado o venta que los originan. El cargo se
valora con el costo unitario snapshot validado por el servidor; al vender al
detalle, el abono interno usa el costo total snapshot de las unidades vendidas,
no el efectivo recibido del consumidor. El ingreso de la venta retail se
registra una sola vez. La UI deberá llamar a ese saldo “mercancía de Nevera a
costo pendiente de rendición” o texto equivalente, para no presentarlo como
deuda real de un cliente.

Para las cuentas por cobrar reales, cada abono persistirá actor, tenant,
venta, cliente, importe, medio de pago, comando/idempotency key, fecha server y
referencias a su movimiento financiero. Los abonos de efectivo usarán la
semántica de ADR-SAAS-068: se asocian al turno propio si existe; sin turno
quedan con `turnoId: null` y se identifican como no conciliados por un cierre
de turno. La interfaz muestra saldo por factura y saldo agregado del cliente,
con lectura limitada al tenant.

La aprobación de ADR-SAAS-062 sigue siendo obligatoria para vendedores y se
consume como máximo una vez. Un admin conserva su ruta canónica autorizada. La
venta al entregar vuelve a validar tenant, actor, rol, permiso, cliente,
producto, presentación, canal, precio, existencia y estado de la solicitud en
una operación server-authoritative e idempotente. Los abonos no reabren una
venta cancelada o anulada.

## Permisos y seguridad

- Las Functions derivan tenant/actor de Auth y membresía y verifican lifecycle,
  rol y `sell` en la misma transacción de la mutación.
- Solo admin gestiona ubicaciones, traslados de carga y ajustes de inventario;
  vendedor solo puede crear solicitudes/confirmar ventas dentro de la
  autorización vigente y registrar abonos de efectivo/transferencia que
  recibió. Admin puede consultar y registrar correcciones por comandos
  compensatorios, nunca editar saldos directamente.
- El vendedor consulta saldo e historial de sus clientes únicamente mediante
  DTOs tenant-aware sin costos internos. La proyección administrativa puede
  mostrar costo y subledger de Nevera a roles autorizados.
- No se aceptan `empresaId`, `ubicacionId`, costo, saldo, estado de pago,
  cuenta bancaria, turno, precio ni snapshots financieros como autoridad del
  payload.
- Cada mutación crea su recibo idempotente y evidencia auditable. Replays
  idénticos devuelven el resultado original; huellas distintas fallan sin
  efectos parciales.

## Cambios y compatibilidad requeridos antes de implementar

1. Diseñar ubicaciones internas subordinadas al Espacio, con balances por
   ubicación y un ledger que conserve el agregado del artículo. Compra y
   apertura inicial ingresan a Bodega; traslado genera salida/entrada atómicas;
   venta consume solo de la ubicación seleccionada. `espacioId` continúa
   significando Espacio, no ubicación.
2. Definir esquema versionado para ventas a crédito/abonos y para el subledger
   interno de Nevera. Los lectores actuales deben seguir leyendo ventas
   `BODEGA_MVP1_V1` y cuentas de cobro existentes; no se reescriben ventas,
   movimientos ni transacciones históricas.
3. Preparar un backfill idempotente que asigne el stock preexistente a Bodega,
   preserve saldos y secuencias, detecte duplicados/inconsistencias y tenga
   reporte de dry-run. No se autoriza ejecutarlo en este ADR.
4. Actualizar el flujo de pagos, cuentas de cobro, historial, reportes,
   recibos, anulaciones/compensaciones, compras, ajustes, reservas y Rules
   aplicables sin debilitar los contratos de otros verticales.
5. No habilitar una ubicación o cuenta Nevera en producción hasta que su
   migración de catálogo/inventario esté reconciliada y aprobada.

Si no puede mantenerse compatibilidad con inventario y ventas existentes sin
una migración segura, el alcance se divide y no se activa Nevera hasta cerrar
ese gate. Un rollback de código no elimina la historia append-only ni revierte
automáticamente ventas, cargos o pagos ya registrados.

## Pruebas y criterios de aceptación

Antes de autorizar despliegue, el PR técnico deberá demostrar como mínimo:

1. Solicitud pendiente, rechazo, cancelación y aprobación no crean venta,
   movimiento de inventario, cargo por cobrar ni ingreso.
2. Confirmación de entrega en efectivo/transferencia mantiene el comportamiento
   canónico de pago e inventario; confirmación a crédito descuenta stock una
   vez y crea exactamente una venta/saldo sin ingreso cobrado.
3. Abonos parciales concurrentes no sobrepagan ni pierden actualizaciones;
   replays no duplican recibos, saldo ni ledger; pago exacto deja saldo cero y
   estado pagado; abono inválido aborta todo.
4. Una venta con varios abonos conserva importe, medio de pago, actor,
   timestamps y referencias; saldo de cliente y factura coincide con la suma
   append-only.
5. Traslados Bodega↔Nevera preservan stock agregado/costo, son idempotentes,
   no generan ventas ni ingresos y no aceptan cantidades superiores a
   disponibilidad.
6. Cada venta retail desde Nevera consume stock de esa ubicación, usa precio
   consumidor final, genera un solo ingreso de venta y abona el costo correcto
   al subledger; ubicación/cliente de otra empresa se rechaza.
7. Backfill dry-run y repetición demuestran cero cambio de saldos, sin
   duplicados y preservando `secuenciaLedger`; rollback de código no borra
   documentos ni falsea saldo.
8. Se prueban autorización admin/vendedor, actor distinto del solicitante,
   tenencia, permisos, Rules deny-by-default, ventas anuladas, cross-tenant,
   replay y fallo intermedio sin mutación parcial en Firestore Emulator.
9. Se conserva el flujo de solicitudes/agenda de ADR-SAAS-062/064 y la venta
   directa/admin existente; no se cambian verticales no-Bodega.

Gate I no puede certificar este nuevo contrato sin CI, Rules Emulator, pruebas
de Functions y E2E que cubran crédito, abonos, ubicaciones y la ruta Nevera.

## Consecuencias y límites

- La decisión funcional amplía Bodega MVP-1 y afecta la certificación de
  E2.2/M3. No convierte la Nevera en sucursal o sede técnica.
- La subcuenta operativa de Nevera no sustituye ni duplica las cuentas por
  cobrar de clientes reales. No es una factura DIAN ni prueba un tratamiento
  contable/tributario.
- El catálogo definitivo, los costos y precios siguen sujetos a validación de
  Diana. No se importan productos ni se inicializa inventario mediante esta
  ADR.
- Esta ADR no autoriza escrituras productivas, despliegues, Bootstrap, Trial,
  reglas remotas ni cambios IAM.

## Registro de aceptación

El responsable autorizó ampliar el alcance funcional, confirmó que la cuenta
de control de Nevera se valorice a costo de adquisición y aprobó expresamente
esta ADR. Queda habilitada la implementación local en PRs técnicos separados,
después de integrar la aceptación y sincronizar los documentos maestros. La
aceptación no autoriza despliegues, migraciones remotas, ventas, abonos,
Bootstrap, Trial ni cambios de datos productivos.
