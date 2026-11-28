# Preflight estático de permisos — `saas-legal`

**Fecha:** 2026-11-26 (preflight estático: 19:47 UTC)
**Fuente de operaciones Firestore/Auth:** checkout `codex/e2-2-legal-acceptance`, HEAD `6f218eb220cd325aa58ad1f7e87689cb11d29aa9`.
**Estado:** inventario derivado de código. El resultado posterior del piloto de staging está documentado en [resultado del piloto](RESULTADO-PILOTO-SAAS-LEGAL-STAGING-2026-11-26.md); la suficiencia efectiva de permisos aún no está certificada.

Este documento registra la matriz estática del paso 2 de [ADR-SAAS-105](../../../ADR-SAAS-105-identidades-runtime-functions-minimo-privilegio.md) solo para el codebase `saas-legal`. El inventario se preparó antes del piloto; las escrituras IAM y el despliegue posteriores se registran en el resultado enlazado arriba.

## Superficie encontrada

`firebase.json` registra `functions-legal` como codebase `saas-legal`, Node.js 22, con cuatro callable Functions en `us-central1`. `functions-legal/src/index.ts` no establece `serviceAccount`; las observaciones de recursos activas documentadas en el preflight productivo indican que la versión desplegada todavía usa la cuenta Compute predeterminada.

Las cuatro callables configuran `invoker: "public"`. Eso permite llegar al endpoint callable; no autentica al operador ni autoriza las acciones. La aceptación usa `request.auth`; reclamos y consultas también comprueban el ID token con revocación y exigen que su UID coincida con el contexto callable. La autorización de negocio continúa en el handler.

## Lecturas y escrituras Firestore derivadas del código

| Operación | Rutas de documento que consulta | Rutas que crea/actualiza/elimina |
|---|---|---|
| `consultarEstadoLegalTenant` | `empresas/{empresaId}`, `membresias/{empresaId}_{uid}`, `suscripciones/{empresaId}`, `suscripciones/{empresaId}/relaciones/{_vigente|relacionId}`, `empresas/{empresaId}/aceptacionesLegales/{aceptacionId}` (consulta paginada de historial) | Ninguna |
| `aceptarDocumentosLegalesTenant` | `empresas/{empresaId}`, `membresias/{empresaId}_{uid}`, `suscripciones/{empresaId}`, relaciones contractuales vigentes | `empresas/{empresaId}/aceptacionesLegales/{aceptacionId}` (creación transaccional e idempotente) |
| `tramitarReclamoPrivacidadSaas` | `saas_operadores/{uid}`, `privacidad_reclamos/{casoId}`, `empresas/{empresaId}`, `clientes/{clienteId}`, `clientes/{clienteId}/anotaciones_privacidad/{casoId}` | Caso de reclamo; contador del cliente; anotación de privacidad (crear/cerrar); en denegaciones, `saas_auditoria_obligaciones/{id}` y `saas_auditoria/{id}` |
| `tramitarConsultaPrivacidadSaas` | `saas_operadores/{uid}`, `privacidad_consultas/{casoId}`, `privacidad_consultas/{casoId}/reasignaciones/{eventoId}`, `empresas/{empresaId}` | Caso y evento de reasignación; en denegaciones, `saas_auditoria_obligaciones/{id}` y `saas_auditoria/{id}` |

La matriz cubre las dependencias directas y los helpers invocados por esas rutas. Las transacciones hacen lecturas y escrituras antes del commit; el cierre de reclamos puede borrar la anotación operativa, mientras los casos y la evidencia de auditoría mantienen sus propias reglas de conservación.

## APIs y permisos candidatos

| Servicio | Permiso que justifica el código | Candidato por verificar antes del piloto |
|---|---|---|
| Firestore | Lecturas de documentos, consultas de colecciones, transacciones y escrituras en las rutas enumeradas. La tabla oficial de la API requiere `datastore.entities.get` para `get`; `datastore.entities.get` + `datastore.entities.list` para `list`; `datastore.databases.get` para iniciar o revertir una transacción; y `datastore.entities.create`, `.update` o `.delete` según cada escritura/commit. | Rol personalizado de staging aplicado con `datastore.databases.get` y `datastore.entities.{get,list,create,update,delete}`. El despliegue y las revisiones activas están comprobados, pero no se ha ejecutado una operación autenticada con la identidad para demostrar suficiencia. Policy Simulator no está habilitado y no se habilitará en este corte; verificar con flujos autenticados y Cloud Audit Logs. Si los logs requeridos no están disponibles, detener la certificación y pedir alcance separado para habilitarlos. `roles/datastore.user` es más amplio e incluye permisos de metadatos/listado no justificados por este inventario. El IAM de Firestore opera sobre el recurso de base de datos/proyecto, no separa documentos por tenant; callables, validación server-side y Rules siguen siendo controles separados. |
| Firebase Authentication | `getAuth().getUser(uid)` en validación de sesión y `verifyIdToken(token, true)` para comprobar revocación de sesión en reclamos y consultas. No se crean, actualizan ni eliminan usuarios. | Rol personalizado de staging aplicado con solo `firebaseauth.users.get`, marcado `SUPPORTED` por Google para roles personalizados. La suficiencia efectiva aún no se ha probado. No otorgar `firebaseauth.admin`, `firebaseauth.editor` ni `roles/firebaseauth.viewer` sin demostrar que se necesitan sus permisos adicionales. |
| Cloud Functions invoker | Invocación del endpoint callable público; la autenticación de negocio la realiza el código. | No es un permiso runtime adicional para acceder a datos. Revisar la configuración del invoker por separado de la identidad runtime. |
| Cloud Logging, Storage, Secret Manager, Pub/Sub, Scheduler, Cloud Tasks, HTTP externo | No se encontró uso directo en los archivos ni helpers revisados. Los errores de autorización producen una escritura de evidencia en Firestore; no invocan una API de Logging desde el código. | No añadir roles para estos servicios a la cuenta runtime por anticipado. Verificar registros y configuración de plataforma durante el piloto, sin confundirlos con permisos de la identidad runtime. |

Referencias oficiales consultadas el 2026-11-26: [Firestore Native mode — permisos por método de API](https://docs.cloud.google.com/firestore/native/docs/security/iam), [Firestore IAM roles](https://docs.cloud.google.com/iam/docs/roles-permissions/firestore), [Firebase Authentication IAM](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseauth), [soporte de permisos en roles personalizados](https://docs.cloud.google.com/iam/docs/custom-roles-permissions-support) y [IAM de Cloud Run functions](https://docs.cloud.google.com/functions/docs/concepts/iam). Google recomienda sustituir el Editor de la cuenta Compute predeterminada por roles menos permisivos y usar Policy Simulator antes de modificar bindings.

## Resultado del piloto y evidencia faltante

El 2026-11-26 la cuenta y el rol descritos abajo se crearon en `micafe-pos-staging`, se vinculó el rol a esa cuenta y se desplegó solo `functions:saas-legal`. Las cuatro funciones quedaron `ACTIVE` con 100 % de tráfico en la revisión nueva. No se hizo ningún cambio en producción, Cloud Scheduler, la cuenta Compute compartida ni sus bindings. No se crearon claves.

La solicitud callable sin autenticación a `consultarEstadoLegalTenant` devolvió `401 UNAUTHENTICATED`, como se esperaba; esa ruta rechaza antes de acceder a Firestore. Esto prueba la barrera de autenticación del endpoint, no los permisos de la cuenta runtime. No se completó un smoke autenticado de solo lectura, no se verificó suficiencia IAM con lecturas/escrituras reales y no se envió un reclamo sintético. La consulta de Cloud Logging no encontró errores de permisos, pero tampoco hubo una llamada autenticada que los pudiera ejercitar.

Firebase CLI mostró que intentó asegurar/generar las identidades de Pub/Sub y Eventarc. La consulta de auditoría no encontró registros `GenerateServiceIdentity`; `iam.serviceAccounts.get` denegó la inspección directa de esas identidades. Los bindings `roles/pubsub.serviceAgent` y `roles/eventarc.serviceAgent` ya aparecen en evidencia de staging del 2026-10-09, por lo que no se afirma que esta ejecución haya creado identidades nuevas ni que el asunto esté resuelto.

## Configuración aplicada en staging

- Proyecto: `micafe-pos-staging`; funciones objetivo: las cuatro callables del
  codebase `saas-legal` en `us-central1`.
- Identidad runtime: `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`.
- Rol personalizado: `projects/micafe-pos-staging/roles/saasLegalRuntime`,
  definido en
  [`infra/iam/saas-legal-runtime-staging-role.yaml`](../../../infra/iam/saas-legal-runtime-staging-role.yaml).
- El código selecciona esa identidad únicamente cuando Firebase CLI descubre
  funciones con `GCLOUD_PROJECT=micafe-pos-staging`; en `micafe-pos` y otros
  proyectos conserva `serviceAccount: "default"` hasta que haya un corte y una
  autorización propios. La configuración se aplica a las cuatro callables.
- El preflight previo encontró las cuatro funciones objetivo y un job de Cloud
  Scheduler usando la cuenta Compute predeterminada. El piloto cambió solo la
  identidad runtime de esas funciones; no modificó el job ni los bindings de la
  cuenta Compute, y no concedió roles a workloads ajenos al codebase.
- La autorización operativa del responsable fue limitada a staging. La creación
  del recurso, rol, binding y despliegue quedó verificada en el resultado
  enlazado al inicio de este documento.

La identidad y el rol son propios del piloto, no una configuración productiva.
No se crean claves de cuenta de servicio. El binding del rol de datos es a
nivel de proyecto porque el SDK de servidor de Firestore no aporta aislamiento
por tenant mediante IAM; el rol concede únicamente las siete operaciones
enumeradas arriba.

- Código revisado: `functions-legal/src/index.ts`, `functions-legal/src/runtime-identity.ts`, `functions-legal/src/runtime-identity.test.ts`, `functions/src/legal/handler.ts`, `privacy-claims.ts`, `privacy-inquiries.ts`, `functions/src/platform/authorization.ts`, `functions/src/platform/audit.ts`, `functions/src/tenant-configuration/authority.ts` y `functions/src/suscripciones/relacion-vigente.ts`.
- Suites en el repositorio: pruebas unitarias de handler/catálogo y pruebas Emulator para aceptación, reclamos y consultas. Estas pruebas validan lógica con servicios emulados; no demuestran autorización IAM de la cuenta runtime real.
- La sonda staging sin credenciales devolvió 401 y no ejercitó escrituras. **No** es evidencia para confirmar permisos de Firestore o `firebaseauth.users.get`.
- Falta un smoke autenticado de solo lectura y evidencia efectiva de acceso a Firestore/Auth con esta identidad. El envío de un reclamo de prueba también sigue pendiente de confirmación inmediata.
- El inventario de este documento no cubre las otras 20 codebases ni los workloads no consultables. El inventario global sigue incompleto: las APIs de Compute Engine y Cloud Asset Inventory estaban deshabilitadas en el preflight y no se habilitaron. Este límite bloquea migraciones productivas y la retirada de `roles/editor`, no autoriza ampliar el piloto staging ni su rol.

## Decisión de este preflight

La matriz estática de `saas-legal` no demuestra privilegio mínimo efectivo. El piloto sigue abierto hasta probar un flujo autenticado positivo de solo lectura y los rechazos pertinentes, obtener evidencia disponible de Cloud Audit Logs y comprobar que no aparezcan dependencias fuera de esta matriz. Policy Simulator no se habilitó. Si faltan permisos o evidencia, detener este codebase y revisar el diseño; no ampliar a Editor como recuperación automática.
