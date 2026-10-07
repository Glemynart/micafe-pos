# G-SAAS-02 / M2 / E2.2 — Gate D: redeploy staging tras PR #466 (2026-10-06)

## Dictamen

`GATE D = PASS` para el artefacto `saas-bodega` integrado en `main` después de PR #466. El despliegue se limitó a `micafe-pos-staging` y al codebase `saas-bodega`. Diez Functions quedaron activas en Node.js 22, listas y con 100 % del tráfico en sus revisiones nuevas. La fuente remota coincide archivo por archivo con el paquete local. Diez sondas sin autenticación respondieron `401 UNAUTHENTICATED`.

No se ejecutó operación de negocio autenticada, no se creó fixture ni tenant y producción no fue tocada.

## Identidad y validaciones

- `origin/main`: `abbeac7a09764efd01e83153d1ae05a039a821f0`; tree `38e20a3f7221c0dc742323478611d8e6130cbaa6`.
- PR #467: `MERGED` en ese SHA. CI post-merge run `37563515007`: `completed / success`, SHA coincidente.
- Gate C `sourceHash`: `ba3f92b487567003faf1b27ad13463a1e2677537`.
- `npm ci`, `npm run build`, `npm test` (2/2), `npm run test:discovery` (1/1, diez callables), `npm run test:module-load` (1/1, sin I/O Firestore/Auth/Secrets) y Firebase deploy dry-run: `PASS`. npm reportó dos advisories moderados transitivos (`uuid`, `gaxios`); no se actualizaron dependencias.
- Cloud Build `41db5eaf-21eb-4651-aaf1-d4fec53208e0`: `SUCCESS`.
- Imagen de las diez revisiones: `us-central1-docker.pkg.dev/micafe-pos-staging/gcf-artifacts/micafe--pos--staging__us--central1__crear_categoria_bodega_v1@sha256:79052ed05dbb4823181b6fd8f2a1460a2dca62172acf5eee27e209020baeb2d3`.

## Deploy y revisiones

Comando: `firebase deploy --only functions:saas-bodega --project micafe-pos-staging --non-interactive`. Salida `Deploy complete`, exit code `0`: exactamente diez `update`, cero `create`, cero `delete`; no se desplegó otro codebase.

| Callable | Generación fuente | Revisión nueva | Estado / tráfico |
| --- | ---: | --- | --- |
| `actualizarPresentacionComercialV1` | `1791342519159643` | `actualizarpresentacioncomercialv1-00003-jur` | Ready / 100 % |
| `cancelarSolicitudVentaBodegaV1` | `1791342519093675` | `cancelarsolicitudventabodegav1-00002-vow` | Ready / 100 % |
| `confirmarVentaBodegaV1` | `1791342519218458` | `confirmarventabodegav1-00005-loz` | Ready / 100 % |
| `consultarSolicitudesVentaBodegaV1` | `1791342519164214` | `consultarsolicitudesventabodegav1-00002-yos` | Ready / 100 % |
| `crearArticuloInventarioV1` | `1791342519149407` | `creararticuloinventariov1-00003-sir` | Ready / 100 % |
| `crearCategoriaBodegaV1` | `1791342478629508` | `crearcategoriabodegav1-00003-yep` | Ready / 100 % |
| `crearClienteVendedorV1` | `1791342519143628` | `crearclientevendedorv1-00003-koj` | Ready / 100 % |
| `crearPresentacionComercialV1` | `1791342519212922` | `crearpresentacioncomercialv1-00003-fuv` | Ready / 100 % |
| `crearSolicitudVentaBodegaV1` | `1791342519060734` | `crearsolicitudventabodegav1-00002-laz` | Ready / 100 % |
| `resolverSolicitudVentaBodegaV1` | `1791342519209894` | `resolversolicitudventabodegav1-00002-fib` | Ready / 100 % |

Las diez Functions están en `us-central1`, runtime `nodejs22`, con cero referencias reales en `secretEnvironmentVariables`.

## Digest y procedencia

Los ZIP fuente de las diez generaciones inmutables tienen el mismo SHA-256: `640573838b75c0af319971213ce7e44d5598eb62797df2be750da86050708340`. Cada uno contiene 62 archivos (358,055 bytes sin comprimir); se compararon sus archivos con `functions-bodega` local compilado y hubo cero diferencias. El manifiesto de rutas ordenadas, tamaño y SHA-256 por archivo tiene digest `7dc9ec2e465e73a767d1a37acc152007e5b23e2ad47baa574c896cbd0e7b81bc`. Las diez revisiones apuntan al Cloud Build exitoso y al digest de imagen indicado arriba: `main`/tree Git → paquete local → generaciones fuente remotas → Cloud Build → revisiones activas.

## Seguridad y mutation audit

- POST sin credenciales a cada callable: `401` en `10/10`; cero lógica de negocio ejecutada.
- IAM: cero `SetIamPolicy`. Se observaron verificaciones `iam.serviceAccounts.actAs` del deploy; no son cambios de política. IAM manual: `0`.
- Eventos observados: Secret Manager `0`, Firestore `0`, Identity Toolkit/Auth `0`, Service Usage/API enablement `0`.
- No se hizo rollback; las diez revisiones están listas y saludables. Los destinos previos de rollback están en la evidencia Gate C.
- Se actualizaron solo diez Functions existentes de `saas-bodega`. Rules, fixture, Bootstrap, Activation, tráfico de negocio y producción: `0` cambios/acciones.

## Estado siguiente

Gate C: `PASS`; Gate D: `PASS`; Gate E: `PASS` con el fixture sintético retenido. Siguiente: repetir Gate F en staging, luego repetir Gate G y emitir una certificación Gate H nueva según ADR-SAAS-062.

Gate I permanece `PENDING`: no existe tenant real configurado; la oferta anual de `1.600.000 COP` no está persistida ni aceptada por el cliente; vigencia, usuarios iniciales y catálogo/inventario finales requieren confirmación. Gates J/K/L, M2/E2.2 y G-SAAS-02 siguen pendientes. Este deploy no inicia el Trial real de 30 días ni autoriza producción.
