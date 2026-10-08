# G-SAAS-02 / M2 / E2.2 — Gate C suplementario: reserva en operaciones Bodega (2026-10-08)

## Dictamen

`PREFLIGHT = PASS` únicamente para actualizar estas dos Functions existentes de
`saas-bodega-operations` en `micafe-pos-staging`:

- `consultarCatalogoPresentacionesVendedorV1`;
- `actualizarArticuloInventarioV1`.

Al aprobarse este preflight, Gate D para estas dos actualizaciones estaba
`PENDING`; su ejecución y verificación posteriores se registran abajo. Este
suplemento no reabre ni amplía el Gate D ya aprobado para `saas-bodega`, no cierra
Gate F y no autoriza otro codebase, fixture, venta, producción o tenant real.

## Identidad y procedencia

- Proyecto Firebase: `micafe-pos-staging`.
- Región/runtime: `us-central1` / Gen 2, Node.js 22.
- `origin/main`: `bff1754511495e15a4a700a17ebb5b335c60b929`; verificado igual al
  árbol local antes del preflight.
- Cambios funcionales integrados que se revalidan: PR #477, incluido el commit
  `040a0b70f5d842e0fdd55704405318c856dd1bea` (proyección de catálogo con
  reservas) y `734e5a68b32b83a779fd1fc9da7894079aa7a68c` (protección del ledger
  de inventario ante reservas). La CI post-merge de PR #477 está registrada en
  el Goal.
- `firebase.json` ya mapea el source `functions-bodega-operations` al codebase
  `saas-bodega-operations`; no fue modificado.

## Diagnóstico reproducible

La lectura actual, exclusivamente en staging, encontró el artículo sintético
del fixture con stock físico `6`, `stockReservado = 2` y una presentación activa
de factor `2`. La disponibilidad esperada bajo ADR-SAAS-064 es `4` unidades
base, es decir, como máximo `2` presentaciones.

El servicio remoto de catálogo seguía en el hash anterior
`1cb4b5476b2edb5eb976f6bff0fa6b38c4b44d21`. La inspección de su source ZIP
inmutable mostró que la revisión desplegada calculaba disponibilidad desde el
stock físico (`stock`) e ignoraba `stockReservado`; con los datos leídos eso
produce `floor(6 / 2) = 3`, que coincide con las tres presentaciones mostradas
en el POS. La fuente integrada calcula `stock - stockReservado` y falla cerrada
si la proyección no es consistente.

La actualización de inventario pertenece al mismo source y reutiliza el ledger.
PR #477 añadió allí validaciones para preservar holds: un ajuste/salida no puede
invadir unidades reservadas y no se puede desactivar el artículo mientras
exista una reserva. Por eso el delta mínimo correcto comprende ambas Functions,
no solo el catálogo.

## Huella del candidato y reconciliación del artefacto desplegado

El paquete se construyó desde el `origin/main` identificado arriba, usando
Firebase CLI `15.32.1`, Node `v22.23.2` y npm `10.9.8`. Se ejecutó directamente
`prepareFunctionsUpload` del Firebase CLI, sin `deploy --dry-run` ni llamadas de
mutación remota.

- El helper local `prepareFunctionsUpload` produjo el identificador candidato
  `ac1347612ac2fe910c8e19b060290d67724ef199`. La reconciliación post-deploy
  confirmó que este valor no coincide con el hash de source que Firebase asignó
  al artefacto desplegado; por tanto, no debe citarse como `sourceHash`
  desplegado.
- Manifiesto canónico SHA-256: `33ff8994964d42474c92919b0a0c601d31ada7b5e08a8a4bd23ab603c2a3a28c`.
- Contenido empaquetado: 61 archivos, 391,887 bytes sin comprimir.
- El build, tests y empaquetado incluyeron `lib` generado desde el mismo árbol;
  `node_modules`, `.git`, logs Firebase y `.runtimeconfig.json` quedan fuera del
  paquete, como establece el empaquetador.

## Inventario remoto y delta

`firebase functions:list --project micafe-pos-staging` confirmó exactamente seis
Functions en `saas-bodega-operations`, todas `ACTIVE`, Gen 2, `us-central1`,
Node.js 22 y hash anterior `1cb4b5476b2edb5eb976f6bff0fa6b38c4b44d21`:

| Function | Revisión previa lista | Source generation | Tráfico previo |
| --- | --- | --- | ---: |
| `consultarCatalogoPresentacionesVendedorV1` | `consultarcatalogopresentacionesvendedorv1-00001-yax` | `1790977484746865` | 100 % |
| `actualizarArticuloInventarioV1` | `actualizararticuloinventariov1-00001-niy` | `1790977535617981` | 100 % |
| `consultarClientesVendedorV1` | `consultarclientesvendedorv1-00001-peg` | — | 100 % |
| `consultarMisVentasVendedorV1` | `consultarmisventasvendedorv1-00001-buk` | — | 100 % |
| `abrirTurnoOperativoV1` | `abrirturnooperativov1-00001-noy` | — | 100 % |
| `cerrarTurnoOperativoV1` | `cerrarturnooperativov1-00001-bef` | — | 100 % |

El delta preparado fue exactamente `2 update / 0 create / 0 delete`; las otras
cuatro Functions no se seleccionan. Las dos Functions objetivo están `Ready`,
con 100 % de tráfico en las revisiones previas descritas. Sus descripciones
remotas no contienen bindings de Secrets ni parámetros de entorno propios.
El único Secret de otro codebase, `OPERATIONAL_PIN_PEPPER`, no pertenece a esta
selección ni se altera.

Comando acotado para Gate D:

```powershell
firebase deploy --only functions:saas-bodega-operations:consultarCatalogoPresentacionesVendedorV1,functions:saas-bodega-operations:actualizarArticuloInventarioV1 --project micafe-pos-staging --non-interactive
```

No usar `--force`, deploy global, otro codebase, Rules, índices o comandos de
datos.

## Validaciones locales

Con dependencias instaladas de manera limpia desde los lockfiles, sin cambios a
manifests ni lockfiles:

- `npm ci --no-audit --no-fund` en `functions-bodega-operations`: PASS, 269
  paquetes.
- `npm run build` en `functions-bodega-operations`: PASS.
- `npm test` en `functions-bodega-operations`: PASS, 3/3; discovery exacto de
  seis callables, closure del adapter y module-load sin I/O.
- `tsx --test src/bodega-vendedor/presentaciones.test.ts src/inventario/callables.test.ts src/inventario/ledger.test.ts` en `functions`: PASS, 23/23, incluidas proyección de reservas, ajustes que respetan holds, replay e idempotencia.
- `git diff --check`: PASS.

## Ejecución y verificación de Gate D suplementario

El `2026-10-08`, una vez fusionado PR #483 y con `origin/main` en
`a84f343a6cf9a6cf3baf667cedb0d55f8bec1b3e`, se ejecutó exactamente el comando
acotado de esta evidencia, sin `--force`. Firebase terminó con `Deploy
complete` (exit code 0). El deploy actualizó solo las dos Functions objetivo.

| Function | Hash de source remoto | Source generation | Build | Revisión Ready | Tráfico |
| --- | --- | ---: | --- | --- | ---: |
| `consultarCatalogoPresentacionesVendedorV1` | `6ed63ebadff83be08bb45a35ea2fca729b0e3ca3` | `1791457843769441` | `177e0817-05aa-4be2-aaad-352e37b8a6fd` — `SUCCESS` | `consultarcatalogopresentacionesvendedorv1-00002-kiy` | 100 % |
| `actualizarArticuloInventarioV1` | `6ed63ebadff83be08bb45a35ea2fca729b0e3ca3` | `1791457894449784` | `177e0817-05aa-4be2-aaad-352e37b8a6fd` — `SUCCESS` | `actualizararticuloinventariov1-00002-yoc` | 100 % |

El ZIP de source descargado desde la generación remota tiene 125,263 bytes y
SHA-256 `96d87d774533ce88e588254b153093fd728e72c209ecbc96d92dbd5a022b3d04`.
La comparación por ruta y contenido entre los 61 archivos extraídos del ZIP
remoto y los 61 archivos del paquete local produjo cero diferencias. Las otras
cuatro Functions de `saas-bodega-operations` permanecen en el hash previo
`1cb4b5476b2edb5eb976f6bff0fa6b38c4b44d21`; no se seleccionaron ni actualizaron.

Las dos revisiones nuevas están `Ready`, sirven 100 % del tráfico y no exponen
bindings de Secrets ni parámetros de entorno propios. La política de invocación
de Cloud Run se observó idéntica antes y después: `roles/run.invoker` para
`allUsers`; el log de auditoría no registró `SetIamPolicy`, habilitación de APIs,
creación de service identity ni cambios de IAM de proyecto. Los eventos IAM
`iam.serviceAccounts.actAs` corresponden a la autorización de ejecución del
deploy, no a una concesión persistente.

## Comprobación funcional de disponibilidad

Tras recargar el POS sintético del preview y abrir el formulario vacío de
solicitud, tanto la UI como el árbol de accesibilidad mostraron `Disponibles: 2`
para la presentación de factor 2. El fixture conserva stock físico 6 y 2
unidades reservadas, por lo que las 4 unidades libres permiten exactamente 2
presentaciones. No se agregó artículo a la solicitud ni se envió una venta.

La navegación de solo lectura a `Mi agenda` mostró cuatro entradas existentes:
tres `Cancelada` y una con estado `Stock reservado` para el viernes 9 de octubre,
una presentación de 2 unidades base. El banner superior aún ofrece `Activar`
notificaciones. No se pidió permiso al navegador, no se registró suscripción de
este dispositivo y no se verificó la entrega de un recordatorio push; esa parte
de Gate F continúa pendiente.

La inspección de los logs de Cloud Audit entre `2026-10-08T11:08:00Z` y
`2026-10-08T11:15:00Z` encontró las llamadas `GenerateUploadUrl` y
`UpdateFunction` de las dos Functions, además de los reemplazos internos de
revisión de Cloud Run y los eventos `actAs`. No encontró eventos de escritura de
Firestore/Auth, cambios de Rules, habilitación de APIs o modificación de IAM.

PR #483, que integró el preflight documental, quedó `MERGED` en
`a84f343a6cf9a6cf3baf667cedb0d55f8bec1b3e`; sus checks requeridos pasaron. La CI
post-merge de `main`, run `37766184623`, terminó `success` para ese SHA.

## Riesgo y rollback

El rollback técnico posible de cada servicio es volver al 100 % de tráfico de
su revisión previa registrada arriba. Esa versión anterior ignora las reservas
en el catálogo y carece de las protecciones nuevas de ledger. Si fuera
necesario enrutar atrás, detener las pruebas/escrituras de inventario y la
aceptación de agendas en el fixture, mantener el hold existente y volver a
desplegar/corregir la fuente protegida antes de reanudar. No borrar ni reducir
holds para acomodar una revisión antigua.

Antes del comando se repitió el snapshot de las seis Functions, tráfico, Secret
bindings y datos de inventario. No se detectó deriva: el delta continuó en
`2 update / 0 create / 0 delete`.

## Mutation audit del preflight y ejecución

- Archivos funcionales, `firebase.json` y manifests: 0 modificados.
- Deploy Firebase Functions: exactamente 2 actualizaciones de Functions
  existentes en `micafe-pos-staging`; sin create/delete.
- Tráfico: ambas quedaron en sus revisiones nuevas `Ready`, 100 %.
- Firestore/Auth/Rules/Storage/índices: 0 escrituras/cambios.
- IAM persistente/Secrets/parámetros: 0 cambios; cero bindings de Secrets en las
  dos Functions seleccionadas.
- Fixture, Bootstrap, Activation, producción, tenant real y transacciones:
  0 cambios/operaciones. Las acciones de navegador fueron lecturas tras
  recargar el POS, abrir el formulario vacío y consultar `Mi agenda`; no se
  agregó artículo, se envió solicitud ni se activó permiso de notificaciones.

## Estado

- Gate C suplementario para las dos Functions indicadas: `PREFLIGHT = PASS`.
- Gate D suplementario para estas dos actualizaciones: `PASS`; el artefacto,
  revisiones, tráfico, Secrets, IAM y disponibilidad del POS quedaron verificados.
- Gate D previo de `saas-bodega`: se conserva `PASS` dentro de su alcance
  documentado.
- Gate E: `PASS`, fixture sintético retenido.
- Gate F: `EN CURSO`; no declarar funcionalidad, agenda o Goal completados.
- Gates G/H/I y M3–M6 siguen separados; no hay autorización ni actividad en
  producción.
