# Preflight estático de permisos — `saas-legal`

**Fecha:** 2026-11-26 19:47 UTC
**Fuente de operaciones Firestore/Auth:** checkout `codex/e2-2-legal-acceptance`, HEAD `eeadcdad8d7e7b01bb90eccd71d5981b22263ef1`; la selección de identidad runtime y su prueba están incluidas en esta revisión.
**Estado:** inventario derivado de código; no es matriz final de IAM ni evidencia de ejecución con identidad dedicada.

Este preflight avanza el paso 2 de [ADR-SAAS-105](../../../ADR-SAAS-105-identidades-runtime-functions-minimo-privilegio.md) solo para el codebase `saas-legal`. No modifica IAM, no crea service accounts y no despliega Functions.

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
| Firestore | Lecturas de documentos, consultas de colecciones, transacciones y escrituras en las rutas enumeradas. La tabla oficial de la API requiere `datastore.entities.get` para `get`; `datastore.entities.get` + `datastore.entities.list` para `list`; `datastore.databases.get` para iniciar o revertir una transacción; y `datastore.entities.create`, `.update` o `.delete` según cada escritura/commit. | Candidato de rol personalizado limitado a `datastore.databases.get` y `datastore.entities.{get,list,create,update,delete}`. Google marca estos permisos como `SUPPORTED` en roles personalizados. Esto cubre los métodos Firestore observados en el código, pero no demuestra aún que sea suficiente para todo el comportamiento del Admin SDK o la identidad real. El proyecto staging no tiene habilitada la API de Policy Simulator y no se habilitará para este piloto; se comprobarán los flujos positivos/negativos y Cloud Audit Logs tras desplegar. Si los logs de acceso requeridos no están disponibles, detener la certificación y pedir alcance separado para habilitarlos. `roles/datastore.user` es más amplio e incluye permisos de metadatos/listado no justificados por este inventario. El IAM de Firestore opera sobre el recurso de base de datos/proyecto, no separa documentos por tenant; callables, validación server-side y Rules siguen siendo controles separados. |
| Firebase Authentication | `getAuth().getUser(uid)` en validación de sesión y `verifyIdToken(token, true)` para comprobar revocación de sesión en reclamos y consultas. No se crean, actualizan ni eliminan usuarios. | Candidato de rol personalizado con solo `firebaseauth.users.get`, marcado `SUPPORTED` por Google para roles personalizados. No otorgar `firebaseauth.admin`, `firebaseauth.editor` ni `roles/firebaseauth.viewer` sin demostrar que se necesitan sus permisos adicionales. Confirmar suficiencia con Policy Simulator y logs positivos/negativos de staging. |
| Cloud Functions invoker | Invocación del endpoint callable público; la autenticación de negocio la realiza el código. | No es un permiso runtime adicional para acceder a datos. Revisar la configuración del invoker por separado de la identidad runtime. |
| Cloud Logging, Storage, Secret Manager, Pub/Sub, Scheduler, Cloud Tasks, HTTP externo | No se encontró uso directo en los archivos ni helpers revisados. Los errores de autorización producen una escritura de evidencia en Firestore; no invocan una API de Logging desde el código. | No añadir roles para estos servicios a la cuenta runtime por anticipado. Verificar registros y configuración de plataforma durante el piloto, sin confundirlos con permisos de la identidad runtime. |

Referencias oficiales consultadas el 2026-11-26: [Firestore Native mode — permisos por método de API](https://docs.cloud.google.com/firestore/native/docs/security/iam), [Firestore IAM roles](https://docs.cloud.google.com/iam/docs/roles-permissions/firestore), [Firebase Authentication IAM](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseauth), [soporte de permisos en roles personalizados](https://docs.cloud.google.com/iam/docs/custom-roles-permissions-support) y [IAM de Cloud Run functions](https://docs.cloud.google.com/functions/docs/concepts/iam). Google recomienda sustituir el Editor de la cuenta Compute predeterminada por roles menos permisivos y usar Policy Simulator antes de modificar bindings.

## Evidencia disponible y faltante

## Configuración propuesta del piloto de staging

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
- El preflight read-only de staging mostró que las funciones objetivo usan hoy
  la cuenta Compute predeterminada; un job de Cloud Scheduler también la usa.
  El piloto no modifica ese job, no quita permisos a la cuenta Compute y no
  concede roles a workloads ajenos al codebase.
- El usuario autorizó crear la identidad y el binding de staging y desplegar
  únicamente ese codebase. Las escrituras aún no se han ejecutado; primero se
  revisará este cambio en el PR y deberán pasar sus controles.

La identidad y el rol son propios del piloto, no una configuración productiva.
No se crean claves de cuenta de servicio. El binding del rol de datos es a
nivel de proyecto porque el SDK de servidor de Firestore no aporta aislamiento
por tenant mediante IAM; el rol concede únicamente las siete operaciones
enumeradas arriba.

- Código revisado: `functions-legal/src/index.ts`, `functions-legal/src/runtime-identity.ts`, `functions-legal/src/runtime-identity.test.ts`, `functions/src/legal/handler.ts`, `privacy-claims.ts`, `privacy-inquiries.ts`, `functions/src/platform/authorization.ts`, `functions/src/platform/audit.ts`, `functions/src/tenant-configuration/authority.ts` y `functions/src/suscripciones/relacion-vigente.ts`.
- Suites en el repositorio: pruebas unitarias de handler/catálogo y pruebas Emulator para aceptación, reclamos y consultas. Estas pruebas validan lógica con servicios emulados; no demuestran autorización IAM de la cuenta runtime real.
- La sonda staging sin credenciales devolvió 401 y no ejercitó escrituras. **No** es evidencia para confirmar permisos de lectura/escritura de Firestore o `firebaseauth.users.get`.
- No existe aún la identidad runtime dedicada en staging ni hay logs positivos del piloto. El usuario autorizó la operación solo para staging; se ejecutará después de revisar el PR y pasar CI.
- El inventario de este documento no cubre las otras 20 codebases ni los workloads no consultables. El inventario global sigue incompleto: las APIs de Compute Engine y Cloud Asset Inventory estaban deshabilitadas en el preflight y no se habilitaron. Este límite bloquea migraciones productivas y la retirada de `roles/editor`, no autoriza ampliar el piloto staging ni su rol.

## Decisión de este preflight

La matriz estática de `saas-legal` es una base revisable y no demuestra privilegio mínimo efectivo. La autorización operativa del usuario cubre únicamente el piloto de staging después de la revisión del PR y los checks; no cubre producción ni retirar `roles/editor` de la cuenta Compute. El piloto solo se cierra después de probar flujos autenticados positivos y negativos, confirmar permisos efectivos mediante Policy Simulator/Cloud Audit Logs y comprobar que no aparezcan dependencias fuera de esta matriz. Si falta un permiso, detener este codebase y revisar el diseño; no ampliar a Editor como recuperación automática.
