# G-SAAS-02 / M2 / E2.2 — Gate C suplementario: reserva en operaciones Bodega (2026-10-08)

## Dictamen

`PREFLIGHT = PASS` únicamente para actualizar estas dos Functions existentes de
`saas-bodega-operations` en `micafe-pos-staging`:

- `consultarCatalogoPresentacionesVendedorV1`;
- `actualizarArticuloInventarioV1`.

Gate D para estas dos actualizaciones permanece `PENDING`. Este suplemento no
reabre ni amplía el Gate D ya aprobado para `saas-bodega`; tampoco cierra Gate F
ni autoriza otro codebase, fixture, venta, producción o tenant real.

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

## Huella del candidato

El paquete se construyó desde el `origin/main` identificado arriba, usando
Firebase CLI `15.32.1`, Node `v22.23.2` y npm `10.9.8`. Se ejecutó directamente
`prepareFunctionsUpload` del Firebase CLI, sin `deploy --dry-run` ni llamadas de
mutación remota.

- Firebase `sourceHash`: `ac1347612ac2fe910c8e19b060290d67724ef199`.
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

El delta preparado es exactamente `2 update / 0 create / 0 delete`; las otras
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

## Riesgo y rollback

El rollback técnico posible de cada servicio es volver al 100 % de tráfico de
su revisión previa registrada arriba. Esa versión anterior ignora las reservas
en el catálogo y carece de las protecciones nuevas de ledger. Si fuera
necesario enrutar atrás, detener las pruebas/escrituras de inventario y la
aceptación de agendas en el fixture, mantener el hold existente y volver a
desplegar/corregir la fuente protegida antes de reanudar. No borrar ni reducir
holds para acomodar una revisión antigua.

Gate D deberá, inmediatamente antes del comando, repetir el snapshot de las seis
Functions, tráfico, Secret bindings y datos de inventario. Cualquier deriva en
el delta o cambio ajeno invalida este PASS y detiene el deploy.

## Mutation audit del preflight

- Archivos funcionales, `firebase.json` y manifests: 0 modificados.
- Firebase Functions deploy/tráfico: 0; Firestore/Auth: 0 escrituras.
- Rules, IAM, Secrets, Storage, índices, fixture, Bootstrap, Activation,
  producción y tenant real: 0 cambios/operaciones.
- La única actividad remota fue lectura de inventario de Functions, revisiones,
  tráfico y documentos sintéticos de staging.

## Estado

- Gate C suplementario para las dos Functions indicadas: `PREFLIGHT = PASS`.
- Gate D para estas dos actualizaciones: `PENDING`.
- Gate D previo de `saas-bodega`: se conserva `PASS` dentro de su alcance
  documentado.
- Gate E: `PASS`, fixture sintético retenido.
- Gate F: `EN CURSO`; no declarar funcionalidad, agenda o Goal completados.
- Gates G/H/I y M3–M6 siguen separados; no hay autorización ni actividad en
  producción.
