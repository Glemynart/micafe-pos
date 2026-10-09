# ADR-SAAS-065 — Aviso durable de solicitudes de venta Bodega

## Estado

**ACEPTADO — 2026-10-08 (Bogotá).**

- **Goal:** `G-SAAS-02` → `M2` → `E2.2` (Gate F).
- **Decisor de alcance:** responsable del proyecto, que delegó explícitamente
  la resolución autónoma de arquitectura y ejecución de E2.2.
- **Recomendación técnica:** Lead Engineer.
- **Relacionados:** ADR-SAAS-018, ADR-SAAS-062, ADR-SAAS-064 y D-NOTIF-02.

**Ajuste de seguridad de implementación (2026-10-08):** el payload FCM omite
también el ID interno del evento. El ID es reversible y el Service Worker no lo
necesita para abrir `/admin/solicitudes`; el identificador permanece solo en el
outbox/backend.

La aceptación autoriza implementar esta única familia de avisos mediante el
proceso normal de rama, PR, CI, auditoría y merge. El despliegue posterior se
limita a `micafe-pos-staging` y requiere los preflights de Gate C/D. No autoriza
tenant real, producción, ni cambios en Rules, IAM, Secrets o tráfico productivo.

## Contexto

ADR-SAAS-062 deja una solicitud de venta en estado pendiente hasta que la
administración la apruebe o rechace. La solicitud ya es durable y aparece en la
lista de solicitudes, pero su creación no emite un evento ni notifica al admin.
La notificación foreground actual es solo un toast cuando el cliente recibe un
mensaje FCM; no sustituye una emisión server-side confiable.

Además, el panel administrativo cierra la sesión tras siete minutos de
inactividad. El logout común elimina el token FCM. Por eso un push enviado
después del timeout no alcanzaría ese dispositivo. Mantener una sesión
administrativa indefinida para recibir avisos aumentaría la exposición de datos
ante un dispositivo desatendido y no es necesario para que el Service Worker
reciba Web Push.

ADR-SAAS-018 acepta outbox durable y dispatcher server-side, pero excluyó ventas
del catálogo inicial. ADR-SAAS-064 ya materializa en `saas-bodega` un dispatcher
programado para recordatorios de agenda; su cadencia máxima es cinco minutos.
Esta decisión añade únicamente el aviso de solicitud pendiente a ese patrón y
un trigger de baja latencia, manteniendo el Scheduler como recuperación.

## Drivers

- Avisar a administradores activos del tenant cuando una solicitud nueva queda
  persistida, sin depender de que una pestaña esté abierta.
- Mantener solicitud y evento atómicos e idempotentes bajo autoridad server-side.
- Conservar el cierre de sesión por inactividad y permitir recibir push luego
  del timeout.
- No incluir nombre/documento de cliente, líneas, precio, PIN ni otros datos
  sensibles en el mensaje push.
- Evitar duplicar centros de notificación o añadir proveedores externos.
- Conservar FCM como best-effort: ni el navegador ni el sistema operativo
  garantizan recepción, persistencia visual o sonido.

## Opciones consideradas

### Opción 1 — Desactivar el timeout de administrador

**Rechazada.** Facilita la recepción mientras la página vive, pero deja una
sesión administrativa abierta en un dispositivo desatendido, no cubre la app
cerrada y no resuelve la emisión durable.

### Opción 2 — Evento/outbox existente, trigger inmediato y token conservado en timeout

**Aceptada.** La creación escribe una notificación durable en la misma
transacción que la solicitud. Un trigger Firestore intenta el despacho al
confirmarse la transacción; el Scheduler existente reintenta los eventos
elegibles. Los reclamos transaccionales evitan despachos concurrentes. El
logout por inactividad cierra Auth pero conserva el token FCM del admin; el
logout manual conserva el comportamiento actual y lo elimina.

### Opción 3 — Centro de notificaciones persistente dentro del POS

**Fuera de alcance.** Añade otra proyección, consultas y UX de bandeja. La
solicitud pendiente ya permanece visible en `/admin/solicitudes`; el push solo
avisa y al pulsarlo dirige a esa lista.

## Decisión

Se acepta la **Opción 2**, con estas reglas:

1. `crearSolicitudVentaBodegaV1` crea en la misma transacción:
   - `empresas/{empresaId}/solicitudes_venta_bodega/{solicitudId}`;
   - un evento de `eventos_operativos` con tipo
     `SOLICITUD_VENTA_BODEGA_PENDIENTE`, ID determinista y estado
     `PENDIENTE`.
   Si el evento no se puede escribir, la transacción no crea una solicitud
   incompleta. El replay del comando no crea otro evento.
2. El evento solo conserva el tenant, referencia de solicitud y datos de
   correlación/estado necesarios para el dispatcher. El payload FCM no incluye
   IDs de tenant, solicitud o evento: solo texto genérico (“Nueva solicitud de
   venta — Hay una solicitud pendiente de revisión.”) y el enlace
   `/admin/solicitudes`.
3. El dispatcher revalida en backend que la solicitud sigue
   `PENDIENTE_APROBACION`, vuelve a seleccionar membresías activas con rol
   `admin` de ese mismo `empresaId`, y lee tokens solo de esos perfiles. No
   envía al vendedor ni acepta destinatarios del cliente. Solicitudes resueltas
   antes del despacho se marcan omitidas.
4. Un trigger Firestore sobre la creación de la solicitud intenta el despacho
   inmediatamente después del commit. Reutiliza el mismo claim transaccional y
   el mismo outbox que el worker `saas-bodega`; el Scheduler vigente recupera
   los estados reintentables. FCM nunca se invoca dentro de la transacción de
   dominio.
5. Un logout causado por inactividad en el panel del tenant puede cerrar la
   sesión admin a los siete minutos, pero conserva su token FCM registrado para
   que el Service Worker activo pueda recibir avisos. Un cierre manual de
   sesión sigue quitando el token; no se elimina ni persiste ningún token en el
   dispositivo fuera de la política actual.
6. El aviso no es autorización ni venta. No aprueba, reserva stock, cobra ni
   escribe ledger. La solicitud continúa en la lista hasta resolverse conforme
   a ADR-SAAS-062.
7. Foreground puede mostrar un toast; background usa la notificación estándar
   del navegador/SO. No se garantiza sonido, entrega, duración hasta cierre ni
   lectura humana. El sonido y la presentación dependen de permisos y ajustes
   del dispositivo.

## Garantías, aislamiento y reintentos

- La emisión del evento es durable y atómica; el transporte es `at-least-once`
  y best-effort, sin promesa de entrega exactamente una vez.
- Los tokens se resuelven solo después de validar la membresía activa del
  destinatario en el tenant del evento. La membresía se revalida al despachar.
- Tokens inválidos se purgan por el mecanismo server-side existente. Fallos
  transitorios conservan el evento y siguen el backoff/reintentos acotados del
  worker existente.
- Un evento sin destinatario elegible no afecta la solicitud. La solicitud
  persiste y puede consultarse en Backoffice/POS; FCM no es fuente de verdad.
- El payload no contiene PII, detalles comerciales ni identificadores de
  correlación; el Service Worker solo navega a una ruta del mismo origen.
- No se relajan Rules ni se habilita escritura cliente sobre outbox/eventos.

## Validación requerida

- Emulator/CI: atomicidad solicitud-evento, ID determinista/replay, aislamiento
  entre tenants, solo admins activos, evento obsoleto, cero PII, ausencia de
  tokens, token inválido, retry y carrera entre trigger y Scheduler.
- Auth/UI: timeout conserva token FCM; logout manual lo elimina; una notificación
  background después del timeout abre la ruta de solicitudes y vuelve a exigir
  login para ver contenido protegido.
- Gate C/D: preflight y despliegue dirigidos al único codebase `saas-bodega` en
  `micafe-pos-staging`, sin cambios a Rules, IAM, Secrets ni producción.
- Gate F: inspección staging correlaciona solicitud, evento, destinatario y
  notificación sin crear venta o mutación financiera. CI no sustituye la
  validación del navegador.

## Consecuencias y rollback

La administración puede recibir un aviso genérico aunque la sesión haya
expirado, y el botón del aviso conduce a autenticación antes de exponer la
solicitud. Se agrega un evento de dominio y un trigger al codebase ya aislado;
el Scheduler conserva recuperación de fallos. El costo es un trigger y una
consulta de membresías/tokens por solicitud.

El rollback deshabilita el trigger/productor mediante un PR posterior. Las
solicitudes existentes permanecen disponibles y no se borran eventos ni se
revierte una operación de negocio. Los tokens retenidos tras un timeout pueden
eliminarse mediante logout manual o por la purga vigente si son inválidos.

## Registro de aceptación

El responsable del proyecto pidió que la administración recibiera alertas de
solicitudes de venta en sus dispositivos y delegó explícitamente al Lead
Engineer resolver de forma autónoma la arquitectura de E2.2. Se acepta mantener
el timeout de seguridad y conservar el token únicamente en el logout por
inactividad; el cierre manual continúa revocándolo. El alcance queda limitado a
esta alerta Bodega, y no convierte la decisión en un centro completo de
notificaciones ni garantiza sonido.
