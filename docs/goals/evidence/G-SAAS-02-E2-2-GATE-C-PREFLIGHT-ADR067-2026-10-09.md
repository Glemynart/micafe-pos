# G-SAAS-02 / M2 / E2.2 — Gate C final preflight ADR-SAAS-065/066/067 (2026-10-09)

## Dictamen

PREFLIGHT = PASS para el despliegue futuro del trigger de solicitud pendiente,
limitado al codebase saas-bodega del proyecto micafe-pos-staging. Gate D no se
ejecutó en este checkpoint. Cualquier delta distinto al descrito detiene Gate D.

## Identidad del candidato y validación

- Base viva: main @ 734dd7dd3aa9f1b2ec89c63b52bc3bf77db9437a, merge de PR #502.
- PR #502 integró ADR-SAAS-067 como aceptado. La CI post-merge de main, run
  37897655131, terminó success e incluyó las suites E2.2 Bodega y E4.1/E4.2
  en Emulator.
- El último cambio del codebase functions-bodega está incluido en el código
  integrado por PR #499. git diff 705585c90afe3fe6fca8ce44067b19ff22186158..HEAD
  -- functions-bodega no produce diferencias.
- El artefacto reproducible de ese mismo código tiene Firebase sourceHash
  ff83e2a8a52abf03a8f451aa2d6d4348ca575161, 68 archivos, 472.728 bytes sin
  comprimir, ZIP de 148.544 bytes y manifiesto canónico SHA-256
  1c254718de1a32d33959afd03f8512fecc590722a16bf5b782ecedadfb9b8a89.
  Su huella completa está en
  [el preflight anterior del mismo candidato](G-SAAS-02-E2-2-GATE-C-PREFLIGHT-ADR065-2026-10-09.md).
- Sobre el SHA vivo se ejecutaron npm --prefix functions-bodega run build
  (PASS), npm --prefix functions-bodega test (PASS, 14/14) y
  npm --prefix functions-bodega audit --omit=dev --audit-level=high (exit 0;
  dos avisos moderados transitivos de uuid por gaxios, cero high/critical; no
  se cambió ninguna dependencia).
- Firebase CLI 15.32.1 completó el dry-run dirigido:
  firebase deploy --dry-run --project=micafe-pos-staging --only=functions:saas-bodega --non-interactive --force
  (exit 0). El force fue necesario para aceptar la política de reintentos del
  trigger; el comando fue dry-run y no desplegó Functions.

## Delta exacto de Functions

Inventario remoto leído en micafe-pos-staging: 42 Functions Gen 2 en total;
16 pertenecen a saas-bodega (15 callables y un Scheduler), todas ACTIVE,
Node.js 22, us-central1, con 100 % del tráfico en su revisión lista. Las 16
comparten el hash remoto b55cfa86ca4e991d94d06038b9dbac4a2b95cd0b. No hay
triggers de evento en el proyecto y el trigger candidato todavía no existe.

El descubrimiento local de functions-bodega/src/index.ts contiene esos mismos
16 endpoints más notificarSolicitudVentaBodegaPendienteV1 (onDocumentCreated,
us-central1, retry true). El sourceHash local difiere del remoto. Por tanto, el
delta de este único codebase es exactamente 16 actualizaciones, un trigger
nuevo y cero eliminaciones; no se selecciona ningún otro codebase. El resultado
se deriva de la comparación de manifiestos/hash y del inventario remoto; Firebase
CLI dry-run validó y empaquetó el candidato, pero no imprimió una lista
operación por operación.

El codebase no declara Secrets. La fuente inspeccionada no contiene defineSecret,
parámetros secretos ni secretEnvironmentVariables; el dry-run tampoco solicitó
acceso a Secret Manager.

## APIs, identidades y IAM

El dry-run solicitó asegurar cloudfunctions.googleapis.com,
cloudbuild.googleapis.com, artifactregistry.googleapis.com,
firebaseextensions.googleapis.com, cloudscheduler.googleapis.com,
run.googleapis.com, eventarc.googleapis.com, pubsub.googleapis.com y
storage.googleapis.com. El inventario posterior las encontró habilitadas. La
lectura de Cloud Audit Logs de Admin Activity entre 2026-10-09T07:20:00Z y
2026-10-09T07:39:20Z no registró operaciones de Service Usage / EnableService;
el log sí registró las dos operaciones SetIamPolicy descritas abajo. No se
habilitó cloudtasks.googleapis.com; el candidato no declara una Task Queue
Function y el CLI no intentó asegurar esa API.

El CLI solicitó únicamente las identidades exactas Pub/Sub y Eventarc aprobadas
por ADR-SAAS-067. La llamada de generación idempotente para cada servicio terminó
sin error. La lectura directa de metadatos de esas cuentas no estuvo disponible
por falta de iam.serviceAccounts.get; no se usa ese fallo como evidencia de
inexistencia. Los grants exactos fueron aceptados por IAM y se verificaron en la
política del proyecto.

Antes de los cambios manuales, la política contenía un binding preexistente de
roles/iam.serviceAccountTokenCreator para la cuenta Firebase Admin, pero no los
bindings aprobados para los agentes Pub/Sub/Eventarc ni para la cuenta Compute.
El dry-run confirmó que el próximo deploy necesita exactamente estos tres pares
ADR-SAAS-066:

| Rol | Principal | Aplicación |
|---|---|---|
| roles/iam.serviceAccountTokenCreator | service-192423427245@gcp-sa-pubsub.iam.gserviceaccount.com | Solo durante Gate D |
| roles/eventarc.eventReceiver | 192423427245-compute@developer.gserviceaccount.com | Solo durante Gate D |
| roles/run.invoker | 192423427245-compute@developer.gserviceaccount.com | Solo durante Gate D |

Como autoriza ADR-SAAS-067, se añadieron solo los dos roles predeterminados
faltantes:

| Rol | Principal | Audit log de Admin Activity (UTC) |
|---|---|---|
| roles/pubsub.serviceAgent | service-192423427245@gcp-sa-pubsub.iam.gserviceaccount.com | 2026-10-09T07:39:13.138440Z — SetIamPolicy |
| roles/eventarc.serviceAgent | service-192423427245@gcp-sa-eventarc.iam.gserviceaccount.com | 2026-10-09T07:39:20.008012Z — SetIamPolicy |

La lectura posterior de la política confirmó esos dos nuevos pares; el binding
preexistente de Firebase Admin se conserva. eventReceiver, run.invoker y el
serviceAccountTokenCreator del agente Pub/Sub siguen siendo el único delta IAM
pendiente para el deploy. En conjunto, el deploy no requiere más de los cinco
pares exactos aceptados por ADR-SAAS-066/067. Cualquier principal, rol,
identidad o API adicional detiene Gate D.

## Rollback capturado antes del deploy

Los 16 servicios existentes reciben 100 % de tráfico en estas revisiones. Si
una actualización falla la verificación, el rollback devuelve cada servicio
actualizado a su revisión capturada; se retira solo el trigger nuevo si llegó a
crearse. Solicitudes, eventos/outbox y datos de negocio se conservan. Los dos
roles de agentes no se quitan automáticamente: su limpieza requiere verificar
antes que ningún servicio los use.

| Servicio Bodega | Revisión lista actual | Tráfico actual |
|---|---|---:|
| actualizarpresentacioncomercialv1 | actualizarpresentacioncomercialv1-00004-dob | 100 % |
| cancelarprogramacionpedidobodegav1 | cancelarprogramacionpedidobodegav1-00001-jog | 100 % |
| cancelarsolicitudventabodegav1 | cancelarsolicitudventabodegav1-00003-fil | 100 % |
| confirmarventabodegav1 | confirmarventabodegav1-00006-zeh | 100 % |
| consultaragendapedidosbodegav1 | consultaragendapedidosbodegav1-00001-naz | 100 % |
| consultarsolicitudesventabodegav1 | consultarsolicitudesventabodegav1-00003-zeg | 100 % |
| convertirprogramacionpedidobodegav1 | convertirprogramacionpedidobodegav1-00001-dur | 100 % |
| creararticuloinventariov1 | creararticuloinventariov1-00004-kaz | 100 % |
| crearcategoriabodegav1 | crearcategoriabodegav1-00004-duj | 100 % |
| crearclientevendedorv1 | crearclientevendedorv1-00004-nom | 100 % |
| crearpresentacioncomercialv1 | crearpresentacioncomercialv1-00004-hoz | 100 % |
| crearprogramacionpedidobodegav1 | crearprogramacionpedidobodegav1-00001-biq | 100 % |
| crearsolicitudventabodegav1 | crearsolicitudventabodegav1-00003-tiw | 100 % |
| reconciliaragendapedidosbodegav1 | reconciliaragendapedidosbodegav1-00001-huh | 100 % |
| resolverprogramacionpedidobodegav1 | resolverprogramacionpedidobodegav1-00001-per | 100 % |
| resolversolicitudventabodegav1 | resolversolicitudventabodegav1-00003-caz | 100 % |

## Auditoría de mutaciones y estado siguiente

- micafe-pos-staging: solo dos SetIamPolicy para los roles de agentes de
  ADR-SAAS-067. Functions/deployments/Cloud Run traffic/Cloud Build, APIs,
  Rules, Secrets, Auth, Firestore, fixture y datos de negocio: sin cambios
  observados por Codex.
- Tenant real y producción: sin cambios.
- Gate C: PASS para el candidato y alcance descritos aquí.
- Gate D: NOT EXECUTED; requiere integrar esta evidencia y después desplegar
  únicamente functions:saas-bodega.
- Gate F: EN CURSO, no PASS. Tras Gate D faltará probar en staging la entrega
  automática push desde el trigger/outbox, retry/replay/concurrencia, retry
  autenticado tras pérdida de respuesta, aislamiento y revocación/restauración,
  expiración/liberación automática de reservas y la matriz funcional integral
  de PWA, Backoffice y turnos. El flujo agenda→solicitud→aprobación→venta ya
  tiene evidencia parcial, no reemplaza estos casos.
- Gates G/H se repiten después de cerrar F. No se crea ni configura tenant real
  ni se toca producción.
