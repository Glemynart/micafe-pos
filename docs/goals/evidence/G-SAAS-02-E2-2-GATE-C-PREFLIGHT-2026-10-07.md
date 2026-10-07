# G-SAAS-02 / M2 / E2.2 — Gate C: preflight de staging tras PR #466 (2026-10-06)

## Dictamen

`PREFLIGHT = PASS` para la fuente de `saas-bodega` integrada por PR #466 e
identificada en esta evidencia. No se ejecutó un deploy durante esta
revalidación. Gate D queda pendiente para este artefacto; el `PASS` anterior
de Gate D solo acredita el despliegue de la fuente previa.

Esta evidencia revalida el candidato porque PR #466 corrigió la normalización
de `presentacionId` en una unidad compartida por `functions-bodega`. El entrypoint
aislado importa esa unidad desde `functions/src/bodega-vendedor/solicitudes-venta.ts`;
por ello el fix sí forma parte del próximo artefacto `saas-bodega`.

## Identidad Git y CI

- Proyecto destino: `micafe-pos-staging`. Todos los comandos remotos de esta
  evidencia indican el proyecto explícitamente; el proyecto predeterminado de
  gcloud está sin configurar.
- `origin/main`: merge de PR #466,
  `8694491f61fd12d361d569f4a75218d8415c5f57`.
- Tree Git: `6357e741fc70075a520152f3621c535460152a18`.
- PR #466: `MERGED`; HEAD integrado
  `3d66808ab2ee557c7e962cbcf12aeda5946cb9eb`; merge registrado
  `2026-10-07T01:36:05Z` (`2026-10-06 20:36:05` hora de Bogotá).
- Checks de PR #466: `Tipos y pruebas`, `Vercel` y `Vercel Preview Comments`
  terminaron `PASS`.
- CI post-merge de `main`: run `37557917105`, SHA del merge anterior,
  `completed / success` el `2026-10-07T01:57:04Z`; el job `Tipos y pruebas`
  terminó `success`, incluidas las etapas E2E Bodega —solicitud, aprobación y
  venta canónica—. Este CI de Emulator no sustituye el Gate F en staging.

## Codebase y procedencia del candidato

- `firebase.json`: source `functions-bodega`, codebase `saas-bodega`; sin hook
  `predeploy`.
- Selector de deploy exclusivo:
  `functions:saas-bodega`, proyecto `micafe-pos-staging`; sin `--force` ni
  codebases adicionales.
- Node.js `v22.23.2`, npm `10.9.8`, Firebase CLI `15.32.1`, Google Cloud SDK
  `587.0.0`.
- `npm ci` en `functions-bodega`: `PASS`.
- `npm run build`: `PASS` en compilaciones repetidas.
- `npm test`: `PASS`, 2/2, cero fallos y cero skips.
- `npm run test:discovery`: `PASS`, 1/1; exactamente diez callables Gen 2.
- `npm run test:module-load`: `PASS`, 1/1; cero I/O de Firestore, Auth o
  Secrets al importar.
- `npm audit --omit=dev --audit-level=high`: salida `PASS` para el umbral alto;
  se observaron dos advisories moderados transitivos (`uuid@9.0.1` y
  `gaxios@6.7.1`), ya presentes en el preflight anterior. No se actualizaron
  dependencias.
- Firebase CLI `prepareFunctionsUpload` produjo un paquete de 62 archivos y
  118425 bytes. El `sourceHash` de Firebase fue
  `2e5c61e87d9f7e7dfe85654741826ef2e077f48d`.
- Manifiesto canónico compacto ordenado por ruta UTF-8, con `path`, modo y
  SHA-256 por archivo: 62 entradas, 358055 bytes, digest
  `978a0dca1d1d135c3c01de61710455bacf7a0c28c1980c2ce052ea2f7367d1ab`.
  Dos compilaciones produjeron el mismo número de entradas, tamaño, manifiesto
  y `sourceHash`.
- El SHA-256 del contenedor ZIP varió entre dos empaquetados de builds
  independientes (`9a6bd7a2ecc36472ce3bfadab802b5ea952144995865220211a6e20457e39b69`
  y `943b0bad02ef35304fb7cc704e25fdbed246ef045294d3e4a41e948b6237af3c`),
  aunque el manifiesto y `sourceHash` permanecieron idénticos. No se declara
  reproducibilidad byte a byte del contenedor ZIP: el digest de contenido
  verificable es el manifiesto canónico, y Gate D deberá comparar el artefacto
  remoto archivo por archivo y registrar el digest de la generación desplegada.
- El `firebase deploy --only functions:saas-bodega --project
  micafe-pos-staging --dry-run --non-interactive` ejecutado sobre este mismo
  árbol de `main` terminó `PASS` (`Dry run complete`); no desplegó Functions.

## Superficie y delta exacto

Discovery declara exactamente estas diez callables, todas en `us-central1`,
Node.js 22 y sin Secrets ni parámetros:

1. `actualizarPresentacionComercialV1`
2. `cancelarSolicitudVentaBodegaV1`
3. `confirmarVentaBodegaV1`
4. `consultarSolicitudesVentaBodegaV1`
5. `crearArticuloInventarioV1`
6. `crearCategoriaBodegaV1`
7. `crearClienteVendedorV1`
8. `crearPresentacionComercialV1`
9. `crearSolicitudVentaBodegaV1`
10. `resolverSolicitudVentaBodegaV1`

Firebase Functions en staging muestra esas diez funciones `ACTIVE`, con hash
remoto actual `5a749224a7ce9743b8b12d5dadc32626b3bfe163`, cero referencias a
Secrets y sin colisión en otro codebase. El source hash anterior desplegado era
`5ec2fb6088dce9df23cd300e7b743c13a0eae0ab`.

Con los hashes de entorno estándar (`FIREBASE_CONFIG` y `GCLOUD_PROJECT`) y
Secrets vacíos, el helper de Firebase CLI calcula hash remoto esperado
`5a749224a7ce9743b8b12d5dadc32626b3bfe163` para la fuente previa y
`ba3f92b487567003faf1b27ad13463a1e2677537` para la candidata. Por tanto el
delta previsto para el deploy dirigido es:

- `10 update`;
- `0 create`;
- `0 delete`;
- `0` cambios a otros codebases.

## Línea base de revisiones, salud y rollback

La consulta de Cloud Run devolvió exactamente diez servicios Bodega. Cada uno
está `Ready=True` y enruta el 100 % del tráfico a la revisión lista actual. Esas
revisiones son los objetivos conocidos de rollback si alguna revisión nueva
resulta no saludable:

| Callable | Revisión lista actual |
| --- | --- |
| `actualizarPresentacionComercialV1` | `actualizarpresentacioncomercialv1-00002-lod` |
| `cancelarSolicitudVentaBodegaV1` | `cancelarsolicitudventabodegav1-00001-civ` |
| `confirmarVentaBodegaV1` | `confirmarventabodegav1-00004-yiv` |
| `consultarSolicitudesVentaBodegaV1` | `consultarsolicitudesventabodegav1-00001-wew` |
| `crearArticuloInventarioV1` | `creararticuloinventariov1-00002-suz` |
| `crearCategoriaBodegaV1` | `crearcategoriabodegav1-00002-luk` |
| `crearClienteVendedorV1` | `crearclientevendedorv1-00002-mag` |
| `crearPresentacionComercialV1` | `crearpresentacioncomercialv1-00002-zuw` |
| `crearSolicitudVentaBodegaV1` | `crearsolicitudventabodegav1-00001-sef` |
| `resolverSolicitudVentaBodegaV1` | `resolversolicitudventabodegav1-00001-yis` |

El rollback es revertir el tráfico de cada servicio afectado a su revisión
actual listada arriba. No revierte hechos de negocio ni incluye eliminación de
fixture o datos.

## APIs, IAM y servicios administrados

Las APIs requeridas —Cloud Functions, Cloud Build, Artifact Registry, Cloud
Run, Eventarc, Pub/Sub, Storage y Firebase Extensions— ya están habilitadas en
`micafe-pos-staging`. El dry-run mostró mensajes de aseguramiento de APIs y
solicitud de identidades administradas de Eventarc/Pub/Sub; la consulta
Service Usage/IAM desde `2026-10-07T01:50:00Z` no devolvió eventos. La lectura
directa de metadatos de esas identidades sigue limitada por falta de
`iam.serviceAccounts.get`, por lo que no se afirma una comprobación directa de
su existencia ni un cambio IAM. El dry-run no cambió los servicios, revisiones,
tráfico ni source generations observados.

## Resultado y mutation audit

- Gate C para la fuente de PR #466: `PREFLIGHT = PASS`.
- Deploy real de Functions durante el preflight: `0`.
- Cambios observados en staging durante el preflight: `0`.
- Delta futuro autorizado por esta identificación: exclusivamente `10 update`
  de `saas-bodega` en `micafe-pos-staging`; se verificará de nuevo justo antes
  de Gate D.
- Codebases ajenos, producción, tráfico de producción, Firestore, Auth, Rules,
  Secrets, fixture, Bootstrap y Activation: `0`.
- IAM directo y cambios de APIs: `0` observados; los límites de auditoría de
  identidades administradas se detallan arriba.
- Archivos/commits/push/PR/merge realizados por el preflight: `0`; la evidencia
  se publica en PR documental separado.

## Estado siguiente

- Gate C revalidado para PR #466: `PASS`.
- Gate D para el nuevo hash `ba3f92b487567003faf1b27ad13463a1e2677537`:
  pendiente de deploy y verificación post-deploy.
- No crear otro fixture ni tenant. Tras Gate D se revalidarán Gate F, el
  rehearsal Gate G y la matriz Gate H antes de continuar Gate I.
- Gate I/J/K/L y E2.2 permanecen pendientes; este preflight no autoriza
  producción.
