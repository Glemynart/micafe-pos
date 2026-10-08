# G-SAAS-02 / M2 / E2.2 — Gate D: deploy staging ADR-SAAS-064 (2026-10-08)

## Dictamen

`STAGING_DEPLOY = PASS` para `saas-bodega` en `micafe-pos-staging`, región
`us-central1`. El despliegue se limitó a ese codebase: 10 Functions actualizadas,
6 creadas, cero eliminadas. Las 16 quedaron `ACTIVE`, Gen 2, Node.js 22, sin
bindings de Secrets y con 100 % del tráfico de cada servicio en su revisión
`Ready` más reciente. El scheduler protegido ejecutó automáticamente su primera
invocación observada y respondió HTTP 200.

Esta evidencia cierra Gate D para el artefacto de ADR-SAAS-064; no cierra Gate F,
G, H, ni autoriza tenant real, cutover o producción.

## Identidad y procedencia

- Proyecto único: `micafe-pos-staging`.
- `origin/main` verificado antes del deploy:
  `026b130106ec17ac8f7ef50f101039078358f8f7`.
- Fuente Bodega de Gate C: commit
  `1d94944a1cc9d028e1680c66e10b27e0f91cf497`; el merge documental posterior de
  PR #480 no cambió `functions-bodega`.
- Firebase `sourceHash`:
  `29c96c95519ab5325748e0db8900209aafdfd7c7`.
- Manifiesto de contenido SHA-256:
  `d33ca89a08c3ee3e9d4ee9ccdfb412e389322447f5e6b7f3f536fc0541527b68`.
- Las 16 generaciones fuente remotas tienen ZIP SHA-256 idéntico:
  `6b1a74f475e237038ab9e4f9b726b2110158c1394260247cf52eb56a66cc3efb`.
  El paquete comparado contiene 68 archivos / 450.859 bytes; comparación de
  rutas y hashes contra `functions-bodega` en `main`: cero diferencias.
- Ejemplo de generación inmutable: bucket
  `gcf-v2-sources-192423427245-us-central1`, objeto
  `crearClienteVendedorV1/function-source.zip`, generación `1791441871017224`.
- Cloud Build regional `64268683-275a-4f07-91c1-d9fbacea0762`:
  `SUCCESS`, creado `2026-10-08T06:43:40.579Z`, finalizado
  `2026-10-08T06:44:23.681Z`. Las 16 Functions apuntan a ese build.
- Comando ejecutado:
  `firebase deploy --only functions:saas-bodega --project micafe-pos-staging --non-interactive`;
  salida `Deploy complete`, exit code `0`.

## Superficie remota verificada

Las 15 callables y el worker están activos en `us-central1`, Node.js 22, sin
bindings de Secrets. Las 16 revisiones están `Ready` y reciben 100 % del tráfico
de su servicio.

| Function | Revisión lista |
| --- | --- |
| `actualizarPresentacionComercialV1` | `actualizarpresentacioncomercialv1-00004-dob` |
| `cancelarProgramacionPedidoBodegaV1` | `cancelarprogramacionpedidobodegav1-00001-jog` |
| `cancelarSolicitudVentaBodegaV1` | `cancelarsolicitudventabodegav1-00003-fil` |
| `confirmarVentaBodegaV1` | `confirmarventabodegav1-00006-zeh` |
| `consultarAgendaPedidosBodegaV1` | `consultaragendapedidosbodegav1-00001-naz` |
| `consultarSolicitudesVentaBodegaV1` | `consultarsolicitudesventabodegav1-00003-zeg` |
| `convertirProgramacionPedidoBodegaV1` | `convertirprogramacionpedidobodegav1-00001-dur` |
| `crearArticuloInventarioV1` | `creararticuloinventariov1-00004-kaz` |
| `crearCategoriaBodegaV1` | `crearcategoriabodegav1-00004-duj` |
| `crearClienteVendedorV1` | `crearclientevendedorv1-00004-nom` |
| `crearPresentacionComercialV1` | `crearpresentacioncomercialv1-00004-hoz` |
| `crearProgramacionPedidoBodegaV1` | `crearprogramacionpedidobodegav1-00001-biq` |
| `crearSolicitudVentaBodegaV1` | `crearsolicitudventabodegav1-00003-tiw` |
| `reconciliarAgendaPedidosBodegaV1` | `reconciliaragendapedidosbodegav1-00001-huh` |
| `resolverProgramacionPedidoBodegaV1` | `resolverprogramacionpedidobodegav1-00001-per` |
| `resolverSolicitudVentaBodegaV1` | `resolversolicitudventabodegav1-00003-caz` |

POST sin token a cada una de las 15 callables: `15/15` respondieron HTTP `401`
`UNAUTHENTICATED`. La frontera compartida deriva tenant y actor únicamente
después de verificar `request.auth`; no se usaron credenciales ni se ejecutaron
comandos de negocio. No se registraron logs de severidad ERROR para las seis
superficies nuevas consultadas.

### Índices ADR-SAAS-064

Ambos índices compuestos requeridos en `(default)` están `READY` en staging:

1. `reservas_stock_bodega`, `COLLECTION_GROUP`, `estado ASC`, `expiraEn ASC`,
   `SPARSE_ALL`; ID `CICAgJim14AK`.
2. `eventos_operativos`, `COLLECTION`, `tipo ASC`, `estadoDespacho ASC`,
   `fechaDisponible ASC`, `SPARSE_ALL`; ID `CICAgJjF9oIK`.

### Scheduler de agenda

Existe exactamente un job nuevo:
`firebase-schedule-reconciliarAgendaPedidosBodegaV1-us-central1`. Está
`ENABLED`, cada cinco minutos, UTC, target al worker esperado y token OIDC de
`192423427245-compute@developer.gserviceaccount.com`. El servicio del worker
solo concede `roles/run.invoker` a esa cuenta. La invocación observada el
`2026-10-08T06:53:00.813Z` respondió HTTP `200`; el log de Cloud Scheduler
registró HTTP `200` a las `06:53:09.696Z`. No se forzó una ejecución manual.

## IAM, seguridad y rollback

Cloud Audit Logs muestran seis cambios de IAM a nivel de servicio Run, todos
limitados a las superficies nuevas. Cinco callables recibieron el binding
`roles/run.invoker` para `allUsers`, consistente con el endpoint HTTP del
protocolo Firebase Callable; la autenticación Firebase sigue siendo obligatoria
y se comprobó con las 15 respuestas `401`. El worker recibió únicamente el
binding para la cuenta de servicio OIDC descrita arriba. No hubo cambios de IAM
de proyecto ni grants manuales; los endpoints existentes no relacionados no
cambiaron su política. Se registra explícitamente esta mutación de políticas
por servicio; no se reporta IAM como cero.

El preflight de Gate C ya documentó que un `dry-run` anterior habilitó
`cloudscheduler.googleapis.com` y que Google añadió el rol service-agent
`roles/cloudscheduler.serviceAgent`. Durante la ventana de este deploy no se
registraron cambios de Service Usage adicionales. Esa dependencia administrada
previa se conserva y no se revierte.

No se añadieron bindings de Secret Manager ni se modificaron Secrets, Rules,
Auth, datos de negocio, otros codebases o endpoints ajenos. La lectura
post-deploy del fixture `E2_2-BODEGA-STAGING-FIXTURE` confirmó cero documentos
en `agenda_pedidos_bodega`, `reservas_stock_bodega` y en el outbox global
`eventos_operativos` filtrado por ese tenant y tipo de recordatorio. Esto
concuerda con el inventario vacío previo a Gate D; el worker no tuvo agenda,
hold ni recordatorio del fixture que procesar.

Rollback preparado y sin ejecutar: para cada actualización, enrutar al 100 % a
la revisión previa registrada en Gate C; si fallara una nueva callable,
retirar solo esa callable; si fallara el worker, deshabilitar primero el job y
retirar solo el worker. Se conservan índices y datos. No se ejecutó rollback.

## CI y validaciones heredadas de Gate C

- PR #479: checks `Tipos y pruebas`, `Vercel` y `Vercel Preview Comments`:
  `PASS`.
- CI post-merge de PR #479: run `37731432362`, `success`.
- PR #480: mismos tres checks `PASS`; merge commit
  `026b130106ec17ac8f7ef50f101039078358f8f7`.
- CI post-merge de PR #480: run `37735749847`, `success` para ese SHA.
- El código de `functions-bodega` no cambió entre el source SHA del preflight y
  el `origin/main` inspeccionado antes del deploy. Gate C aporta `npm ci`, build,
  pruebas `9/9`, discovery `15` callables + scheduler y module-load `PASS` para
  ese mismo source.

## Mutation audit

- Archivos de producto/Functions: `0` cambios en este gate.
- Functions: `10 update`, `6 create`, `0 delete`, solo codebase `saas-bodega`.
- Tráfico: `100 %` a las revisiones listas esperadas; sin tráfico de negocio.
  Hubo 15 sondas no autenticadas y una invocación automática del scheduler.
- Firestore: `2` índices compuestos creados; `0` documentos de agenda, reserva
  u outbox creados/modificados por la validación del worker.
- IAM: `6` políticas de servicio Run actualizadas, 5 callables con `allUsers`
  como invoker HTTP y el worker con la cuenta OIDC de Scheduler; IAM de proyecto
  y grants manuales: `0`.
- Service Usage: `0` cambios durante el deploy; el cambio previo de Scheduler
  está registrado en Gate C.
- Auth, Rules, Secrets, fixture nuevo, Bootstrap, Activation, tenant real,
  producción y rollback: `0` operaciones.

## Estado siguiente

- Gate C: `PASS`.
- Gate D: `PASS` para ADR-SAAS-064, con deploy, scheduler y superficie remota
  verificados.
- Gate E: `PASS`, fixture sintético existente y retenido.
- Gate F: `EN CURSO`, no `PASS`. Falta completar la matriz funcional staging:
  aislamiento entre tenants y roles, revocación/restauración con replay,
  retry autenticado ante pérdida de respuesta, y agenda/reservas (crear,
  aceptar, liberar, expirar, consumir stock, recordatorios y conversión
  idempotente a solicitud de venta); además confirmar la ruta canónica de venta,
  turnos, inventario, ledger, auditoría, reportes, PWA y Backoffice.
- Gate G debe repetirse y Gate H debe emitir una matriz nueva después de F.
- Gate I/J/K/L continúan pendientes. No se creó/configuró el tenant real,
  no se inició el Trial y no se tocó producción.
