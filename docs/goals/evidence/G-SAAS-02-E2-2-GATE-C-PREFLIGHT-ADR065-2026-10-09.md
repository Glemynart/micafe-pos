# G-SAAS-02 / M2 / E2.2 — Gate C: preflight ADR-SAAS-065/066 (2026-10-09)

## Dictamen

`PREFLIGHT = BLOCKED / OUT-OF-SCOPE SERVICE IDENTITY BOOTSTRAP`. El candidato,
artefacto local y estado remoto están identificados. La aprobación de
ADR-SAAS-066 cubre exactamente tres bindings IAM en staging; el Firebase CLI
también invoca una API mutante para generar las identidades de Pub/Sub y
Eventarc antes de evaluar `dry-run`. La política actual no contiene los roles
`serviceAgent` correspondientes, por lo que el delta total de identidad/IAM no
está demostrado dentro de la autorización. No se ejecutaron deploy, dry-run ni
cambios remotos.

La decisión aprobada está en
[`ADR-SAAS-066`](../../../ADR-SAAS-066-iam-acotado-eventarc-bodega-staging.md),
estado `ACEPTADO` en esta rama. La decisión autoriza solo los tres bindings
listados; cualquier permiso, principal, identidad administrada o superficie
adicional detiene Gate D y requiere una decisión separada.

## Identidad del código y CI

- PR #499: `MERGED`; merge SHA `705585c90afe3fe6fca8ce44067b19ff22186158`,
  `2026-10-09T05:12:05Z`.
- Checks previos al merge: `Tipos y pruebas`, Vercel y Preview Comments,
  `SUCCESS`.
- CI post-merge de `main`: run `37887438897`, mismo merge SHA; terminó
  `success` a las `2026-10-09T05:34:50Z`. Incluyó tipos/builds, Rules,
  Operator Portal, R1-A, P0-01, E2.2 Bodega y las certificaciones E4.1/E4.2 en
  Emulator. No reemplaza la validación remota de staging.
- El build y el artefacto identificados se generaron desde `main` en el mismo
  árbol que `origin/main`. Este checkpoint de documentación no modifica el
  source de Functions.

## Candidato `saas-bodega`

- `firebase.json` selecciona `functions-bodega` → codebase `saas-bodega`;
  ningún otro codebase está incluido en el selector de deploy.
- Descubrimiento local exacto: 15 callables Gen 2, un trigger Firestore
  `notificarSolicitudVentaBodegaPendienteV1` y un Scheduler
  `reconciliarAgendaPedidosBodegaV1` cada cinco minutos UTC. Todos en
  `us-central1`, runtime Node.js 22, sin Secrets declarados por este codebase.
- `npm --prefix functions-bodega run build`: PASS.
- `npm --prefix functions-bodega test`: PASS, 14/14; incluye dispatcher,
  backoff, token inválido, carrera trigger/Scheduler, expiración de holds,
  discovery y module-load.
- `npm --prefix functions-bodega audit --omit=dev --audit-level=high`: exit 0;
  dos avisos moderados transitivos de `uuid` vía `gaxios`, cero high/critical
  en el umbral ejecutado. No se actualizó ninguna dependencia.
- Firebase CLI 15.32.1 empaquetó dos veces el mismo candidato: sourceHash
  `ff83e2a8a52abf03a8f451aa2d6d4348ca575161`, 68 archivos, 472,728 bytes de
  contenido y ZIP de 148,544 bytes en ambas ejecuciones. El manifiesto canónico
  local de `{path, mode octal, SHA-256}` es
  `1c254718de1a32d33959afd03f8512fecc590722a16bf5b782ecedadfb9b8a89`.
- La política de dependencias productivas reportó dos advisories moderados;
  no se ejecutó `npm audit fix`.

## Estado remoto leído — `micafe-pos-staging`

Consultas de solo lectura dirigidas al proyecto explícito:

- Firebase Functions: 42 en total; 16 de `saas-bodega` (15 callables + un
  Scheduler), todas Gen 2, Node.js 22, `us-central1`, `ACTIVE`, con tráfico
  en la última revisión. Las 16 comparten source hash actual
  `b55cfa86ca4e991d94d06038b9dbac4a2b95cd0b`.
- Functions/event triggers en todo el proyecto: 0. No existe el nuevo trigger.
- Scheduler `firebase-schedule-reconciliarAgendaPedidosBodegaV1-us-central1`:
  `ENABLED`, cada cinco minutos.
- APIs `cloudfunctions`, `run`, `cloudbuild`, `artifactregistry`, `eventarc` y
  `pubsub`: habilitadas.
- Firestore: siete índices compuestos listados, todos `READY`; no se intentó
  despliegue de índices.
- El inventario no se modificó. No se consultaron documentos de negocio para
  este preflight.

## Desviación IAM que impide Gate C

La versión local de Firebase CLI 15.32.1, en
`lib/deploy/functions/checkIam.js`, agrega mediante `setIamPolicy` los
bindings siguientes al crear el primer endpoint de evento en el backend
seleccionado:

| Rol requerido por el CLI | Principal staging | Estado leído |
|---|---|---|
| `roles/iam.serviceAccountTokenCreator` | `service-192423427245@gcp-sa-pubsub.iam.gserviceaccount.com` | binding directo no encontrado |
| `roles/eventarc.eventReceiver` | `192423427245-compute@developer.gserviceaccount.com` | binding directo no encontrado; la cuenta tiene `roles/editor` |
| `roles/run.invoker` | `192423427245-compute@developer.gserviceaccount.com` | binding directo no encontrado; la cuenta tiene `roles/editor` |

La identidad de despliegue usada durante las consultas tiene `roles/owner` del
proyecto. Se omite el correo de cuenta porque este repositorio es público.
El listado actual no tiene event triggers, por lo que este sería el primer
servicio de eventos para el selector. La CLI fusiona los roles requeridos a la
política de proyecto durante deploy normal; el comportamiento no está cubierto
por CI.

ADR-SAAS-066, aprobada por el responsable del proyecto el 2026-10-09, define la
única excepción de IAM: los tres roles/principales de la tabla. La verificación
`gcloud iam service-accounts describe` del agente Eventarc falló por falta de
`iam.serviceAccounts.get`; no se infiere de ese error si la identidad existe o
no. La existencia o el aprovisionamiento de identidades administradas que no
estén en el alcance aprobado aún debe resolverse sin mutarlas o deteniendo Gate
C.

## Efectos de Firebase CLI y bloqueo de identidad administrada

Inspección estática de la instalación Firebase CLI `15.32.1` (`lib/deploy/functions/prepare.js`)
confirmó que cualquier backend Gen 2 llama a `generateServiceIdentity` para
`pubsub.googleapis.com` y `eventarc.googleapis.com` dentro de
`ensureAllRequiredAPIsEnabled`. La llamada es incondicional para Gen 2 y ocurre
antes de la rama `options.dryRun`. `lib/gcp/serviceusage.js` implementa esa
operación como un `POST` a `projects/{projectNumber}/services/{service}:generateServiceIdentity`.
Por tanto, `firebase deploy --dry-run` no es read-only para este candidato:
puede aprovisionar las identidades que aún falten.

En la lectura explícita de `micafe-pos-staging` del 2026-10-09, la política IAM
no contiene `roles/pubsub.serviceAgent` ni `roles/eventarc.serviceAgent`; el
listado visible de cuentas de servicio tampoco devuelve los principales
`service-192423427245@gcp-sa-pubsub.iam.gserviceaccount.com` ni
`service-192423427245@gcp-sa-eventarc.iam.gserviceaccount.com`. La documentación
de Google distingue entre identidades que el
servicio crea automáticamente y las que se solicitan explícitamente; no se
infieren aquí grants automáticos para el `POST` de Firebase CLI. La generación
puede provisionar identidades fuera de alcance y el deploy puede requerir
bindings ausentes. La aprobación actual no autoriza ese delta ni permite
demostrarlo sin ejecutar la llamada mutante.

Referencias: Firebase CLI `15.32.1`, `lib/deploy/functions/prepare.js` y
`lib/gcp/serviceusage.js` (inspección local de fuente); Google Cloud [Service
agents](https://docs.cloud.google.com/iam/docs/service-agents) y [crear y
otorgar roles a service agents](https://docs.cloud.google.com/iam/docs/create-service-agents?hl=es-419).

La misma lectura confirmó que los APIs Pub/Sub y Eventarc ya están `ENABLED`;
esto no demuestra que sus service agents estén provisionados. La identidad de
despliegue activa tiene acceso al proyecto; las consultas utilizaron
explícitamente `--project=micafe-pos-staging`. El intento de consultar el grupo
beta de Service Usage solo mostró que el componente local `beta` no está
instalado; no se completó instalación de componentes ni hubo cambios remotos.

El delta esperado por source hash sería actualizar las 16 Functions existentes
y crear solo el trigger nuevo, sin deletes ni otros codebases. Esta cifra es
inferida del descubrimiento y del hash diferente, no de un `deploy --dry-run`;
debe confirmarse en Gate C final. Cualquier binding/endpoint extra detiene Gate
D.

## Riesgo, rollback y límites

- Gate D: `NOT EXECUTED`. No deploy, tráfico, scheduler, Firestore, Auth,
  Rules, IAM, Secrets, fixture, Bootstrap, Activation, tenant real o producción
  fueron modificados por Codex.
- El dry-run no se ejecutó: la inspección de fuente confirmó que puede crear
  identidades Pub/Sub/Eventarc; el delta de IAM asociado no está probado y la
  política actual carece de sus roles `serviceAgent`. La autorización aprobó
  solo tres bindings y excluye otras identidades/permisos. Gate C permanece
  bloqueado hasta tener un preflight compatible con esa frontera o una decisión
  separada. El paquete candidato se generó localmente sin deploy.
- No se ejecutará rollback antes de deploy. Si Gate D se autoriza y falla, la
  reversión de código deberá retirar el trigger de evento y restaurar la
  revisión previa; las solicitudes/outbox se conservan. La limpieza de IAM no
  será automática y requerirá verificar dependencias.
- No se declara `PREFLIGHT = PASS`, Gate F `PASS`, ni certificación E2.2.

## Mutation audit

- Git: branch `codex/e2-2-eventarc-iam-proposal`; el trabajo documental de este
  checkpoint aún no se ha integrado.
- Código fuente versionado: sin cambios. El build generó únicamente salida
  ignorada.
- Staging Firebase/GCP: solo lecturas de inventario Functions, Scheduler,
  APIs, índices y política IAM. Cambios remotos `0`.
- Deploys Functions, Rules, Storage, Auth, tráfico, Scheduler, Firestore,
  fixture, tenant real y producción: `0`.
- CI post-merge de PR #499: run `37887438897`, `success`; no es evidencia de
  deploy ni de funcionamiento del trigger en staging.
- IAM/identidades: no hubo escrituras; Gate C quedó bloqueado porque el dry-run
  podría provisionar service agents fuera del alcance aprobado y el delta IAM
  asociado no está demostrado.
