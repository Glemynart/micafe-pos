# G-SAAS-02 / M2 / E2.2 — Gate I: revalidación read-only post-merge en `main @ f604a0a`

## Dictamen

`INCOMPLETE` para release productivo y tenant real. PR #594 está integrado. La CI post-merge del SHA objetivo seguía `in_progress` al observarse a las 16:21 UTC; el SHA no tiene estado Vercel exitoso. Esta revalidación no desplegó ni escribió en producción.

## Identidad y método

- **SHA objetivo y `origin/main`:** `f604a0af1669cc0903859c7271b1da1e3f29cea9`.
- **Proyecto productivo:** `micafe-pos`.
- **Hora del collector:** `2026-10-14T16:21:28.347Z`.
- **Checkout:** carpeta productiva aislada, limpia, detached en el SHA objetivo.
- **Colector:** `scripts/g-saas-02/release-evidence.ts`, con `--project micafe-pos --repo Glemynart/micafe-pos --sha f604a0af1669cc0903859c7271b1da1e3f29cea9`.
- **Resultado:** `INCOMPLETE`, `readOnly=true`, `productionWrites=false`, `collectionErrors=[]`.
- **Límites:** lectura de GitHub, Functions, Rules, Storage, metadata de Firestore/backups y listado de Vercel. No se leyeron documentos de negocio ni se invocaron operaciones autenticadas. No hubo deploy, escrituras, cambios IAM/Secrets, ni cambios en tenant, Auth o datos.

## Evidencia

| Superficie | Observación |
|---|---|
| `origin/main` | Coincide con `f604a0af1669cc0903859c7271b1da1e3f29cea9`. |
| CI | Run `38597025350`, SHA objetivo, `in_progress` a las `2026-10-14T16:21Z`; no se reporta como PASS hasta que concluya. |
| Vercel | Sin estado exitoso para el SHA objetivo. Listado read-only de producción: 73 deployments; el más reciente `READY` apunta a `main @ 1c2f155653536b1fd8e1925db931e2354fa41f7d`, creado `2026-10-06T14:52:13.319Z`. El SHA `f604a0a` no está publicado. |
| Functions | 104/104 `ACTIVE`, runtime `nodejs22`. Las 13 rutas objetivo y 11 de soporte Bodega están activas. `registrarCompraOperativaV1` conserva el hash `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`, anterior al guard ADR-SAAS-075. `wompiReservasWebhookV1` no aparece en el inventario. |
| Firestore Rules | `MISMATCH`; release `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, fuente `2dc12a5972c216601a21cbae6be73bd787558f4fdad4a33227f05dee37087b91`, remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. |
| Storage Rules | `PASS`; SHA fuente/remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`. |
| Smoke y recuperación | Faltan atestaciones independientes para el release objetivo. PITR está deshabilitado; se observan 1 backup schedule y 35 backups en `southamerica-east1`. |

Las Rules fueron leídas directamente mediante la API; su comparación sigue en `MISMATCH`. `MISSING` para atestación independiente significa que no se proporcionó evidencia externa al collector, no que no se haya inspeccionado el ruleset.

## Revalidación complementaria — 2026-10-14T16:33Z

- `origin/main` sigue en `f604a0af1669cc0903859c7271b1da1e3f29cea9`. La CI post-merge `38597025350` y la CI del PR #595 (`38597973053`) continúan `in_progress`; ningún check se registra como PASS mientras siga pendiente.
- Una nueva lectura del collector a las `2026-10-14T16:29:54.494Z` conservó `INCOMPLETE`, `readOnly=true`, `productionWrites=false` y `collectionErrors=[]`; Functions, hashes, Rules, Storage y recuperación no cambiaron frente a la tabla anterior.
- La consulta directa de deployments Vercel vuelve a mostrar como `READY` más reciente `main @ 1c2f155653536b1fd8e1925db931e2354fa41f7d`, del 6-oct; `f604a0a` no está publicado. `vercel.json` mantiene deshabilitados los deploys automáticos desde `main`.
- Para acotar el impacto DIAN se ejecutó únicamente una agregación server-side, sin devolver documentos ni identificadores: `ventas` con `dian.emitidoEn IS NOT NULL` = `0`. Esto indica que no se observaron ventas con emisión DIAN persistida en el conteo consultado; no demuestra que ningún tenant activo dependa de emitir en el futuro. El código todavía importa y llama `guardarMetadatosDian()` desde `components/pos/historial.tsx`, y la función hace `setDoc` cliente; las Rules candidatas niegan todas las escrituras de `/ventas`. Por eso el corte global sigue condicionado a confirmar la operación de los tenants activos o a resolver ese writer bajo autoridad de servidor; el conteo `0` no autoriza desplegar Rules.
- La evidencia de recovery del `2026-08-15` sí registra un restore aislado `SUCCESSFUL` con RPO `0.220 h` y RTO `0.232 h`; sigue siendo una prueba histórica, no una atestación ligada al release actual. La observación de smoke de esa fecha fue anónima y dejó `AUTHENTICATED_TENANT_SMOKE = MISSING`, por lo que tampoco cierra el smoke de Gate I.

Esta revalidación fue de lectura y agregación únicamente. No hubo deploy, cambio de Rules/Vercel/PITR, modificación IAM/Secrets, lectura de documentos de negocio, ni escritura de tenant o datos.

## Estado y límites de salida

Gate I continúa `INCOMPLETE`: falta publicar/verificar el guard de la callable legacy, resolver y autorizar el corte de Rules tras reconciliar el uso productivo de DIAN, desplegar una versión identificable de Vercel, y obtener smoke/restore independientes. No se activa PITR ni se crea tenant/Trial como parte de esta lectura. La autorización de ADR-SAAS-078 cubrió preparar su PR; no habilita deploy.

## Revalidación y preparación fast-track — 2026-10-14T16:49Z

- `origin/main` permanece en `f604a0af1669cc0903859c7271b1da1e3f29cea9`.
- La CI post-merge de `main`, run `38597025350`, concluyó `success` para ese
  SHA. La CI del PR #595 sigue `in_progress` en el head
  `0d3396afe8c48bd38e26db43d147c09a014dd96f`; Vercel Preview y Vercel están
  en `pass`. No se considera el PR listo para merge mientras quede el check
  `Tipos y pruebas` pendiente.
- El collector se volvió a ejecutar a las `2026-10-14T16:46:11.962Z` contra
  el SHA objetivo: `INCOMPLETE`, `readOnly=true`, `productionWrites=false`,
  `collectionErrors=[]`. Siguen observándose 104/104 Functions `ACTIVE` en
  Node 22, las rutas Bodega del alcance presentes y el hash antiguo de
  `registrarCompraOperativaV1`. Vercel todavía no reporta una publicación del
  SHA objetivo. Firestore Rules permanece en `MISMATCH`; Storage conserva hash
  coincidente, pero falta atestación independiente del release.
- La última lectura de recuperación mantiene PITR deshabilitado y un schedule
  diario de 35 días. Un backup `READY` con snapshot
  `2026-10-14T08:20:19.614951Z` se está restaurando, por la política aceptada
  en ADR-SAAS-031, únicamente a una base aislada del mismo proyecto y región;
  la operación figura `PROCESSING` al 30 %. El origen `(default)` no se toca,
  no hay cutover y recovery no es PASS hasta ejecutar el verificador canónico.
- Validaciones locales ejecutadas desde `main @ f604a0a`, sin acceso a datos
  productivos: Firestore Rules Emulator `45/45`, Storage Rules Emulator
  `7/7` y pruebas del contrato de recovery `14/14`. Estas pruebas respaldan
  la cobertura de código, pero no reemplazan las atestaciones independientes
  de Rules, Storage, smoke ni recuperación productiva requeridas por el
  collector.

### Paquete operativo ya preparado

La preparación se apoya en documentos y pruebas existentes; no crea un
tenant, no inicia el Trial y no habilita escrituras comerciales:

| Artefacto | Referencia | Estado / límite |
|---|---|---|
| Checklist de release y transición | `docs/goals/G-SAAS-02-TRIAL-OPERATIONS.md`; `scripts/g-saas-02/trial-transition-preflight.ts` | Procedimiento y preflight read-only existentes; aún no autoriza ejecutar comandos ni alta real. |
| Matriz Rules y aislamiento | `docs/goals/evidence/G-SAAS-02-E2-2-GATE-I-RULES-COMPATIBILITY-MATRIX-2026-10-14.md`; suite `firestore-rules/run-tests.ts` | 45/45 Emulator. El corte productivo sigue bloqueado hasta reconciliar el writer DIAN y aprobar una migración/corte seguro. |
| Validación Bodega MVP-1 | `npm run e2e:bodega-u4-u5`, `npm run e2e:bodega-agenda`, `npm run test:bodega-ui` | Runners/scripts existentes; su resultado local o de staging no es un smoke productivo autenticado. |
| Smoke autenticado | `docs/goals/evidence/G-SAAS-02-SMOKE-OBSERVATION-2026-08-15.md` | Plan mínimo existente; falta canal de sesión productiva autorizado y atestación tenant-safe para el release publicado. No usar fixture/staging como sustituto. |
| Rollback y recuperación | `docs/goals/G-SAAS-02-TRIAL-OPERATIONS.md`; `docs/goals/evidence/G-SAAS-02-RECOVERY-OBSERVATION-2026-08-15.md` | Rollback de Rules no es un simple revert porque reabriría escrituras directas; restore actual aislado pendiente de verificación. No activar PITR. |
| Onboarding y aceptación | `docs/goals/G-SAAS-02-TRIAL-OPERATIONS.md` | Oferta de 1.600.000 COP está aprobada internamente, pero no hay tenant ni Trial de Diana. La fecha prevista 13-oct-2026 ya pasó y requiere reprogramación explícita antes del alta; no se infiere un inicio. |

## Estado vigente

Gate I continúa `INCOMPLETE`. Los resultados locales y la restauración aislada
permiten avanzar la preparación, pero aún faltan el corte compatible de
Functions/Rules, el release web identificable, el smoke autenticado
independiente y la autorización operativa del tenant.

## Verificación final de recovery y nueva lectura — 2026-10-14T16:53Z

- La operación de restore aislado terminó `SUCCESSFUL` en
  `gsaas02-recovery-20261014`, región `southamerica-east1`. El verificador
  canónico emitió `VERIFIED` a las `16:52:07Z`: destino aislado, huella de los
  documentos mínimos coincidente, `RPO=8.307 h` (objetivo `≤24 h`) y
  `RTO=0.220 h` (objetivo `≤4 h`). La verificación hizo solo lecturas;
  `sourceUntouched=true`, `applicationCutover=false`. Se conservó el resultado
  JSON en el artefacto local de recovery; el destino aislado no se conectó a la
  aplicación ni se usó para restaurar `(default)`.
- Nueva lectura del collector a las `16:53:05Z` con token de operador
  estrictamente en memoria: `INCOMPLETE`, `readOnly=true`,
  `productionWrites=false`, `collectionErrors=[]`. CI de `main` continúa
  `PASS`; Functions 104/104 activas; Firestore Rules `MISMATCH`; Storage
  `PASS`; Vercel para el SHA objetivo `FOLLOW_UP`; smoke `MISSING`. La sección
  automática de atestaciones externas del collector sigue marcando recovery
  `MISSING` porque su entrada `--recovery-ref` solo declara referencias y no
  admite importar la verificación; el artefacto independiente, en cambio,
  sí está `VERIFIED`.
- Agregaciones read-only de Firestore, sin retornar documentos ni IDs:
  empresas en lifecycle `trial`/`activa` = `2`; ventas con
  `dian.emitidoEn != null` = `0`. Esto reduce el riesgo de que Rules corte
  una emisión DIAN ya persistida, pero no demuestra que ninguno de los dos
  tenants necesite emitir DIAN en adelante. Se mantiene el corte bloqueado
  hasta confirmar el impacto con los responsables de los tenants activos o
  resolver el writer por autoridad server-side bajo alcance aprobado.
- La suite local de agenda Bodega terminó `8/8`; Rules `45/45`, Storage
  `7/7` y recovery `14/14`. El runner local `e2e:bodega-u4-u5` no llegó a
  iniciar emuladores por una dependencia TypeScript no instalada en ese
  checkout; no tocó servicios remotos. La CI completa de `main` en el mismo
  SHA terminó `success`; por ello no se atribuye a ese fallo local un fallo
  del producto ni se reporta ese runner como PASS local.

La restauración independiente queda `PASS`; Gate I sigue `INCOMPLETE` por los
bloqueos de Functions legacy, Rules, Vercel y smoke productivo. No se hizo
deploy, alta de tenant, escritura comercial, cambio de Rules, IAM, Secrets,
PITR ni cutover.

### Reconciliación fiscal agregada — 2026-10-14T16:57Z

Se amplió la verificación sin mostrar ni guardar identificadores o valores
fiscales: de las 2 empresas `trial`/`activa`, se observaron 2 configuraciones;
los campos enmascarados de readiness se evaluaron solo en memoria. Ninguna
tiene completa la identidad fiscal y dirección mínima de readiness, y el
conteo de ventas con `dian.emitidoEn` continúa en `0`. Esto acredita que,
al momento de la consulta, no hay un tenant activo listo para emitir DIAN ni
una emisión DIAN persistida que el corte vaya a interrumpir. No decide si esos
clientes esperan habilitar DIAN luego. La futura emisión seguirá bloqueada por
el writer cliente hasta una solución server-side aprobada; antes del deploy
global de Rules falta confirmar que esa limitación es compatible con las
operaciones previstas de ambos tenants activos. No se leyeron ni publicaron
razón social, NIT, IDs de tenant ni documentos de venta.
