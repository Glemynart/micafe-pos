# Resultado del piloto runtime `saas-legal` en staging

**Fecha:** 2026-11-26 (America/Bogota)
**Proyecto:** `micafe-pos-staging`
**PR:** [#706](https://github.com/Glemynart/micafe-pos/pull/706)
**Código desplegado:** checkout `codex/e2-2-legal-acceptance`, HEAD `6f218eb220cd325aa58ad1f7e87689cb11d29aa9`.

## Autorización y alcance

El responsable autorizó crear una identidad runtime para el codebase `saas-legal`, asignarle el rol mínimo revisado y desplegar únicamente ese codebase en staging. No se autorizó ni ejecutó ningún cambio IAM o despliegue en producción, la retirada de `roles/editor`, cambios a Cloud Scheduler, la cuenta Compute compartida o recursos de otros codebases. No se generaron claves de cuenta de servicio.

## CI y artefacto

- CI del SHA desplegado: [run 45886627085](https://github.com/Glemynart/micafe-pos/actions/runs/45886627085), conclusión `success`.
- Firebase CLI `15.34.2`, con `firebase.json` del checkout fijando `functions-legal` al codebase `saas-legal`.
- Comando ejecutado: `firebase deploy --only functions:saas-legal --project micafe-pos-staging`.
- Cloud Build: `projects/192423427245/locations/us-central1/builds/2f93e123-3c54-441a-a193-6a6d8d82b894`, estado `SUCCESS`, 2026-11-26 20:17:39–20:18:07 UTC.
- Cloud Build no devolvió `sourceProvenance`; la correspondencia con el SHA se basa en el checkout local verificado antes del deploy y las generaciones de artefacto registradas a continuación, no en metadatos Git emitidos por Cloud Build.

## IAM aplicado

- Cuenta: `saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com`.
- Rol personalizado: `projects/micafe-pos-staging/roles/saasLegalRuntime` (`BETA`).
- Binding de proyecto confirmado para esa cuenta y únicamente ese rol personalizado.
- Permisos: `datastore.databases.get`, `datastore.entities.create`, `datastore.entities.delete`, `datastore.entities.get`, `datastore.entities.list`, `datastore.entities.update`, `firebaseauth.users.get`.
- La cuenta Compute conserva su binding actual. No se otorgó `roles/editor` a la identidad nueva ni permisos de administración IAM/de infraestructura.

## Rollout verificado

Las cuatro funciones reportan estado `ACTIVE`; la revisión lista como `latestReadyRevision` recibe 100 % del tráfico en Cloud Run. Todas usan la cuenta runtime dedicada.

| Función | Revisión servida | Actualizada UTC | Objeto fuente / generación |
|---|---|---|---|
| `consultarEstadoLegalTenant` | `consultarestadolegaltenant-00005-hez` | 20:18:23 | `consultarEstadoLegalTenant/function-source.zip` / `1795724259124302` |
| `aceptarDocumentosLegalesTenant` | `aceptardocumentoslegalestenant-00005-mih` | 20:18:27 | `aceptarDocumentosLegalesTenant/function-source.zip` / `1795724299441461` |
| `tramitarReclamoPrivacidadSaas` | `tramitarreclamoprivacidadsaas-00005-zes` | 20:18:26 | `tramitarReclamoPrivacidadSaas/function-source.zip` / `1795724299477945` |
| `tramitarConsultaPrivacidadSaas` | `tramitarconsultaprivacidadsaas-00005-bel` | 20:18:28 | `tramitarConsultaPrivacidadSaas/function-source.zip` / `1795724299494884` |

## Verificación funcional y límites

- Un POST callable sin credenciales a `consultarEstadoLegalTenant` devolvió `401 UNAUTHENTICATED` con el mensaje genérico esperado. El handler exige autenticación antes de obtener Firestore. Esta prueba verifica el rechazo anónimo; **no** verifica una lectura autenticada ni los permisos runtime de Firestore/Auth.
- No se ejecutó un smoke autenticado de solo lectura con la sesión del navegador. En esta sesión no hay herramienta disponible para controlar la pestaña Edge; no se accedió a tokens/cookies ni se usó una credencial nueva.
- No se registró ni envió el reclamo sintético de prueba.
- La búsqueda de logs de error de las cuatro funciones desde el despliegue no devolvió entradas; no hubo invocación autenticada que permitiera inferir suficiencia IAM.
- Firebase CLI informó que aseguraba/generaba identidades para Pub/Sub y Eventarc. La búsqueda de auditoría por `GenerateServiceIdentity` no devolvió entradas. La inspección directa recibió `iam.serviceAccounts.get` denegado y el listado de cuentas no incluyó esas identidades administradas; evidencia de staging del 2026-10-09 ya documenta sus bindings de servicio. Por eso no se atribuye creación nueva a este deploy ni se marca resuelto el hallazgo.
- Policy Simulator API sigue deshabilitada y no se habilitó para este corte.

## Pendientes para cerrar el piloto

1. Ejecutar un flujo autenticado de solo lectura que invoque `consultarEstadoLegalTenant` y compruebe Firestore/Auth bajo la identidad dedicada, sin enviar el formulario de reclamo.
2. Revisar Cloud Audit Logs para confirmar las operaciones efectivas y detectar denegaciones. Si no hay evidencia disponible, detenerse y solicitar alcance separado antes de habilitar APIs o ampliar logs.
3. Reconciliar la generación de identidades Pub/Sub/Eventarc con evidencia suficiente; no modificar esos service agents como parte de este piloto.

El piloto no certifica el manejo integral de datos legales ni autoriza publicar los documentos v0.6 como vigentes. El PR #706 permanece abierto y en borrador; no se fusionó.
