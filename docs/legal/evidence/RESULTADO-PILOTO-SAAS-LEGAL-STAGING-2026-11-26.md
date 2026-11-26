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
- Smoke autenticado parcial en Backoffice staging, 2026-11-26 entre 20:46 y 20:49 UTC: la UI mostró un operador de plataforma autorizado. Se registró una recepción incompleta con consecutivo `SMOKE-STAGING-INCOMP-20261126-01`, tenant fixture `E2_2-BODEGA-STAGING-FIXTURE`, fecha 2026-11-26 y sin datos de titulares. La consulta inmediata devolvió estado `RECIBIDO` y vencimiento de subsanación `2026-12-02`. El caso usa el ID determinista `84cc6695e459db0263f77415d379f8ffd6d30b445916f0dd0d09408ab0143b51`.
- Ese recorrido prueba una escritura y consulta autenticadas del expediente de recepción en staging y la lectura de su vencimiento. No prueba las cuatro callables, el permiso de consulta a Firebase Auth, la anotación en la ficha del cliente, la verificación completa, aislamiento negativo entre tenants ni la respuesta/cierre del caso. No se accedió a tokens o cookies ni se usó una credencial nueva.
- Existe evidencia histórica de un expediente sintético distinto, `QA-ADR102-20261124-01`, que alcanzó `RESUELTO` con anotación y cierre en staging. La revalidación registrada en `REVALIDACION-RUTAS-Y-AUTORIZACION-2026-11-26.md` atribuye ese ensayo al despliegue `0248b1fe`, anterior al despliegue runtime documentado aquí (`6f218eb`). Por ello, el expediente histórico acredita el flujo en ese corte, pero no sustituye repetir el ciclo completo con el runtime y el código actuales. No se modificó ese expediente.
- La recepción es sintética y quedó en estado `RECIBIDO`; no se envió reclamación a una persona, requerimiento, correo ni respuesta externa. No se marcó una verificación real de identidad.
- La búsqueda de logs de error de las cuatro funciones desde el despliegue no devolvió entradas. Esto no demuestra por sí solo que todos los permisos sean suficientes.
- Cloud Run registra entradas `INFO`/`DEBUG` para `tramitarreclamoprivacidadsaas` en la ventana del smoke. No aparecieron entradas de Cloud Audit con `saas-legal-runtime` como principal; no se infiere el principal efectivo ni las operaciones de datos únicamente desde esos logs.
- Firebase CLI informó que aseguraba/generaba identidades para Pub/Sub y Eventarc. La búsqueda de auditoría por `GenerateServiceIdentity` no devolvió entradas. La inspección directa recibió `iam.serviceAccounts.get` denegado y el listado de cuentas no incluyó esas identidades administradas; evidencia de staging del 2026-10-09 ya documenta sus bindings de servicio. Por eso no se atribuye creación nueva a este deploy ni se marca resuelto el hallazgo.
- Policy Simulator API sigue deshabilitada y no se habilitó para este corte.

## Pendientes para cerrar el piloto

1. Invocar autenticadamente `consultarEstadoLegalTenant` y comprobar su lectura de Firestore/Auth; completar la prueba de anotación en el cliente fixture solo con datos y referencias explícitamente sintéticos, además de denegaciones de aislamiento entre tenants.
2. Revisar Cloud Audit Logs para confirmar las operaciones efectivas y detectar denegaciones. Si no hay evidencia disponible, detenerse y solicitar alcance separado antes de habilitar APIs o ampliar logs.
3. Repetir en staging actual el ciclo sintético de requerimiento, subsanación, anotación y cierre, sin afirmar comunicaciones reales; probar correo externo por separado antes de declarar ese canal operativo.
4. Reconciliar la generación de identidades Pub/Sub/Eventarc con evidencia suficiente; no modificar esos service agents como parte de este piloto.

El piloto no certifica el manejo integral de datos legales ni autoriza publicar los documentos v0.6 como vigentes. El PR #706 permanece abierto y en borrador; no se fusionó.

## Revalidación de App Hosting en staging — 2026-11-26 22:49 UTC

- El CI del candidato exacto `4c9460f49f675983e36733e77ef5ca1095a19d36`
  terminó `SUCCESS` en el run
  [45903441242](https://github.com/Glemynart/micafe-pos/actions/runs/45903441242).
- Se creó manualmente un rollout solo en `micafe-pos-staging`, backend
  `micafe-pos`, región `us-central1`. Rollout y Build
  `build-2026-11-26-003` quedaron `SUCCEEDED`/`READY`; el `source.codebase.commit`
  es exactamente `4c9460f49f675983e36733e77ef5ca1095a19d36`. Cloud Run reporta
  `micafe-pos-build-2026-11-26-003` como `latestReadyRevision` y 100 % del
  tráfico. La revisión anterior `micafe-pos-build-2026-11-26-002` quedó
  preservada.
- Las cuatro rutas `/legal/v0.6/{terminos-servicio,politica-tratamiento,
  aviso-autorizacion,anexo-tratamiento}.md` devolvieron HTTP 200 y sus
  encabezados indican borrador/no vigente/no exigible. Esto valida la entrega
  pública de esos archivos; no valida la pantalla autenticada de aceptación.
- Las cuatro Functions legales continúan `ACTIVE`, al 100 % y con
  `saas-legal-runtime`. No se observaron errores Cloud Run de esas cuatro
  funciones en las últimas 24 horas. La cuenta no tiene claves administradas
  por usuario.
- El endpoint `/backoffice/privacidad` devuelve el shell HTTP 200; esa respuesta
  anónima no verifica autorización ni una acción autenticada. El expediente
  sintético previo sigue en `RECIBIDO`; en este rollout no se envió ni se cerró
  otro caso, no se verificó identidad real ni se mandó correo.
- No se modificó producción, Rules, cuentas compartidas ni otros codebases.
  El PR #706 sigue `OPEN`/`DRAFT`; esta evidencia corresponde al corte de staging,
  no a un release productivo ni a una aprobación jurídica final.

### Integridad del bundle servido

Se descargaron los bytes de las cuatro rutas públicas y se comparó su SHA-256
con el valor declarado en `lib/legal/legal-bundle.ts`. Las cuatro coincidieron
exactamente:

| Archivo | SHA-256 servido y esperado | Resultado |
|---|---|---|
| `terminos-servicio.md` | `0f6509480588051f312b37e1bf352ff7c70721857f19ccd56b02640d53ffe059` | Coincide |
| `politica-tratamiento.md` | `3b81fed45a99637cd9b6dc5ecd09766544e1161239d8ddcdb183f9b621d4e244` | Coincide |
| `aviso-autorizacion.md` | `42e9338cae72059cad52aeb8c96e0e4946c0fadfd56dedfffa443bd50a7ea8dd` | Coincide |
| `anexo-tratamiento.md` | `e8a9f52ade5ea2785bac7f2c79976b1d7d57ad73710d1b752ae5ed9a8cf87b6e` | Coincide |
