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

## Auditoría de mutaciones

- Codex creó una solicitud por el flujo UI autenticado de vendedor; escrituras
  directas de Firestore `0`.
- Codex inició sesión con la sesión de staging ya guardada. La solicitud de
  venta terminada en `yOTk3Il0` solo se consultó; no se aprobó ni rechazó.
- Conforme a la autorización explícita para retener 2 unidades en staging,
  Codex creó la agenda sintética por el flujo UI de vendedor y la aceptó por la
  UI de administrador. No ejecutó escrituras directas de Firestore; la reserva
  de 2 unidades permanece activa hasta su vencimiento programado.
- La solicitud anterior fue aprobada por la actividad de usuario ya reflejada
  en staging; la segunda solicitud sigue pendiente y Codex no la aprobó.
- Functions, Scheduler, IAM, Rules, Secrets, configuración, Auth, Vercel,
  fixture adicional, tenant real y producción: cambios de Codex `0`.

Gate F permanece `EN CURSO`; los demás escenarios remotos permanecen según la
[matriz parcial de Gate F](G-SAAS-02-E2-2-GATE-F-PARTIAL-VERIFICATION-2026-10-08.md).
