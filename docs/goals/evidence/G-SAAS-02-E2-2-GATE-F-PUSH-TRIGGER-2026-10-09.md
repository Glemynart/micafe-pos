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

## Auditoría de mutaciones

- Codex: lecturas únicamente; escrituras directas de Firestore `0`.
- La solicitud fue creada y aprobada por la actividad de usuario ya reflejada
  en staging; Codex no ejecutó esas transiciones.
- Functions, Scheduler, IAM, Rules, Secrets, configuración, Auth, Vercel,
  fixture adicional, tenant real y producción: cambios de Codex `0`.

Gate F permanece `EN CURSO`; los demás escenarios remotos permanecen según la
[matriz parcial de Gate F](G-SAAS-02-E2-2-GATE-F-PARTIAL-VERIFICATION-2026-10-08.md).
