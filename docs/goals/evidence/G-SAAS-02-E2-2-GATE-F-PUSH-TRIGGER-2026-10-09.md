# G-SAAS-02 / M2 / E2.2 — Gate F: despacho automático de solicitud (2026-10-09)

## Dictamen puntual

**PASS para un único despacho automático trigger/outbox en staging.** Esto no
cierra los reintentos, la recepción visible en el dispositivo, ni Gate F.

## Alcance y observación

- Proyecto: `micafe-pos-staging`.
- Tenant: `E2_2-BODEGA-STAGING-FIXTURE`.
- Una solicitud sintética, ID terminado en `4NjMxIl0`, fue creada por el flujo
  autenticado y quedó inicialmente `PENDIENTE_APROBACION`.
- El trigger `notificarSolicitudVentaBodegaPendienteV1`, revisión
  `notificarsolicitudventabodegapendientev1-00001-raf`, recibió una invocación
  Cloud Run HTTP `204` a las `2026-10-09T08:47:34.774461Z`.
- El evento outbox `SOLICITUD_VENTA_BODEGA_PENDIENTE` enlazado a esa solicitud
  (ID terminado en `4SWwwIl0`) quedó `ENVIADO`, con un intento y sin error,
  aproximadamente a las `08:47:36Z`.
- La solicitud fue aprobada después, a las `08:49Z`; por tanto, el evento se
  despachó cuando seguía pendiente, conforme a ADR-SAAS-065.

La correspondencia se verificó con lecturas REST selectivas de los documentos
de solicitud/outbox y Cloud Logging del servicio exacto en el proyecto staging.
La secuencia temporal y el resultado `ENVIADO` demuestran que el trigger hizo
el despacho FCM automático; no se invocó manualmente el Scheduler ni una
callable para fabricar el resultado.

## Límites de la evidencia

- No se observó la notificación en la pantalla, segundo plano o sistema
  operativo del administrador para este evento; `ENVIADO` prueba aceptación
  del envío por FCM, no lectura humana, sonido ni entrega al dispositivo.
- No se probaron fallo transitorio, retry, replay, carrera trigger/Scheduler,
  destinatarios múltiples ni aislamiento entre tenants.
- Esta prueba no crea otra venta ni cambia ledger, inventario o turno.

## Seguimiento staging — segundo despacho sintético

- El 2026-10-09, Codex envió desde la sesión autenticada del vendedor una
  segunda solicitud sintética de venta para hoy, ID terminado en `yOTk3Il0`,
  por una presentación (2 unidades base) y `$5.000 COP`. Sigue en
  `PENDIENTE_APROBACION`.
- El evento outbox asociado, ID terminado en `zSWwwIl0`, tipo
  `SOLICITUD_VENTA_BODEGA_PENDIENTE`, quedó `ENVIADO`, intento `1`, sin error.
  Cloud Logging registró HTTP `204` del trigger
  `notificarsolicitudventabodegapendientev1` a las
  `2026-10-09T09:45:50.592146Z`.
- Lecturas posteriores confirmaron producto con 4 unidades disponibles y 0
  reservadas; no se creó venta ni movimiento de inventario/ledger. La solicitud
  permanece pendiente, sin aprobación de administrador.
- Tras iniciar sesión en la bandeja administrativa de staging, la solicitud
  apareció como `PENDIENTE_APROBACION`. El administrador inició sesión después
  del despacho: esto comprueba carga en la bandeja, pero no actualización en
  tiempo real, recepción push en el sistema operativo ni sonido.
- La recepción de esta notificación concreta en el dispositivo del
  administrador no fue confirmada. Por tanto, es una segunda evidencia de
  despacho automático trigger/outbox, no de entrega visible ni sonora.

## Agenda staging — reserva aceptada

- Desde la sesión de vendedor se creó una agenda sintética para el
  `2026-10-10`, cliente `E2_2-BODEGA-STAGING-FIXTURE-CLIENTE-GATE-F`, una
  presentación de 2 unidades base y sin franja horaria. La solicitud quedó
  pendiente de revisión; no tenía dirección de entrega registrada.
- En la bandeja `/admin/agenda` del mismo tenant, Codex aceptó la agenda. La UI
  confirmó `Stock reservado`: 2 unidades base retenidas hasta el
  `2026-10-11 00:00` hora de Bogotá. Conforme a la UI, no se creó venta ni
  movimiento financiero.
- La agenda del vendedor no reflejó la reserva hasta pulsar `Actualizar
  agenda`; después mostró `Reservado: 2 unidades base` y el vencimiento. Esto
  verifica el ciclo crear/aceptar/reservar/consultar, pero deja pendiente la
  reconciliación automática al llegar el vencimiento, y no valida sincronía en
  vivo.
- La expiración todavía no ocurrió al momento de esta observación. No se
  alteraron fechas, reloj, datos por escritura directa ni Scheduler para
  acelerar el resultado.

## Salud del Scheduler — 2026-10-09 10:05 UTC

- El job `firebase-schedule-reconciliarAgendaPedidosBodegaV1-us-central1` se
  observó `ENABLED`, con frecuencia de cinco minutos y zona `UTC`; su último
  intento fue `2026-10-09T10:03:04.040610Z`.
- Cloud Logging del servicio
  `reconciliaragendapedidosbodegav1` registró HTTP `200` para las invocaciones
  de `09:48:09.521894Z`, `09:53:12.155571Z`, `09:58:05.865629Z` y
  `10:03:04.064521Z`.
- Esas respuestas acreditan que el Scheduler alcanzó la Function sin error en
  esas ejecuciones. La lectura ocurrió antes de la hora prevista del recordatorio
  `dia_anterior` de la agenda activa; por tanto, no prueba despacho de ese
  recordatorio, liberación automática de reserva ni entrega FCM. No se invocó el
  job manualmente.

## Estado de agenda y destinatarios — lectura posterior, 2026-10-09

- Una consulta read-only posterior confirmó que la agenda sintética (ID con
  sufijo `zNTNmIl0`) sigue `RESERVADA`; la reserva (ID con sufijo `WWlKZCJd`)
  permanece `ACTIVA` por 2 unidades base y expira en
  `2026-10-11T05:00:00Z` (`2026-10-11 00:00` Bogotá). Sus eventos
  `creada` y `reservada` están `ENVIADO`; `dia_anterior` sigue `PENDIENTE`
  para `2026-10-09T13:00:00Z` (08:00 Bogotá), y `fecha_programada` sigue
  `PENDIENTE` para `2026-10-10T13:00:00Z` (08:00 Bogotá). Ambos recordatorios
  tenían cero intentos al consultar; el Scheduler aún no había demostrado su
  despacho.
- En el producto sintético, Firestore mostraba 4 unidades físicas, 2
  reservadas y 2 disponibles. La solicitud de venta pendiente seguía sin una
  venta canónica; el estado `stockReservado` corresponde a la agenda aceptada,
  no a una reserva de la solicitud. Se leyeron 4 tokens FCM en el perfil admin
  y 3 en el perfil del vendedor solicitante; el conteo no prueba que sean
  válidos ni que FCM haya entregado un aviso. Los valores de token no se
  imprimieron ni guardaron.
- La inspección de código confirma que la vista admin de solicitudes realiza
  una consulta inicial y se recarga al pulsar `Actualizar` o después de
  resolver una solicitud; no tiene suscripción en tiempo real. El usuario
  había indicado dejar esa mejora para después de Gate F. No se presenta como
  funcionalidad PASS ni se incluyó en este PR.
- La lectura no alteró eventos, agenda, membresías, tokens, stock, ventas,
  ledger, Scheduler ni producción. No se forzó la ejecución del job.

## Validación local complementaria

- `npm --prefix functions-bodega test`: `14/14 PASS` en el código de Functions
  de `origin/main @ 3a509963a713c13e31385a7b155332c4e55edb6d`, que es idéntico
  al código de esta rama; la rama solo añade documentación.
- `npm run e2e:bodega-agenda`: `6/6 PASS` en Firestore Emulator con el proyecto
  demo `demo-bodega-agenda`; cubrió concurrencia de reservas, conversión
  idempotente, aislamiento de tenant/actor y permisos.
- `npm run e2e:bodega-u4-u5`: `9/9 PASS` en Auth/Firestore/Functions Emulator
  con el proyecto demo `demo-bodega-u4-u5-ui`; cubrió solicitud, aprobación y
  venta canónica, aislamiento A/B en UI/callables, Backoffice y alta canónica
  de vendedor.
- La suite incluye contratos locales de expiración/liberación, reintento,
  concurrencia del claim trigger/Scheduler y destinatarios de notificaciones.
  Usa dobles de prueba/emulador local; no acredita que el recordatorio o la
  expiración hayan ocurrido en staging.
- Durante el arranque de la E2E integrada, el emulador intentó resolver
  `OPERATIONAL_PIN_PEPPER` en Secret Manager del proyecto demo y recibió `403`;
  no obtuvo el secreto. El recorrido continuó y pasó 9/9. Es una advertencia de
  aislamiento/configuración local del runner, no una lectura o escritura de
  staging ni producción.

## Auditoría de mutaciones

- Codex creó una solicitud por el flujo UI autenticado de vendedor; escrituras
  directas de Firestore `0`.
- Codex inició sesión con la sesión de staging ya guardada. La solicitud de
  venta terminada en `yOTk3Il0` solo se consultó; no se aprobó ni rechazó.
- Conforme a la autorización explícita para retener 2 unidades en staging,
  Codex creó la agenda sintética por el flujo UI de vendedor y la aceptó por la
  UI de administrador. No ejecutó escrituras directas de Firestore; la reserva
  de 2 unidades permanece activa hasta su vencimiento programado.
- Scheduler y Cloud Logging de `micafe-pos-staging`: lecturas únicamente; no
  se alteró la programación ni se forzó ninguna ejecución.
- Suite local de Functions Bodega: `14/14 PASS`; ninguna escritura remota.
- E2E de agenda y PWA/Backoffice: `6/6` y `9/9 PASS`, solo en Emulator/demo;
  no modificaron staging ni producción.
- La solicitud anterior fue aprobada por la actividad de usuario ya reflejada
  en staging; la segunda solicitud sigue pendiente y Codex no la aprobó.
- Functions, Scheduler, IAM, Rules, Secrets, configuración, Auth, Vercel,
  fixture adicional, tenant real y producción: cambios de Codex `0`.

Gate F permanece `EN CURSO`; los demás escenarios remotos permanecen según la
[matriz parcial de Gate F](G-SAAS-02-E2-2-GATE-F-PARTIAL-VERIFICATION-2026-10-08.md).

## Seguimiento staging — ciclo de revocación/restauración de vendedor, 2026-10-09

En `micafe-pos-staging`, sobre el fixture existente
`E2_2-BODEGA-STAGING-FIXTURE`, se ejecutaron por la interfaz canónica de
Backoffice dos transiciones autorizadas sobre el vendedor sintético F (UID
terminado en `230fe`): `activa → inactiva` y luego `inactiva → activa`. No se
creó otra identidad ni se editó Firestore directamente.

Cloud Logging del servicio `actualizarmembresiabodegav1`, revisión
`actualizarmembresiabodegav1-00002-zog`, registró ambas solicitudes callable
con HTTP `200`: `2026-10-09T12:33:22.412789Z` y
`2026-10-09T12:33:44.426268Z`. La lectura autenticada de `/admin/usuarios`
después del ciclo mostró al vendedor F nuevamente activo. En la PWA del mismo
vendedor, la vista `Solicitudes` cargó desde servidor la bandeja existente
después de la restauración; no se envió otra solicitud ni se confirmó una
venta.

La consulta Firestore REST de solo lectura a `saas_auditoria`, filtrada por
`MEMBRESIA_BODEGA_ESTADO_ACTUALIZADO` y limitada a la empresa objetivo,
encontró los dos hechos append-only correspondientes: revocación
`activa → inactiva` registrada a `2026-10-09T12:33:24.020Z` y restauración
`inactiva → activa` registrada a `2026-10-09T12:33:45.180Z`. Ambos indican
`resultado = CONFIRMADO` y actor `ADMIN_TENANT`. Esto verifica la emisión de
auditoría canónica de ambas transiciones; no se leyó ni registró el PIN.

Esto verifica el ciclo remoto de revocación/restauración y el acceso posterior
del vendedor, pero no un replay remoto: la interfaz genera un `commandId`
nuevo por operación y no expone una acción de reintento con el mismo comando.
La suite local del paquete `functions-bodega-membership` pasó `npm run build`
y `npm test` (`11/11`), incluidos restauración/re-sincronización de claims,
replay sin duplicar obligación/auditoría, conflicto de idempotencia y
aislamiento de tenant. Esta cobertura local no se presenta como evidencia de
replay en staging.

### Auditoría de mutaciones del ciclo de membresía

- Proyecto/tenant: únicamente `micafe-pos-staging` /
  `E2_2-BODEGA-STAGING-FIXTURE`.
- Membresía: dos transiciones canónicas de estado del vendedor sintético F;
  estado final activo.
- Firestore/Auth: sin escrituras directas; las dos operaciones se tramitaron
  por `actualizarMembresiaBodegaV1`.
- Solicitudes nuevas, ventas, inventario, ledger y turnos: cambios `0`.
- Rules, Functions, IAM, Secrets, despliegues, producción y tenant real:
  cambios `0`.
- Gate F permanece `EN CURSO`: el replay remoto y los restantes escenarios de
  Gate F siguen pendientes.

### Revalidación local independiente de escenarios Gate F — 2026-10-09

Para avanzar sin esperar el recordatorio remoto programado, se ejecutaron las
siguientes suites exclusivamente con Firebase/Firestore Emulator y datos demo:

- `npm run e2e:bodega-agenda`: `6/6 PASS`, incluidos límite de stock bajo dos
  reservas concurrentes, conversión concurrente idempotente y aislamiento de
  tenant/actor.
- `npm run e2e:bodega-u4-u5`: `9/9 PASS`, incluida pérdida de respuesta y
  reintento del mismo comando, venta única con efectos persistidos, aislamiento
  A/B en UI y callable, y flujos de vendedor y administrador.
- `ventas-confirmation.test.ts` en Firestore Emulator: `10/10 PASS`, incluida
  doble confirmación concurrente con un solo conjunto atómico de efectos,
  conversión de reserva ligada a venta y rechazo posterior al vencimiento.
- `ventas-resolution.test.ts` en Firestore Emulator: `7/7 PASS`, incluida la
  carrera de dos consumos reales donde solo uno descuenta stock y deja un único
  movimiento de inventario.
- `npm --prefix functions-bodega test`: `14/14 PASS`, incluidos worker de
  recordatorios, reintento/backoff, claim concurrente entre trigger y
  Scheduler, expiración automática que libera stock y liberación por lotes.
- `npm run test:bodega-ui`: `12/12 PASS`, incluida restauración canónica del
  operador y doble submit de solicitud colapsado a una sola ejecución.
- `npm run test:firebase-push-service-worker`: `9/9 PASS`, incluida espera
  por un Service Worker activo, presentación única en background y navegación
  al recibir/clicar una notificación.
- `npm --prefix functions-bodega run build`: TypeScript `PASS`.

Estas ejecuciones confirman comportamiento local de los escenarios enumerados,
no son evidencia de ejecución remota en `micafe-pos-staging`. Los resultados
remotos pendientes de la matriz —incluidos el despacho del recordatorio y la
expiración automática de una reserva— requieren verificación en staging.

En una lectura remota selectiva a `micafe-pos-staging` a las `12:47 UTC`, el
fixture tenía una agenda `RESERVADA` para `2026-10-10` (`America/Bogota`), con
2 unidades base retenidas y expiración a `2026-10-11T05:00:00Z`. Su evento
`dia_anterior` seguía `PENDIENTE`, programado exactamente para
`2026-10-09T13:00:00Z`; el evento `fecha_programada` está programado para
`2026-10-10T13:00:00Z`. Esta lectura fija el estado previo al envío; no se
forzó la ejecución ni se modificó agenda, reserva o Scheduler.

### Resultado automático del recordatorio `dia_anterior` — 2026-10-09 13:03 UTC

- El Scheduler habilitado ejecutó el job `firebase-schedule-reconciliarAgendaPedidosBodegaV1-us-central1` automáticamente. Cloud Logging registró HTTP `200` a `2026-10-09T13:03:01.686930Z` para la revisión `reconciliaragendapedidosbodegav1-00002-fir`.
- La lectura REST posterior del evento asociado a la única agenda sintética `RESERVADA` para `2026-10-10` mostró `dia_anterior = ENVIADO`, `intentos = 1`, sin código de error y `fechaProgramada = 2026-10-09T13:00:00Z`.
- El evento `fecha_programada` sigue `PENDIENTE`, con cero intentos, para `2026-10-10T13:00:00Z`; la reserva continúa antes de su vencimiento programado `2026-10-11T05:00:00Z`.
- Esto verifica el despacho automático del recordatorio del día anterior por el worker en staging. El estado persistido no demuestra por sí solo que el administrador lo haya visto en pantalla ni que el sistema operativo haya emitido sonido. No se llamó manualmente al Scheduler ni se modificó la agenda.

### Suite Functions canónica — 2026-10-09

En el worktree de esta evidencia, sobre `origin/main @ 51ba17311f7493a3799154a1200a5ef0ae70a67b` (la rama de PR solo añade este documento), `npm --prefix functions test` terminó con `422` pruebas: `417` PASS, `5` SKIP y `0` fallos. Incluye replay del mismo comando de solicitud con una única solicitud y un único evento push. Esta ejecución local complementa Emulator; no sustituye retry/replay autenticado ni concurrencia remotos de Gate F.

### Inspección read-only adicional de la PWA — 2026-10-09

En el Preview post-merge de PR #506, la sesión del vendedor sintético mostró
`Solicitudes`, `Mi agenda`, `Clientes` y `Mis ventas`. Al abrir `Mi agenda`, la
instantánea de accesibilidad mostró el encabezado y el botón `Actualizar agenda`
deshabilitado, pero aún no una tarjeta. Como el botón deshabilitado indica una
consulta en curso, esa instantánea no demuestra que la lista estuviera vacía.
No se confirmó ninguna de las dos solicitudes `APROBADA`, no se canceló otra,
no se creó solicitud/agenda/cliente y no se alteraron ventas, inventario, ledger
ni turnos.

Una lectura Firestore REST posterior, limitada a las agendas y reservas del
fixture en `micafe-pos-staging`, encontró siete agendas: seis `CANCELADA` o
`CUMPLIDA` y una `RESERVADA` para `2026-10-10`. La agenda activa pertenece al
vendedor sintético cuyo UID termina en `230fe`; su reserva sigue `ACTIVA` por
2 unidades base y vence a `2026-10-11T05:00:00Z`. La lectura no escribió datos.

Cloud Logging registró HTTP `200` de
`consultaragendapedidosbodegav1-00002-vaz` a las `2026-10-09T13:08:25.662769Z`.
La respuesta no registra el cuerpo, por lo que este log no demuestra por sí
solo qué proyectó el cliente. Sí demuestra que la llamada remota no terminó en
error HTTP.

Como corroboración visual, una sesión autenticada del mismo vendedor en la
pestaña del preview anterior `cafeatrato-git-codex-e2-2-gate-d-dep-c70f67`
mostró `Mi agenda` cargada: seis entradas históricas (`CANCELADA` o
`ATENDIDA`) y la entrada `Stock reservado` del `2026-10-10`, con 2 unidades
base y vencimiento `11/10/2026, 12:00 a. m.`. Esto prueba la proyección en esa
sesión/preview staging, no sustituye una captura posterior al login en el host
post-merge de PR #506. Ese host expiró a login durante la inspección; no se
atribuyó su estado intermedio de carga a una agenda vacía. No se canceló,
convirtió ni confirmó ninguna entrada.

En el formulario sin enviar, `Pedido para hoy` mostró la fecha local actual
(`2026-10-09`). `Agendar entrega` propuso `2026-10-10` y expuso campos
opcionales `Desde`/`Hasta`; el texto informa que fecha y franja son preferidas,
que administración debe aceptar para reservar existencias y que precio y
entrega exacta no quedan confirmados al agendar. Se restauró la opción
`Venta de hoy` y el borrador terminó vacío.

El catálogo mostró una presentación con `Disponibles: 1`; el carrito local
permitió subir ese borrador a cantidad `2`. Se retiró el borrador sin enviarlo.
La inspección del código confirma que la solicitud resuelve el catálogo y el
precio en servidor, mientras el consumo canónico aplica `exigirStockSuficiente`
al confirmar la venta. Por lo tanto, esta observación no demuestra una venta
con sobreventa; registra que el cliente no limita el borrador a la disponibilidad
mostrada. La actualización en vivo y el tope visual de cantidad se mantienen
como mejora posterior a Gate F, según la priorización acordada con el usuario.

La pestaña de Edge del administrador estaba en `/admin/login`; no se intentó
automatizar la autenticación. La sesión del vendedor no se usó para atribuir
capacidades administrativas.

Esta lectura es evidencia puntual de la UI, no la matriz funcional completa de
staging. No cambia el estado de Gate F (`EN CURSO`) ni acredita replay,
concurrencia remota, aislamiento A/B o retry tras pérdida de respuesta.

### Revalidación local de Rules y reportes — 2026-10-09

- `npm run test:rules`: `37/37 PASS` con Firestore Emulator en el proyecto demo
  `demo-mt-u4-rules`. Incluye el límite vendedor/administración de Bodega,
  movimientos de inventario backend-only, aislamiento de lectura del Kardex
  entre tenants, y auditoría/movimientos append-only.
- `npx tsx --test lib/__tests__/reportes-tenant.test.ts`: `2/2 PASS`; reportes
  no consulta perfiles globales y resuelve roles desde membresías del tenant.
- Ambas ejecuciones son locales, sin escrituras a staging o producción; no
  sustituyen la comprobación autenticada A/B ni la revalidación funcional
  remota de reportes.
- La primera ejecución de Rules no llegó a cargar las pruebas porque el
  worktree aislado no tenía dependencias instaladas. Tras instalar desde el
  lockfile en ese worktree, la suite completa terminó correctamente. No se
  modificaron manifiestos ni código de aplicación.

Esto añade cobertura local independiente del calendario de agenda, pero Gate
F permanece `EN CURSO` hasta cerrar la evidencia remota restante.

### Revalidación read-only del runtime operativo — 2026-10-09 13:27 UTC

`gcloud functions list --project micafe-pos-staging --regions=us-central1`
mostró 17 Functions operativas relacionadas con Bodega, ventas, agenda e
inventario en estado `ACTIVE`, todas con runtime `nodejs22`. Entre ellas están
`crearSolicitudVentaBodegaV1`, `resolverSolicitudVentaBodegaV1`,
`confirmarVentaBodegaV1`, `consultarAgendaPedidosBodegaV1`,
`reconciliarAgendaPedidosBodegaV1`, `notificarSolicitudVentaBodegaPendienteV1`
y `actualizarArticuloInventarioV1`.

La consulta fue de inventario de Functions, sin lectura de configuración
secreta ni mutaciones. Confirma que el runtime staging continúa disponible en
la región prevista; no acredita autorización, resultado funcional de llamadas,
aislamiento A/B ni los casos remotos pendientes de Gate F.
