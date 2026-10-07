# ADR-SAAS-064 — Agenda de pedidos y entregas Bodega MVP-1

## Estado

**PROPUESTO — PENDIENTE DE APROBACIÓN.**

- **Fecha:** 2026-10-07.
- **Fecha de propuesta:** 2026-10-07.
- **Última revisión:** 2026-10-07.
- **Goal:** `G-SAAS-02` → `M2` → `E2.2`.
- **Decisor de alcance:** responsable del proyecto. **Recomendación técnica:**
  Lead Engineer.
- **Relacionados:** ADR-SAAS-018, ADR-SAAS-041, ADR-SAAS-042 y ADR-SAAS-062.

Esta propuesta no autoriza implementación ni mutaciones. Si se aprueba, la
implementación deberá integrarse y certificarse mediante branch, PR, CI y
auditoría antes de la primera entrega. No autorizará por sí sola deploy,
tráfico, mutaciones de staging, fixture, Bootstrap, Activation, tenant real ni
producción. Gate F permanece en curso; los escenarios afectados de Gate F/G/H
deberán revalidarse después de integrar la implementación.

## Contexto

El flujo vigente permite al vendedor crear una solicitud de venta que la
administración aprueba antes de que el pago confirme la venta canónica.
ADR-SAAS-062 establece que la aprobación vence en 24 horas, no congela precio y
no reserva inventario. ADR-SAAS-041 dejó fuera de MVP-1 los pedidos persistentes,
el despacho y las entregas.

El responsable del proyecto añadió como requisito previo a la primera entrega
comercial que el vendedor pueda registrar productos que un cliente necesitará
en una fecha futura y que la administración tenga una agenda con recordatorios.
La interfaz debe distinguir «Pedido para hoy» de «Agendar entrega». La fecha
define el día; una franja horaria preferida puede solicitarse tanto para hoy
como para una fecha futura. Después preguntó si lo ideal sería reservar stock.
Esta propuesta recomienda una reserva lógica aprobada por administración, no
descontar la existencia física al agendar. La reserva reduciría el stock
disponible; el movimiento físico y la venta canónica ocurrirían solo al
confirmar la venta en la fecha acordada. La reserva no congelaría precio ni
garantizaría una hora o entrega efectiva.

Una agenda futura no puede reutilizar sin cambios la aprobación de 24 horas de
ADR-SAAS-062: una solicitud para dentro de cinco días no debe tener una
autorización de venta utilizable durante cinco días. Tampoco debe presentarse
como venta ni generar efectos financieros antes de la confirmación canónica.

## Drivers

- Separar una intención futura de una solicitud aprobada y de una venta
  confirmada.
- Mantener tenant isolation y autoridad server-side en las lecturas, escrituras,
  transiciones y recordatorios.
- Retener stock disponible solo por autorización explícita de administración;
  no confundir el hold con una venta ni una entrega garantizada, y no congelar
  precios.
- Dar a vendedor y administración una agenda útil cuando la app esté cerrada,
  sin presentar una notificación externa como entrega garantizada.
- Reutilizar el codebase `saas-bodega`; no crear otro POS ni una frontera
  Firebase nueva.
- Preservar auditoría, idempotencia y reversibilidad; no borrar historial ni
  efectuar cleanup automático.

## Opciones consideradas

### Opción 1 — Extender la solicitud actual con fecha futura

Se añade fecha/franja a la solicitud de ADR-SAAS-062 y se conserva su
autorización actual.

- **A favor:** menor cambio de modelo y UI.
- **En contra:** la aprobación de 24 horas no sirve para una entrega posterior;
  extenderla debilitaría el control aprobado. Si se confirma la venta antes, sus
  efectos financieros e inventario ocurren antes de la entrega.

### Opción 2 — Agenda no vinculante sin reserva

Se guarda una intención tenant-aware con cliente, presentaciones, cantidades,
fecha y franja opcional. Al llegar el día, el vendedor crea una solicitud nueva
mediante ADR-SAAS-062. El servidor vuelve a resolver precio y stock; solo la
aprobación vigente, el pago y la confirmación canónica producen venta, ledger e
inventario.

- **A favor:** conserva ADR-SAAS-062, admite pedidos a varios días y evita
  efectos prematuros o una promesa implícita de stock.
- **En contra:** la fecha/franja es una solicitud, no garantiza disponibilidad
  ni entrega; precio y stock pueden cambiar antes de confirmar. El día de
  atención se requiere una revisión administrativa nueva de la venta.

### Opción 3 — Agenda con reserva lógica de inventario

El vendedor registra una solicitud futura sin mutar stock. Al aceptarla, la
administración confirma cantidades disponibles y el servidor retiene esas
unidades en unidad base hasta la venta, cancelación o vencimiento. La retención
reduce stock disponible, pero no existencia física ni ledger. En la fecha
solicitada se crea una solicitud nueva bajo ADR-SAAS-062; al confirmar el pago,
la transacción canónica consume una sola vez tanto la reserva como el stock
físico.

- **A favor:** evita comprometer dos veces el mismo stock mientras la bodega
  prepara una entrega futura, y mantiene la venta/ledger en el momento real de
  atender y cobrar.
- **En contra:** requiere una nueva autoridad transaccional de reservas,
  proyección de stock disponible, expiración/liberación idempotente y cambios en
  las salidas de inventario para no consumir unidades ya retenidas.

### Opción 4 — Descontar existencia física al agendar

La programación crea inmediatamente una salida física o una venta pendiente.

- **A favor:** el stock visible baja sin una proyección adicional.
- **En contra:** representa como consumido un producto que sigue en la bodega;
  contamina el ledger y puede anticipar ventas, caja o efectos financieros. Se
  rechaza.

## Decisión propuesta

Se recomienda la **Opción 3**. La programación comienza como solicitud
pendiente; solo la aceptación administrativa crea una reserva. La reserva
representa unidades físicas comprometidas exclusivamente para esa futura
atención, pero no una venta ni una garantía de transporte/entrega a una hora
exacta. El vendedor y la administración deben ver claramente «stock reservado;
precio y entrega se confirman al atender». No se congela precio. Si el precio
cambia antes de cobrar, se vuelve a resolver y aprobar conforme a ADR-SAAS-062.

La propuesta requiere una proyección transaccional de `stockReservado` en
unidad base por producto. `stockDisponible = stockFisico - stockReservado`.
Crear, cancelar, vencer o consumir la reserva actualiza esa proyección y el
registro auditable de reserva en una transacción idempotente. Ningún egreso de
inventario puede reducir el stock físico por debajo de `stockReservado`. En la
venta vinculada a una reserva, la transacción canónica reduce el stock físico y
`stockReservado` juntos, y marca la reserva consumida; no hay doble descuento.
La proyección vive junto al artículo inventariable y se reconcilia contra los
holds activos tenant-aware; un faltante o divergencia falla cerrado para nuevas
reservas. Administración ve stock físico, reservado y disponible; el vendedor
solo recibe la disponibilidad comercial necesaria.

Si se aprueba, esta decisión supersederá exclusivamente: (a) en ADR-SAAS-041,
la exclusión de pedidos persistentes y reservas para permitir la agenda y el
hold descritos aquí; (b) en ADR-SAAS-062, la exclusión de registrar una
fecha/franja y reservar unidades sin extender la aprobación de venta de 24
horas; y (c) en ADR-SAAS-018, la exclusión de esta única familia de recordatorios
Bodega. No modificará ADR-SAAS-042 como autoridad única de la venta/ledger ni
los controles de precio, pago e idempotencia de ADR-SAAS-062. Los ADR aceptados
no se editarán; el alcance se registrará en esta nueva decisión.

## Flujo y datos propuestos

```text
Vendedor crea programación
  → servidor valida actor, membresía, tenant, cliente, artículos y cantidades
  → PENDIENTE_REVISION visible para vendedor creador y administración
  → admin acepta; servidor valida stockDisponible y crea hold transaccional
  → recordatorios durables/in-app; FCM best-effort
  → llegado el día, vendedor crea solicitud vigente de ADR-SAAS-062
  → admin aprueba dentro de 24 h
  → pago y confirmarVentaBodegaV1 consumen el hold y stock físico atómicamente
  → venta, caja, inventario y auditoría canónicos
```

- «Pedido para hoy» preselecciona hoy en la zona horaria configurada para la
  empresa. «Agendar entrega» permite escoger una fecha futura. Ambas opciones
  aceptan una franja horaria preferida; para hoy no se ofrecen franjas ya
  vencidas. Se usa `configuraciones/{empresaId}.localizacion.zonaHoraria`.
- Una franja expresa preferencia, no promesa de hora exacta. La agenda identifica
  entradas próximas, vencidas, canceladas, reservadas y convertidas.
- El registro conserva tenant, cliente, actor, referencias canónicas a producto
  y presentación, cantidades enteras en presentación y unidad base resueltas
  server-side, snapshots mínimos de nombre/unidad/factor, fecha local, franja
  opcional, zona horaria, estado, clave idempotente y timestamps server-side.
  No duplica datos personales ni guarda credenciales.
- No se acepta precio, total, costo, factor ni disponibilidad enviados por el
  vendedor como autoridad. La aceptación administrativa comprueba stock en
  unidad base y crea el hold mediante autoridad server-side; no congela precio.
  Al atender la agenda, el precio y la solicitud de venta se vuelven a resolver
  conforme a ADR-SAAS-062.
- Estados propuestos para la agenda: `PENDIENTE_REVISION`, `RESERVADA`,
  `CANCELADA`, `VENCIDA`, `CONVERTIDA_A_SOLICITUD` y `CUMPLIDA`; la reserva
  tiene estado separado `ACTIVA`, `CONSUMIDA`, `LIBERADA` o `VENCIDA`. El hold
  vence al final del día local programado, se haya convertido o no en una
  solicitud de venta. La aprobación de ADR-SAAS-062 nunca extiende ese hold; si
  la venta se confirma después, se valida contra la disponibilidad actual sin
  la reserva vencida. La cadencia de expiración no excederá cinco minutos.
  Cada liberación es idempotente.
- El vendedor puede cancelar su programación propia pendiente; administración
  puede cancelar cualquiera pendiente o reservada. No hay edición ni borrado
  físico; cada cambio libera/consume el hold y se audita.
- Mientras un hold esté activo no se puede desactivar su producto/presentación
  ni reducir stock físico debajo de la cantidad retenida; primero se cancela o
  vence la reserva por una transición auditada.
- La conversión a solicitud es explícita e idempotente y conserva la correlación
  con `programacionId` y la reserva. La venta canónica debe consumir la reserva
  vinculada en la misma transacción que decrementa stock físico; replay no
  genera solicitudes, ventas ni movimientos duplicados.
- Agendar y reservar no crea venta, movimiento del ledger, caja ni obligación
  financiera. Solo la confirmación canónica genera esos efectos. No habilita
  crédito, entrega parcial, ruta, remisión o fiscalidad.

## Recordatorios propuestos

- La agenda autenticada del POS Bodega (vistas de vendedor y administrador del
  tenant) es la fuente durable de verdad; no es parte del Backoffice SaaS de
  plataforma.
- La propuesta incluye el evento Bodega `RECORDATORIO_AGENDA_PEDIDO` y un
  productor backend idempotente para el vendedor creador y administradores
  activos del tenant. Como mínimo avisa al crear la entrada, el día anterior
  (si aplica) y al llegar la fecha/franja solicitada. Las franjas vencidas para
  el día actual se rechazan. La cadencia del trabajador no puede exceder cinco
  minutos; los límites de reintento y retención se fijarán y probarán en la PR
  técnica.
- El inventario actual de `saas-bodega` no contiene scheduler ni outbox de
  notificaciones; tampoco se puede ampliar `saas-auth` para resolverlo. La
  implementación añadirá el trabajador backend programado dentro de
  `functions-bodega`/`saas-bodega`, `us-central1`, Node.js 22 y cero Secrets.
  Mantendrá closure de imports y permisos mínimos. Su superficie se demostrará
  en Gate C; su despliegue requiere Gate D y no queda autorizado por aceptar
  este ADR.
- La agenda no depende de permisos push. FCM/Web Push es mejor esfuerzo; no se
  garantiza entrega al dispositivo, sonido ni lectura humana. Un fallo FCM no
  cambia el pedido o la venta.
- Los recordatorios durables/outbox siguen las garantías de ADR-SAAS-018
  (emisión durable, despacho al menos una vez y destinatario recalculado
  server-side). La lista de agenda no equivale a un centro genérico de
  notificaciones y puede consultarse aunque falle el despacho externo.
- Los mensajes push llevan datos mínimos; nunca PIN, tokens, secretos o PII
  innecesaria.

## Seguridad y pruebas requeridas

- Solo Functions/Admin SDK crean o transicionan programaciones. Rules no se
  relajan ni habilitan escritura cliente directa.
- El tenant se deriva de identidad/membresía y se valida en cada comando y
  consulta. El vendedor solo consulta sus programaciones; admin consulta las de
  su tenant. Ningún ID enviado por el cliente define autoridad.
- Cada programación referencia un cliente activo y reutiliza su dirección
  canónica si está registrada; no duplica dirección/contacto en el documento de
  agenda. La interfaz indica cuando no hay dirección disponible. Capturar
  destinos alternos queda fuera de esta propuesta.
- Cada transición, reserva, liberación, consumo y recordatorio es idempotente y
  auditable; los retries no duplican agenda, holds, movimientos, notificaciones
  ni solicitudes.
- La autoridad de inventario transaccional mantiene `0 <= stockReservado <=
  stockFisico`; ninguna venta, merma o ajuste descendente puede atravesar la
  cantidad reservada. Dos reservas concurrentes no pueden sobreasignar stock.
- Una venta vinculada consume el hold y reduce stock físico en una sola
  transacción; la venta no vinculada solo puede consumir `stockDisponible`.
- Emulator/CI cubre aislamiento A/B, rol/permisos, actor ajeno, payload
  manipulado, cliente/presentación inactivos, fecha pasada, franja pasada para
  hoy, disponibilidad insuficiente, reservas concurrentes, ventas/ajustes que
  no invaden holds, cancelación/expiración y liberación, consumo de hold con
  venta, cambios de precio antes de cobrar, replay, concurrencia de conversión,
  notificación sin token y fallo/retry del dispatcher.
- Gate F, G y H deben reabrirse para los escenarios afectados después de
  integrar la implementación. CI no cierra por sí sola E2.2.

## Consecuencias

### Positivas

- El vendedor registra necesidades futuras; administración puede retener
  cantidades disponibles sin anticipar la venta.
- La reserva reduce disponibilidad para otras ventas, sin falsear existencia
  física ni crear movimiento de ledger.
- La autoridad actual de precio y los efectos financieros se revalidan y se
  registran solo al confirmar la venta.

### Negativas

- La retención de unidades no garantiza ruta, transporte ni hora exacta de
  entrega; la UI debe diferenciar stock reservado de entrega comprometida.
- Se añaden un agregado de agenda/reserva, proyección de stock disponible,
  transiciones y expiración programada; todos quedan sujetos a CI, Gate C y
  deploy dirigido posterior.
- Al atender la programación se requiere la revisión administrativa de
  ADR-SAAS-062 y su autorización de 24 horas.

## Límites de autorización

ADR-SAAS-064, si se acepta, autorizará únicamente implementar este alcance en
una PR separada y reusable dentro de E2.2. No autorizará deploy, tráfico,
fixture nuevo, mutaciones de staging, Bootstrap, Activation, tenant real ni
producción. Gate C/D y sus preflights conservan aprobaciones independientes.

La propuesta fija expresamente que:

1. Una programación es una solicitud. La aceptación administrativa retiene
   stock disponible, pero no crea venta ni garantiza transporte, entrega a una
   hora exacta o precio futuro. Precio se resuelve bajo ADR-SAAS-062 al cobrar.
2. La franja opcional se aplica a pedidos de hoy y fechas futuras, sin prometer
   una hora exacta; se recomiendan rangos en vez de una hora puntual.
3. La agenda autenticada es fuente durable de verdad; la familia de recordatorio
   extiende ADR-SAAS-018 solo para este caso. FCM/Web Push es mejor esfuerzo y
   no garantiza sonido, recepción ni lectura.
4. La solución añade un trabajador programado únicamente en `saas-bodega`, con
   frecuencia máxima de cinco minutos y cero Secrets; el deploy requiere Gates
   C/D independientes.

La decisión arquitectónica sigue pendiente de aprobación explícita. No
implementar hasta su aceptación; después deben respetarse estos límites y los
gates de ejecución independientes.
