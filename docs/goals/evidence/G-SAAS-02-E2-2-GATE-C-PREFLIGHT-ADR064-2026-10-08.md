# G-SAAS-02 / M2 / E2.2 — Gate C: preflight ADR-SAAS-064 (2026-10-08)

## Dictamen

`PREFLIGHT = PASS` para el árbol integrado en `origin/main` mediante PR #479,
commit `1d94944a1cc9d028e1680c66e10b27e0f91cf497`, árbol
`4fb2ba1b1835d2b0645b4f0c8f287d252c3d6522`. El candidato de `saas-bodega` se
identifica por `Firebase sourceHash`
`29c96c95519ab5325748e0db8900209aafdfd7c7` y manifiesto canónico SHA-256
`d33ca89a08c3ee3e9d4ee9ccdfb412e389322447f5e6b7f3f536fc0541527b68`.

Gate D permanece `PENDING`. El alcance identificado incluye actualizar diez
Functions existentes y crear cinco callables y un scheduler, además de crear
dos índices compuestos ausentes en staging. No se reutiliza la evidencia del
artefacto anterior de diez callables. Esta evidencia no autoriza producción ni
la creación de fixture/datos.

## Identidad Git y CI

- PR #479: `MERGED` a `main`; merge commit
  `1d94944a1cc9d028e1680c66e10b27e0f91cf497`, el
  `2026-10-08T05:15:02Z` (`00:15:02`, hora de Bogotá).
- Checks de PR #479: `Tipos y pruebas`, `Vercel` y `Vercel Preview Comments`,
  todos `PASS`. El job `Tipos y pruebas` fue el run `37729684431`.
- CI post-merge de `main`: run `37731432362`, SHA
  `1d94944a1cc9d028e1680c66e10b27e0f91cf497`, `completed / success` a las
  `2026-10-08T05:33:01Z`. Incluyó PASS de E2E Bodega U4-U5, agenda/reservas y
  aislamiento en Emulator, además de las etapas posteriores del workflow. Es
  evidencia de Emulator/CI, no una validación funcional en staging.
- `origin/main` y el árbol inspeccionado coinciden. El PR #479 solo ajustó UI,
  runner y pruebas de reintento; no cambió `functions-bodega` ni los índices.

## Candidato y cierre de dependencias

- `firebase.json` mapea `functions-bodega` a `saas-bodega`, sin hook
  `predeploy`. El deploy previsto es exclusivamente
  `firebase deploy --only functions:saas-bodega --project micafe-pos-staging`.
- Entorno local: Node `v22.23.2`, npm `10.9.8`, Firebase CLI `15.32.1`, Google
  Cloud SDK `587.0.0`.
- En `functions-bodega`, instalación limpia `npm ci --no-audit --no-fund`:
  `PASS` (269 paquetes); `npm run build`: `PASS`; `npm test`: `PASS`, 9/9,
  cero fallos y cero skips. La suite incluye expiración idempotente de holds,
  entrega durable de recordatorios, reintentos/backoff, descubrimiento y
  module-load.
- Discovery declara exactamente quince callables Gen 2 y un scheduler, todos
  `us-central1`, Node.js 22, cero parámetros/Secrets. El scheduler es
  `reconciliarAgendaPedidosBodegaV1`, cada cinco minutos, zona `UTC`.
- La closure de imports permanece limitada a los handlers Bodega seleccionados,
  configuración/autoridad tenant, worker ADR-064 y dependencias Firebase Admin
  necesarias. La inspección no encontró imports de `saas-auth`, Bootstrap,
  Activation, Wompi/Dusema ni `defineSecret` en el source del codebase.
- `npm audit --omit=dev --audit-level=high`: exit 0; dos advisories moderados
  transitivos (`uuid` vía `gaxios`), cero hallazgos de severidad alta en el
  umbral ejecutado. No se alteraron dependencias ni se ejecutó `npm audit fix`.

Discovery exacto:

1. `actualizarPresentacionComercialV1`
2. `cancelarProgramacionPedidoBodegaV1`
3. `cancelarSolicitudVentaBodegaV1`
4. `confirmarVentaBodegaV1`
5. `consultarAgendaPedidosBodegaV1`
6. `consultarSolicitudesVentaBodegaV1`
7. `convertirProgramacionPedidoBodegaV1`
8. `crearArticuloInventarioV1`
9. `crearCategoriaBodegaV1`
10. `crearClienteVendedorV1`
11. `crearPresentacionComercialV1`
12. `crearProgramacionPedidoBodegaV1`
13. `crearSolicitudVentaBodegaV1`
14. `resolverProgramacionPedidoBodegaV1`
15. `resolverSolicitudVentaBodegaV1`
16. `reconciliarAgendaPedidosBodegaV1` — scheduler, no callable.

## Procedencia y reproducibilidad

Se empacó dos veces el source actual con `prepareFunctionsUpload` del Firebase
CLI `15.32.1`, usando los excludes de Firebase (`node_modules`, `.git`, logs
Firebase y `.runtimeconfig.json`). Ambos paquetes reportaron idénticos:

- `Firebase sourceHash`: `29c96c95519ab5325748e0db8900209aafdfd7c7`.
- 68 archivos, 450,859 bytes sin comprimir y ZIP de 144,335 bytes.
- Manifiesto canónico SHA-256
  `d33ca89a08c3ee3e9d4ee9ccdfb412e389322447f5e6b7f3f536fc0541527b68`,
  calculado como JSON compacto ordenado por ruta UTF-8 de `{path, mode octal,
  SHA-256 del contenido}`.

No se declara identidad byte a byte del contenedor ZIP. La identidad validada
es el `sourceHash` Firebase y el manifiesto de contenido; Gate D deberá
contrastar la generación desplegada y el source remoto con el candidato antes de
validar el deploy.

## Inventario y delta exacto de staging

Todas las consultas remotas de este preflight fueron explícitamente contra
`micafe-pos-staging` y fueron de solo lectura, salvo el efecto administrado
descrito en «Mutation audit».

- `firebase functions:list` muestra 36 Functions activas en el proyecto; diez
  pertenecen a `saas-bodega`, todas Gen 2, Node.js 22, `us-central1`, con hash
  actual `ba3f92b487567003faf1b27ad13463a1e2677537` y cero Secrets.
- Las diez revisiones actuales de Cloud Run están `Ready` y reciben 100 % del
  tráfico:

| Callable existente | Revisión actual |
| --- | --- |
| `actualizarPresentacionComercialV1` | `actualizarpresentacioncomercialv1-00003-jur` |
| `cancelarSolicitudVentaBodegaV1` | `cancelarsolicitudventabodegav1-00002-vow` |
| `confirmarVentaBodegaV1` | `confirmarventabodegav1-00005-loz` |
| `consultarSolicitudesVentaBodegaV1` | `consultarsolicitudesventabodegav1-00002-yos` |
| `crearArticuloInventarioV1` | `creararticuloinventariov1-00003-sir` |
| `crearCategoriaBodegaV1` | `crearcategoriabodegav1-00003-yep` |
| `crearClienteVendedorV1` | `crearclientevendedorv1-00003-koj` |
| `crearPresentacionComercialV1` | `crearpresentacioncomercialv1-00003-fuv` |
| `crearSolicitudVentaBodegaV1` | `crearsolicitudventabodegav1-00002-laz` |
| `resolverSolicitudVentaBodegaV1` | `resolversolicitudventabodegav1-00002-fib` |

- Ninguno de los seis nombres nuevos está desplegado ni colisiona con otro
  codebase. Delta previsto: `10 update`, `6 create`, `0 delete`, `0` cambios a
  otros codebases o tráfico ajeno.
- No existe actualmente el Scheduler job
  `firebase-schedule-reconciliarAgendaPedidosBodegaV1-us-central1` ni un topic
  con ese nombre. Las APIs requeridas para Functions/Cloud Run/Eventarc/Build/
  Artifact Registry/Pub/Sub/FCM están habilitadas en staging.
- Firestore staging tiene tres documentos de empresa. La enumeración directa
  de sus subcolecciones confirmó `0` documentos en
  `agenda_pedidos_bodega`, `0` en `reservas_stock_bodega` y la consulta de
  `eventos_operativos` confirmó `0` recordatorios
  `RECORDATORIO_AGENDA_PEDIDO`. No hay vencimientos ni notificaciones de agenda
  que el nuevo scheduler deba procesar al arrancar. Consultas collection-group
  sin filtros confirmaron cero documentos, incluidos posibles subdocumentos
  huérfanos, en ambas subcolecciones.

## Índices requeridos por ADR-SAAS-064

El código hace una consulta `collectionGroup` sobre reservas activas vencidas
y una consulta de outbox por tipo/estado/fecha. El `firestore.indexes.json`
actual contiene 48 índices; el inventario remoto de staging tiene dos índices
`READY`, ninguno de los dos específicos de ADR-064. El intento de lectura del
collection group confirmó `FAILED_PRECONDITION` por índice ausente, no por
permisos ni por falta de datos.

Los dos índices ausentes son cambios aditivos necesarios para que el worker y
la agenda operen:

1. `reservas_stock_bodega`, scope `COLLECTION_GROUP`, `estado ASC`,
   `expiraEn ASC`.
2. `eventos_operativos`, scope `COLLECTION`, `tipo ASC`,
   `estadoDespacho ASC`, `fechaDisponible ASC`.

Gate D deberá crear únicamente esos dos índices en el database `(default)` de
`micafe-pos-staging`, con densidad `SPARSE_ALL`, y esperar estado `READY` antes
de desplegar Functions. No ejecutar un deploy global de los 48 índices ni
eliminar índices remotos. Los comandos de creación delimitados son:

```powershell
gcloud firestore indexes composite create --project=micafe-pos-staging --database='(default)' --collection-group=reservas_stock_bodega --query-scope=collection-group --density=sparse-all --field-config=field-path=estado,order=ascending --field-config=field-path=expiraEn,order=ascending
gcloud firestore indexes composite create --project=micafe-pos-staging --database='(default)' --collection-group=eventos_operativos --query-scope=collection --density=sparse-all --field-config=field-path=tipo,order=ascending --field-config=field-path=estadoDespacho,order=ascending --field-config=field-path=fechaDisponible,order=ascending
```

Si el deploy de Functions debe revertirse, los dos
índices aditivos permanecerán: no contienen datos de negocio y borrarlos puede
romper consultas concurrentes.

## Rollback preparado para Gate D

- Para cada update, enrutar el servicio afectado al 100 % a la revisión
  preexistente de la tabla anterior.
- Si falla una callable nueva, retirar solo las cinco callables nuevas.
- Si falla el worker, desactivar/eliminar primero el Scheduler job nuevo y
  retirar el endpoint `reconciliarAgendaPedidosBodegaV1`; verificar luego que
  no quedó tarea programada. No borrar Firestore, auditoría, fixture, índices
  ni recursos de otros codebases.
- No ejecutar rollback de API/rol administrado: Cloud Scheduler queda como
  dependencia aprobada de ADR-064, y el rol se limita a su service agent.
- Antes de Gate D se repetirá el inventario de datos, índices, revisiones,
  tráfico y job para detectar cambios concurrentes. Cualquier necesidad de
  conceder IAM manual adicional, añadir Secrets, tocar Rules o cambiar otro
  codebase será condición de parada.

## Mutation audit del preflight

- Archivos de producto/Firebase y source de Functions: sin cambios durante el
  preflight. La instalación/build solo generó dependencias y salida ignoradas.
- Deploy de Functions: `0`; Scheduler jobs creados: `0`; cambios de tráfico:
  `0`.
- Firestore, Auth, Rules, Secrets, fixture, Bootstrap, Activation, tenant real
  y producción: `0` escrituras/operaciones.
- Efecto involuntario pero acotado del `firebase deploy --dry-run` usado en la
  investigación: Cloud Audit Logs registraron la habilitación de
  `cloudscheduler.googleapis.com` en `micafe-pos-staging` a las
  `2026-10-08T05:20:56Z` (múltiples entradas del mismo flujo) y un `SetIamPolicy`
  de `service-agent-manager@system.gserviceaccount.com` añadió
  `roles/cloudscheduler.serviceAgent` a
  `service-192423427245@gcp-sa-cloudscheduler.iam.gserviceaccount.com`. No fue
  un grant manual ni un rol de usuario. Se verificó que no se crearon job ni
  endpoints ni hubo otros eventos de recursos/IAM durante esa ventana.
  La API/identidad administrada es necesaria para el scheduler aceptado; se
  deja registrada y no se intenta revertir.

## Estado y siguiente gate

- Gate C, para `main @ 1d94944a1cc9d028e1680c66e10b27e0f91cf497` y ADR-SAAS-064:
  `PREFLIGHT = PASS`.
- Gate D: `PENDING`. Primero crear/esperar los dos índices exactos; luego
  volver a verificar estado remoto y desplegar únicamente `saas-bodega` en
  `micafe-pos-staging`. No desplegar staging desde esta evidencia.
- Gate E conserva el fixture sintético existente. Gate F sigue `EN CURSO`; sus
  pruebas de staging, incluida la agenda ADR-064, quedan para después de Gate D.
  Gates G/H deberán repetirse y Gate I no autoriza todavía tenant real ni
  producción.
