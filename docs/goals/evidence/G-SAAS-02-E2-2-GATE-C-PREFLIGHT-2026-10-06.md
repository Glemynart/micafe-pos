# G-SAAS-02 / M2 / E2.2 — Gate C: preflight de staging (2026-10-06)

## Dictamen

`PREFLIGHT = PASS` para el artefacto de `saas-bodega` identificado aquí.
Este gate no ejecutó un deploy. Gate D sigue separado y pendiente; ningún
endpoint nuevo se presenta como activo por esta evidencia.

## Identidad Git, codebase y artefacto

- Proyecto de destino: `micafe-pos-staging`.
- `origin/main` al ejecutar el preflight: merge de PR #463,
  `f337758aa675f8aaa5307e64601c0a14af26c800`.
- Tree Git: `75a32913224549a8edbe08d8f85d70d1e666f6a1`.
- Selector de `firebase.json`: source `functions-bodega`, codebase
  `saas-bodega`; sin hook `predeploy`.
- Alcance del deploy futuro: exclusivamente
  `firebase deploy --only functions:saas-bodega --project micafe-pos-staging`;
  no se usará `--force` ni se incluirá otro codebase.
- Herramientas locales: Node.js `v22.23.2`, npm `10.9.8`, Firebase CLI
  `15.32.1`, Google Cloud SDK `587.0.0`.
- Fuente limpia extraída de `origin/main` fue compilada y empaquetada sin
  editar archivos versionados. El paquete de Firebase CLI contiene 62
  archivos; tamaño `118382` bytes (`115.61 KiB`).
- Firebase source hash: `5ec2fb6088dce9df23cd300e7b743c13a0eae0ab`.
- SHA-256 del ZIP: `c5182c717db551c3beb728a195a607df809ba17f36a9a61bef52d8f31c2fa830`.
- SHA-256 del manifiesto canónico ordenado por ruta (`path`, modo y SHA-256
  de cada archivo, serializado como JSON compacto):
  `07b051a2e078bacce21ef9baf6cf119e8f821aad5383b0aa743535ffbe1aa06a`.
- Dos empaquetados consecutivos con Firebase CLI produjeron los mismos
  source hash, ZIP SHA-256 y tamaño.

## Superficie declarada

`functions-bodega/src/index.ts` descubre exactamente diez callables Gen 2 en
`us-central1`, Node.js 22, sin Secrets ni parámetros:

1. `crearCategoriaBodegaV1`
2. `crearClienteVendedorV1`
3. `crearPresentacionComercialV1`
4. `actualizarPresentacionComercialV1`
5. `crearArticuloInventarioV1`
6. `confirmarVentaBodegaV1`
7. `crearSolicitudVentaBodegaV1`
8. `consultarSolicitudesVentaBodegaV1`
9. `resolverSolicitudVentaBodegaV1`
10. `cancelarSolicitudVentaBodegaV1`

El descubrimiento y las pruebas de module-load confirman cero Secrets y cero
I/O de Firestore/Auth/Secrets durante la carga del módulo.

## Validación local y dry-run

Las validaciones se ejecutaron sobre el árbol limpio de `origin/main` con el
Node/npm indicados arriba:

| Comando | Resultado |
| --- | --- |
| `npm ci` en `functions-bodega` | PASS. npm reportó dos advisories moderados transitivos, detallados abajo. |
| `npm run build` | PASS — `tsc -p tsconfig.json`. |
| `npm test` | PASS — 2/2, cero fallos y cero skips. |
| `npm run test:discovery` | PASS — 1/1; diez callables y cero Secrets. |
| `npm run test:module-load` | PASS — 1/1; sin I/O remoto al importar. |
| `firebase deploy --only functions:saas-bodega --project micafe-pos-staging --dry-run --non-interactive` | PASS — `Dry run complete`; preparó el source ZIP y no desplegó Functions. |

El dry-run confirmó el codebase `saas-bodega` y empaquetó `functions-bodega`
en `115.61 KiB`. Firebase CLI anunció el aseguramiento de APIs y solicitó
generar las identidades administradas de Pub/Sub y Eventarc. Antes del dry-run
las APIs requeridas —Cloud Functions, Cloud Build, Artifact Registry, Cloud
Run, Eventarc, Pub/Sub, Storage y Firebase Extensions— ya figuraban
habilitadas. La consulta de logs Service Usage/IAM desde
`2026-10-06T20:45:00Z` no devolvió eventos; una lectura posterior confirmó que
las revisiones y generaciones de source de las Functions existentes no
cambiaron. `gcloud iam service-accounts describe` para esas identidades
administradas fue rechazado por falta de `iam.serviceAccounts.get`; por eso no
se afirma una lectura directa de sus metadatos. No se registró creación IAM ni
cambio de API en la auditoría consultada.

## Línea base remota y delta calculado

`gcloud functions list --v2` y `firebase functions:list --json` en
`micafe-pos-staging` encontraron seis endpoints con esos nombres, todos
`saas-bodega`, `us-central1`, Node.js 22, estado `ACTIVE`, con 100 % del
tráfico en su revisión actual y cero referencias a Secrets. No apareció una
colisión de nombre en otro codebase. Las revisiones anteriores siguen listas
para rollback.

| Callable existente | Revisión lista actual | Hash remoto actual |
| --- | --- | --- |
| `actualizarPresentacionComercialV1` | `actualizarpresentacioncomercialv1-00001-qir` | `6626f37e101c206c5377eef232f71015e5c52459` |
| `confirmarVentaBodegaV1` | `confirmarventabodegav1-00003-cud` | `b83101a22de33fb2a50c4c4b1081dd73341a22b7` |
| `crearArticuloInventarioV1` | `creararticuloinventariov1-00001-bix` | `6626f37e101c206c5377eef232f71015e5c52459` |
| `crearCategoriaBodegaV1` | `crearcategoriabodegav1-00001-zin` | `41b7db7415558b023086b660d8a07f2681b8d94e` |
| `crearClienteVendedorV1` | `crearclientevendedorv1-00001-cad` | `6626f37e101c206c5377eef232f71015e5c52459` |
| `crearPresentacionComercialV1` | `crearpresentacioncomercialv1-00001-nek` | `6626f37e101c206c5377eef232f71015e5c52459` |

Firebase CLI calcula para el candidato un source hash
`5ec2fb6088dce9df23cd300e7b743c13a0eae0ab`, hash vacío de entorno
`bf21a9e8fbc5a3846fb05b4fa0859e0917b2202f` y hash vacío de Secrets con el
mismo valor; el endpoint hash esperado es
`0ba0e563847656d92e777cd2a27f2a3ef278540a`. Comparar ese hash con el
inventario remoto establece el delta exacto:

- 6 actualizaciones de las funciones Bodega existentes;
- 4 altas: `crearSolicitudVentaBodegaV1`,
  `consultarSolicitudesVentaBodegaV1`, `resolverSolicitudVentaBodegaV1` y
  `cancelarSolicitudVentaBodegaV1`;
- 0 eliminaciones;
- 0 cambios a `saas-auth` u otros codebases.

## Rollback staging

Las seis revisiones actuales están `Ready`; las revisiones antiguas de
`confirmarVentaBodegaV1` (`00001-diw` y `00002-kig`) también siguen listas. Si
una actualización causa regresión, el rollback de código consiste en volver
el 100 % del tráfico del servicio afectado a su revisión lista anterior. Si
se necesita revertir una de las cuatro altas, se retira únicamente el
endpoint nuevo por su nombre exacto y se vuelve a desplegar la fuente previa;
no se borra el fixture ni ningún dato de Firestore/Auth/auditoría. El rollback
no revierte hechos de negocio.

## Seguridad y riesgos residuales

`npm audit --omit=dev` detectó dos advisories moderados transitivos para
`uuid@9.0.1`/`gaxios@6.7.1`, encadenados desde `firebase-admin`. El advisory de
UUID afecta a v3/v5/v6 con buffer proporcionado por caller; la inspección del
paquete encontró que el único uso de UUID dentro de Gaxios es `v4()` para el
boundary multipart, y Bodega no importa UUID/Gaxios directamente. No se
alteraron dependencias como parte del preflight. No se reportaron advisories
altos ni críticos en esta instalación de `functions-bodega`; el riesgo
moderado queda registrado para reevaluación antes del release productivo.

## Resultado y mutation audit

- Build/package/discovery/module-load: PASS.
- Delta demostrado: `6 update / 4 create / 0 delete`.
- Deploy real de Functions: `0`.
- Revisión, tráfico y source generation de Functions remotas modificados: `0`.
- APIs nuevas habilitadas o eventos IAM/Service Usage observados: `0`.
- Secrets, Firestore, Auth, Rules, IAM directo, fixture adicional, Bootstrap,
  Activation, producción: `0`.
- La llamada de dry-run para asegurar identidades Pub/Sub/Eventarc y la
  limitación de lectura directa de sus service accounts quedan registradas
  arriba; no se encontraron eventos de creación en los logs consultados.
- Siguiente gate: **Gate D — deploy controlado únicamente de
  `functions:saas-bodega` en `micafe-pos-staging`**, seguido por la
  verificación remota inmediata definida por ADR-SAAS-048.
