# Preflight estático de permisos — `saas-legal`

**Fecha:** 2026-11-26 14:34 UTC  
**Fuente revisada:** checkout `codex/e2-2-legal-acceptance`, HEAD `36c4677ff76f066cde2b429ec7eb4f305137a190`.  
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
| Firestore | Lectura de documentos y consultas; crear, actualizar y borrar documentos en los paths enumerados. En la API IAM de Firestore esto corresponde como mínimo a operaciones de entidades `get`, `list`, `create`, `update` y `delete`. | Evaluar `roles/datastore.user` frente a un rol personalizado limitado a las operaciones de entidades requeridas. El código no prueba si bastan esas operaciones para el SDK/transacciones ni si se requieren permisos adicionales de metadatos; decidir solo tras comprobar la matriz oficial, Policy Simulator y logs positivos de staging. El acceso IAM al almacén no constituye aislamiento por tenant: las callables y las Rules siguen siendo controles separados. |
| Firebase Authentication | `getAuth().getUser(uid)` en validación de sesión y `verifyIdToken(token, true)` para comprobar revocación de sesión en reclamos y consultas. No se crean, actualizan ni eliminan usuarios. | Permiso de lectura `firebaseauth.users.get`. `roles/firebaseauth.viewer` lo incluye, junto con permisos de lectura adicionales; evaluar si un rol personalizado con ese permiso es admisible y suficiente. No otorgar `firebaseauth.admin` ni `firebaseauth.editor`. |
| Cloud Functions invoker | Invocación del endpoint callable público; la autenticación de negocio la realiza el código. | No es un permiso runtime adicional para acceder a datos. Revisar la configuración del invoker por separado de la identidad runtime. |
| Cloud Logging, Storage, Secret Manager, Pub/Sub, Scheduler, Cloud Tasks, HTTP externo | No se encontró uso directo en los archivos ni helpers revisados. Los errores de autorización producen una escritura de evidencia en Firestore; no invocan una API de Logging desde el código. | No añadir roles para estos servicios a la cuenta runtime por anticipado. Verificar registros y configuración de plataforma durante el piloto, sin confundirlos con permisos de la identidad runtime. |

Referencias de roles y permisos revisadas el 2026-11-26: [Firestore IAM](https://docs.cloud.google.com/iam/docs/roles-permissions/firestore), [Firebase Authentication IAM](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseauth), [IAM de Cloud Run functions](https://docs.cloud.google.com/functions/docs/concepts/iam). Google recomienda sustituir el Editor de la cuenta Compute predeterminada por roles menos permisivos y usar Policy Simulator antes de modificar bindings.

## Evidencia disponible y faltante

- Código revisado: `functions-legal/src/index.ts`, `functions/src/legal/handler.ts`, `privacy-claims.ts`, `privacy-inquiries.ts`, `functions/src/platform/authorization.ts`, `functions/src/platform/audit.ts`, `functions/src/tenant-configuration/authority.ts` y `functions/src/suscripciones/relacion-vigente.ts`.
- Suites en el repositorio: pruebas unitarias de handler/catálogo y pruebas Emulator para aceptación, reclamos y consultas. Estas pruebas validan lógica con servicios emulados; no demuestran autorización IAM de la cuenta runtime real.
- La sonda staging sin credenciales devolvió 401 y no ejercitó escrituras. **No** es evidencia para confirmar permisos de lectura/escritura de Firestore o `firebaseauth.users.get`.
- No hay todavía una identidad runtime dedicada `saas-legal` desplegada en staging, ni logs positivos del piloto. Falta el gate operativo separado para crearla, vincular permisos y desplegar el codebase a staging.
- El inventario de este documento no cubre las otras 20 codebases ni los workloads no consultables. El inventario global sigue incompleto: las APIs de Compute Engine y Cloud Asset Inventory estaban deshabilitadas en el preflight y no se habilitaron.

## Decisión de este preflight

La matriz estática de `saas-legal` sirve como base revisable para el piloto; **no** autoriza su configuración IAM ni despliegue, no demuestra privilegio mínimo efectivo y no permite retirar `roles/editor` de la cuenta Compute. El piloto solo se cierra después de probar flujos autenticados positivos y negativos, confirmar permisos efectivos mediante Policy Simulator/Cloud Audit Logs y comprobar que no aparezcan dependencias fuera de esta matriz. Si falta un permiso, detener este codebase y revisar el diseño; no ampliar a Editor como recuperación automática.
