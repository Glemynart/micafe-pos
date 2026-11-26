# Preflight read-only de producción — 2026-11-26

**Proyecto:** `micafe-pos`
**Alcance:** metadatos de App Hosting, Cloud Run, Cloud Functions e IAM; no se
leyeron documentos de tenants ni objetos de Storage.
**Fuente de consultas:** APIs de Google Cloud/Firebase con las credenciales
locales ya configuradas. No se generaron identidades ni se modificó IAM.

## Resultado

### App Hosting y Cloud Run

- Backend `micafe-pos` en `us-central1`, runtime `nodejs24`, habilitado.
- Rollout/build productivo actual: `build-2026-11-24-002`, estado `READY`.
- Procedencia del build: `main@aa1c4fece1386edc6ba31b439a2be98ed9216d0b`.
- Cloud Run reporta `micafe-pos-build-2026-11-24-002` como revisión lista,
  `Ready=True`, con el 100 % de tráfico del servicio dirigido a esa revisión.
- La revisión productiva no contiene el HEAD de PR #706 (`0c32ee748cd13f1676525e5368294499735ddb11`).

### Cloud Functions e IAM de runtime

- Cloud Functions v2 devuelve 117 Functions productivas activas.
- Las 117 reportan la misma cuenta de runtime:
  `882525811433-compute@developer.gserviceaccount.com`.
- La política IAM del proyecto concede `roles/editor` a esa cuenta.
- `aceptarDocumentosLegalesTenant` y `consultarEstadoLegalTenant` están
  `ACTIVE`, runtime `nodejs22`, y registran actualización el 2026-11-24
  alrededor de las 07:53 UTC.
- Esto no demuestra el SHA fuente de las Functions. Sí demuestra que todas las
  Functions observadas comparten una identidad con permiso Editor a nivel de
  proyecto. Es un riesgo de mínimo privilegio que requiere decisión y migración
  coordinada; retirar el binding ahora podría afectar los 117 servicios.

### Inventario adicional de consumidores — 2026-11-26 04:38 UTC

- `gcloud functions list --v2` ubicó las 117 Functions en `us-central1`; las
  117 usan la cuenta Compute anterior. El barrido de Cloud Run consultó 43
  ubicaciones: 42 respondieron y una (`me-central2`) rechazó la consulta. Se
  observaron 118 servicios en total: las 117 Functions y un servicio App
  Hosting con `firebase-app-hosting-compute@micafe-pos.iam.gserviceaccount.com`.
  Ningún otro servicio Cloud Run observado usa la cuenta Compute.
- El barrido de Cloud Run Jobs consultó las mismas 43 ubicaciones: cero jobs en
  las 42 respuestas exitosas; `me-central2` no respondió. No se afirma ausencia
  de jobs en esa ubicación.
- Cloud Scheduler respondió en sus 34 ubicaciones: hay seis jobs y los seis
  usan la cuenta Compute como identidad OIDC. Son consumidores adicionales que
  deberán conservar autorización de invocación o migrarse antes de retirar el
  rol amplio; este hallazgo no impide probar otra identidad aislada para
  `saas-legal`.
- `gcloud app describe` indicó que el proyecto no tiene aplicación App Engine.
  La lista de cuentas de servicio de staging no contiene una identidad dedicada
  a `saas-legal`; no se creó ninguna cuenta.
- `cloudasset.googleapis.com` y `compute.googleapis.com` no aparecen entre las
  APIs habilitadas. La consulta de instancias de Compute fue rechazada por API
  deshabilitada; se dejó el valor por defecto de no habilitarla. Sin Cloud Asset
  Inventory y sin lectura de Compute no se puede demostrar que el inventario
  cubra todo tipo de workload o recursos preexistentes. No se amplió IAM ni se
  habilitó una API.
- El código de `saas-legal` usa Firestore y Admin Auth; no invoca Storage ni
  Pub/Sub. `roles/datastore.user` permitiría leer y escribir datos Firestore a
  nivel de proyecto, por lo que no es aislamiento por tenant. El permiso
  `firebaseauth.users.get` está incluido en `roles/firebaseauth.viewer`, que
  también concede algunas lecturas de configuración/proyecto. Estos son
  candidatos para validar y minimizar en el PR del piloto, no grants aprobados
  ni aplicados; los flujos conservan sus comprobaciones de tenant.

### Firestore Rules

- El intento de listar los releases de Firebase Rules recibió HTTP 403.
- No se pudo verificar la versión activa de Firestore Rules con esta identidad.
  No se interpreta el 403 como prueba de que las Rules no estén desplegadas.
- No se amplió IAM ni se habilitó ninguna API para superar este límite.

### PR #706 y evidencia funcional

- PR #706 continúa `OPEN`/`DRAFT`, HEAD `0c32ee748cd13f1676525e5368294499735ddb11`.
- CI run `45751560569` terminó `SUCCESS` para ese HEAD a las 04:20:57 UTC. Las
  notas locales posteriores aún no están publicadas y no están cubiertas por
  ese resultado.
- No se ejecutó smoke autenticado de aceptación en producción.
- No se ejecutó una exportación real de datos/archivos. La autorización
  reportada de Diana para el piloto no requiere su cuenta del tenant; la
  ejecución sí requiere operador SaaS con `CONSERVACION_GOBERNAR`, credenciales
  de lectura existentes y una referencia verificable de la instrucción.

## Gates que permanecen abiertos

1. Obtener evidencia autorizada de Rules activas y su ruleset/version.
2. Completar smoke autenticado en staging y el recorrido de aceptación
   productivo cuando los documentos estén aprobados para exigibilidad.
3. Completar el inventario global que quedó limitado por Compute y Cloud Asset,
   preparar la matriz de permisos runtime de `saas-legal` y aprobar por separado
   la creación/bindings necesarios en staging. No retirar `roles/editor` hasta
   inventariar todos los consumidores de la cuenta y probar cada migración.
4. Ejecutar la exportación real autorizada en paquete cifrado, validar
   documentos, subcolecciones y archivos y registrar solo metadatos no
   personales como evidencia.
5. Mantener la supresión real separada: el ejecutor disponible solo acepta
   fixtures sintéticos en Emulator.

Esta observación técnica no certifica cumplimiento jurídico ni autoriza por sí
sola un despliegue, una exportación o una supresión.
