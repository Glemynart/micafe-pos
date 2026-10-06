# ADR-SAAS-062 — Aprobación previa de ventas Bodega MVP-1

## Estado

**ACEPTADO — 2026-10-06.**
**Última revisión:** 2026-10-06.
**Decisores:** responsable del proyecto (delegación explícita de decisión y
ejecución autónoma E2.2) y Lead Engineer para la resolución técnica.

Pertenece a `G-SAAS-02 → M2 — Provisioning y onboarding → E2.2 —
Configuración inicial`, con impacto posterior en la certificación operativa de
`M3 / E3.1`.

La aceptación autoriza la implementación del flujo descrito en este ADR dentro
de `saas-bodega`, mediante el proceso normal de PR, CI y auditoría. Este ADR
supersede únicamente las partes indicadas de ADR-SAAS-041 y complementa el
contrato de ADR-SAAS-042. No autoriza deploy, tráfico, creación/configuración
del tenant real, carga de catálogo o inventario, Bootstrap, Activation, fixture
adicional ni producción.

La decisión se apoya en el requisito confirmado por el responsable del
proyecto: el vendedor presenta la venta y la administradora la aprueba antes
del cierre, junto con la autorización explícita para evaluar y aceptar la
alternativa más segura y viable dentro de E2.2.

## Contexto

ADR-SAAS-041 aceptó para Bodega MVP-1 la venta directa de contado y excluyó
pedidos persistentes, reservas y flujos de aprobación. La superficie vigente
expone `confirmarVentaBodegaV1` como comando canónico de venta; no se encontró
una frontera de solicitud/aprobación previa de ventas en `functions-bodega`.

Para la operación inicial de Distribuidora Las Jiménez, el responsable
comercial indicó que el vendedor debe enviar una propuesta con el cliente y los
artículos, y que Diana Jiménez, como administradora inicial, debe revisarla y
confirmarla antes de que la venta quede cerrada.

Ese control previo requiere distinguir una solicitud pendiente de una venta
confirmada. Tratar la solicitud como venta anticipada podría descontar stock,
registrar caja o crear hechos financieros antes de la aprobación y del pago.
Reutilizar `pedidos_activos` de salón/cocina mezclaría dominios y no es
aceptable para Bodega.

## Requisitos expresados

- El vendedor presenta el cliente y las líneas de producto/presentación con
  sus cantidades.
- Diana revisa y aprueba o rechaza antes de que se confirme la venta.
- El total mostrado debe derivarse de precios canónicos del tenant; un total
  escrito o enviado por el vendedor nunca será autoridad financiera.
- La venta conserva el flujo canónico server-authoritative de ADR-SAAS-041 y
  ADR-SAAS-042.
- La administradora inicial también podrá registrar sus propias ventas por la
  ruta canónica administrativa directa; no creará ni aprobará su propia
  solicitud de vendedor.
- No se inicia facturación electrónica; no se habilitan crédito, despacho ni
  entregas parciales por esta propuesta.

## Opciones consideradas

### Opción 1 — Mantener venta directa y revisión posterior

El vendedor completa la venta de contado y Diana la revisa después en
Backoffice.

- **Ventaja:** no cambia el alcance ni el modelo aceptado de ADR-SAAS-041.
- **Desventaja:** no satisface el control previo solicitado; la venta y sus
  efectos ya existirían antes de la revisión.

### Opción 2 — Aprobación manual fuera del POS

El vendedor comunica la propuesta a Diana por un canal acordado fuera del
producto y solo registra la venta canónica en el POS después de recibir la
aprobación.

- **Ventaja:** permite operar sin construir una cola persistente nueva.
- **Desventaja:** la aprobación no queda enlazada técnicamente a la venta; la
  conciliación y la evidencia dependen de un procedimiento externo.

### Opción 3 — Solicitud persistente con autorización administrativa

El POS guarda una solicitud tenant-aware, Diana la aprueba o rechaza y,
únicamente después de la aprobación, el vendedor puede completar la venta
canónica.

- **Ventaja:** hace verificable la separación entre solicitud, aprobación y
  venta, y permite auditar quién autorizó cada transacción.
- **Desventaja:** amplía MVP-1 y requiere modelo, comandos, permisos, UI,
  idempotencia, auditoría y pruebas nuevas.

## Decisión aceptada

Se acepta la **Opción 3** porque el requisito expresado es que la
administradora autorice las solicitudes de vendedores antes de cerrarlas y el
producto debe poder demostrar ese control. La solicitud será un agregado
Bodega independiente; no será una comanda ni un registro de venta. Una venta
iniciada por un usuario con rol `admin` seguirá la ruta canónica administrativa
directa y no podrá autoaprobarse como solicitud de vendedor.

### Flujo

```text
Vendedor arma solicitud
  → servidor valida cliente, productos, presentaciones y cantidades
  → servidor deriva precios y total desde el catálogo del tenant
  → PENDIENTE_APROBACION
  → Diana aprueba o rechaza
  → vendedor recibe autorización de un solo uso
  → pago contado y confirmarVentaBodegaV1
  → venta, caja, inventario y solicitud EJECUTADA en una operación idempotente
```

La autorización no es por sí misma una venta ni un comprobante de pago. Antes
de la confirmación canónica no se escriben ventas, movimientos de inventario,
transacciones de caja ni obligaciones financieras; tampoco se reserva stock.

Una aprobación vence a las **24 horas** desde su registro server-side. El
servidor usa UTC y comprueba la expiración dentro de la transacción de venta.
La aprobación conserva la revisión y los precios que vio la administradora,
pero no congela el catálogo: si cualquier línea, presentación o precio
canónico cambió, la solicitud queda inválida y debe presentarse de nuevo. La
disponibilidad de inventario se valida al confirmar; una aprobación nunca
reserva existencias.

### Datos y autoridad

- La solicitud referencia un cliente activo del mismo tenant y contiene
  `presentacionId` y cantidad entera por línea. No duplica datos personales del
  cliente que ya viven en su registro canónico.
- El servidor resuelve nombre, factor, precio y total a partir del catálogo
  tenant-aware. Si el cliente envía un total, se ignora o rechaza; nunca se
  persiste como valor autoritativo.
- La aprobación se vincula a una revisión inmutable de la solicitud, a su
  total calculado y al actor administrativo. Cambiar cliente, líneas,
  cantidades o total crea una nueva revisión que requiere aprobación nueva.
- Solo un miembro administrador autorizado puede aprobar o rechazar. El
  vendedor que originó la solicitud no puede aprobarla, aunque tenga acceso a
  otras funciones operativas.
- La autorización se consume una sola vez al confirmar la venta. La venta
  revalida tenant, actor, membresía, turno, pago, existencia y disponibilidad;
  si la autorización ya se usó, expiró o sus datos no coinciden, la operación
  falla sin efectos parciales.
- El sistema conserva auditoría append-only para solicitud, aprobación,
  rechazo, cancelación e intento de consumo. El evento de aprobación registra
  `expiraEn`; la expiración es temporal y se proyecta comparando ese timestamp
  server-side, sin job ni mutación de limpieza. Replay idempotente no genera
  una segunda venta ni un segundo efecto de inventario/caja.

### Estados definidos

Estados persistidos: `PENDIENTE_APROBACION → APROBADA → EJECUTADA`.

Salidas persistidas sin venta: `RECHAZADA`, `CANCELADA` o `INVALIDADA` cuando
el catálogo/precio ya no coincide con la revisión aprobada. `EXPIRADA` es un
estado efectivo derivado cuando una aprobación llega a `expiraEn`; no requiere
un job ni cambia el documento. Falta de stock al confirmar rechaza la
transacción sin efectos parciales y no consume la aprobación; puede reintentarse
si el stock vuelve a estar disponible antes de que expire.

La revisión aprobada es inmutable. No hay edición posterior de una solicitud:
el vendedor cancela o deja vencer la solicitud y presenta otra con el nuevo
contenido. La confirmación vuelve a resolver el catálogo y, antes de cualquier
efecto financiero o de inventario, invalida la solicitud si la resolución ya
no coincide con el snapshot aprobado.

## Alcance afectado de ADR-SAAS-041

Esta decisión supersede únicamente estas afirmaciones de ADR-SAAS-041:

- la exclusión de pedidos persistentes, limitada a la solicitud de aprobación
  Bodega definida en este ADR; y
- el flujo de venta directa como único paso, que pasa a ser solicitud,
  autorización y luego venta directa canónica para el rol `vendedor`. Las
  ventas iniciadas por `admin` permanecen directas y server-authoritative, sin
  una solicitud de autoaprobación.

Se mantienen los demás límites de ADR-SAAS-041: sin reserva de inventario,
despacho, entrega parcial, rutas, crédito, cartera, abonos, promociones,
descuentos libres, pago mixto, offline, multi-sede ni fiscalidad no certificada.
El pago y los efectos de venta/inventario/caja ocurren únicamente en la
confirmación server-authoritative existente, adaptada para consumir la
autorización.

## Consecuencias y gates

- Aceptar esta decisión implicará actualizar el alcance de planificación de
  E2.2/M2 y su dependencia con la certificación M3/E3.1 antes de implementar.
- Un PR técnico separado implementará las callables para crear, consultar y
  resolver solicitudes y cancelar las propias mientras no se hayan ejecutado,
  más el consumo transaccional en `confirmarVentaBodegaV1`. La interfaz ofrecerá
  bandeja de pendientes a `admin`, seguimiento de solicitudes propias a
  `vendedor` y venta directa canónica a `admin`. El cambio conservará
  persistencia tenant-aware, idempotencia, auditoría, TTL, validación de
  precio/stock y rollback.
- La implementación agregará cuatro callables sin Secrets en el codebase
  existente `saas-bodega`: `crearSolicitudVentaBodegaV1`,
  `consultarSolicitudesVentaBodegaV1`, `resolverSolicitudVentaBodegaV1` y
  `cancelarSolicitudVentaBodegaV1`. La venta continúa en
  `confirmarVentaBodegaV1`; no se agrega una segunda callable para materializar
  hechos financieros.
- El PR debe presupuestar todas las lecturas/escrituras de solicitud y venta
  bajo el límite de transacción Firestore de 500 escrituras, conservar el
  máximo de 50 líneas y rechazar transacciones que excedan límites de tamaño.
  No requiere migrar datos históricos. Si hay rollback de código, las
  solicitudes pendientes quedan inertes y no se borran; las ventas ya
  confirmadas conservan los hechos append-only existentes.
- La aceptación reabre la certificación funcional de E2.2: después de integrar
  e implementar el cambio habrá que repetir las pruebas afectadas de Gate F,
  el rehearsal de Gate G y la matriz de Gate H antes de crear/configurar el
  tenant real en Gate I.
- La aprobación de este ADR no crea ni configura el tenant real y no autoriza
  importar el catálogo, ejecutar Bootstrap/Activation, desplegar, cambiar
  tráfico ni tocar producción.
- Gate I y el alta del tenant no deben declarar aprobado el flujo integrado
  hasta que la implementación haya pasado CI, merge y la validación del tenant
  correspondiente.

## Relación con decisiones vigentes

- **ADR-SAAS-041:** esta decisión modifica solo el flujo y el alcance de
  pedidos persistentes expresamente identificados arriba; las demás
  invariantes Bodega permanecen vigentes.
- **ADR-SAAS-042:** se conserva como autoridad atómica de la venta. Se añade
  únicamente una referencia no autoritativa a la solicitud aprobada para las
  ventas del rol `vendedor`; el servidor debe leer y consumir esa solicitud
  dentro de la misma transacción/idempotencia que confirma la venta. El resto
  del envelope cerrado y de los campos prohibidos de autoridad permanece
  intacto. Las ventas del rol `admin` conservan el comando directo.
- **ADR-SAAS-048 a 061:** no altera boundaries de despliegue, tenant,
  credenciales, membresías, auditoría de plataforma ni oferta comercial.

## Registro de aceptación

El responsable del proyecto confirmó el flujo integrado de solicitud y
aprobación y delegó la decisión de arquitectura para continuar E2.2. Se acepta
una vigencia server-side de 24 horas como control para evitar que una
autorización permanezca utilizable indefinidamente; esta duración fue una
decisión de ingeniería bajo la delegación explícita recibida, no un plazo
comercial informado por el cliente. La aprobación no reserva stock y la venta
solo se materializa mediante el comando canónico después del pago. La
actualización de alcance de E2.2/M2 y la dependencia de certificación M3/E3.1
deben integrarse junto con esta decisión documental.
