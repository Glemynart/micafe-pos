# G-SAAS-02 / M2 / E2.2 — Primer rollout de App Hosting en staging

Fecha: 2026-10-15 (UTC; marcas de API incluidas abajo).

## Resultado

`PASS` para el primer rollout técnico de staging. Esto no acredita Gate I,
producción, el aislamiento autenticado completo ni la entrega de Diana.

- Proyecto Firebase: `micafe-pos-staging`.
- Backend: `micafe-pos`, región `us-central1`, runtime `nodejs24`, raíz `/`.
- Código: `origin/main @ a460f4d33be2ef08991fd0ed898c3e7e24c724b1`.
- PR #606 integrado; CI post-merge `38736731464` terminó `success` para ese SHA.
- Build: `build-2026-10-15-001`, estado `READY`, fuente exacta `a460f4d33be2ef08991fd0ed898c3e7e24c724b1`.
- Rollout: `build-2026-10-15-001`, estado `SUCCEEDED`, creado a las
  `2026-10-15T13:09:15Z`.
- Tráfico: lectura del recurso `traffic` a las `2026-10-15T13:16:19Z`: 100%
  al build `build-2026-10-15-001`. `rollout.updateTime` fue
  `2026-10-15T13:12:28Z`; el `traffic.updateTime` que devuelve la API es
  `2026-10-15T09:10:02Z` (anterior al rollout), por lo que se registra como
  metadato del recurso y no como hora de activación del tráfico.
- URL: `https://micafe-pos--micafe-pos-staging.us-central1.hosted.app`.
- Variables: siete nombres esperados presentes; `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  coincide con staging y `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION` con
  `us-central1`. No se registraron valores. No hay variable de Measurement ID.
- La captura de configuración aportada muestra rama `main`, raíz `/` y
  actualizaciones automáticas desactivadas. El recurso API confirma la raíz,
  pero no expone el campo de rama; el rollout se fijó explícitamente al SHA.

## IAM del runtime

El principal de ejecución mantiene:

- `roles/firebaseapphosting.computeRunner` (rol base de App Hosting).
- `appHostingStagingFirestoreRuntime`, con `datastore.databases.get` y
  permisos `datastore.entities` get/list/create/update, limitado por condición
  a `projects/micafe-pos-staging/databases/(default)`.
- `appHostingStagingFcmRuntime`, únicamente con
  `cloudmessaging.messages.create`.

Antes del rollout se retiraron solo de este principal los bindings sin condición
`roles/firebase.sdkAdminServiceAgent` y
`roles/developerconnect.readTokenAccessor`. Se rereleyó la política entre
escrituras y se confirmó después que los roles personalizados y `computeRunner`
permanecen. El analizador IAM del proyecto reportó esos roles para el principal;
el proyecto no declara parent folder en la lectura de metadata. No se modificó
ninguna otra identidad ni política de producción.

Las pruebas canary previas ejercitaron lectura, query, transacción create/update
y batch con el rol Firestore; delete fue denegado. La prueba FCM previa usó
`validate_only=true` y token sintético inválido: demostró que la solicitud llegó
a FCM sin entregar una notificación, pero no valida un token QA real.

## Verificación HTTP de runtime

Todas las solicitudes fueron GET y solo se conservaron estados HTTP y metadatos
no sensibles:

| Comprobación | Resultado | Interpretación |
|---|---:|---|
| `/` | 200 | HTML servido por App Hosting; título `POS Empresarial`. |
| Tres assets `/_next/static/chunks/*` | 200 cada uno | JS inicial disponible. |
| `/api/public/eventos?slug=codex-iam-smoke-20261015` | 404 | Respuesta esperada para el slug sintético inexistente; la ruta ejecutó su lectura de Firestore sin error IAM. |
| `/api/usuarios/tenant` sin bearer token | 401 | La ruta protegida rechaza acceso anónimo antes de devolver perfiles. |

`PASS` para build, rollout, tráfico y este smoke HTTP limitado.
`NOT EXECUTED` para sesión autenticada en App Hosting, lectura tenant propia y
denegación cross-tenant en runtime. La CI post-merge ejecutó las suites de
aislamiento y E2E en Emulator, que son evidencia complementaria y no reemplazan
la prueba autenticada en staging.

## Riesgo y recuperación

La matriz oficial consultada para este release mantiene Next.js 16.4.1 en
Preview en Firebase App Hosting. Su uso se limita a staging. No había un build
anterior antes de este primer rollout; ante un defecto en este build, detener
pruebas y hacer forward-fix desde un SHA corregido. El build actual queda como
versión disponible para recuperación de un rollout posterior, pero no se ha
ensayado un rollback de tráfico.

No se ejecutó FCM con destinatario real, no se creó tenant/usuario ni se
modificaron Rules, Functions, Vercel o producción. No se usaron datos de Diana.

## Pendiente para continuar

- Autorizar/identificar una identidad QA existente de staging, tenant sintético,
  rol/claims y alcance read-only; ejecutar login, lectura propia y rechazo
  cross-tenant sin crear credenciales ad hoc.
- Para probar FCM `dryRun` con token válido se requiere token QA vigente y
  destinatario autorizado; no enviar notificaciones reales.
- Gate I productivo permanece bloqueado por su evidencia separada de Rules,
  Functions, publicación web, controles de compras y smoke productivo. Este
  rollout staging no modifica esos estados.
- Trial de Diana: fecha comunicada `2026-10-15`; `NOT EXECUTED`, sin tenant,
  membresía o credenciales creadas.
- DIAN web continúa sin autoridad server-side; el Trial no fiscal aceptado no
  certifica facturación electrónica.
