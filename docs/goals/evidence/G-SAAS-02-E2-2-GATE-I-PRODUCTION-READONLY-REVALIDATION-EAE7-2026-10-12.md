# G-SAAS-02 / M2 / E2.2 — Gate I: revalidación read-only de producción contra `main @ eae7db5` (2026-10-12)

## Dictamen

`INCOMPLETE` — Gate I sigue bloqueado. La colección automatizada fue de solo
lectura, no hizo escrituras de producción y no autoriza despliegues, altas,
ofertas, Trials ni cambios de datos.

## Identidad y método

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **Proyecto consultado:** `micafe-pos` (producción).
- **SHA objetivo y `origin/main`:**
  `eae7db540f420c4932794eefb0421ab1e6b263a4`.
- **Hora de observación:** `2026-10-12T11:36:56.685Z`.
- **Colector:** `scripts/g-saas-02/release-evidence.ts` en la rama actualizada
  de PR #563, con `--project micafe-pos --repo Glemynart/micafe-pos --sha
  eae7db540f420c4932794eefb0421ab1e6b263a4`.
- **Resultado:** `INCOMPLETE`; `collectionErrors = []`; `readOnly = true` y
  `productionWrites = false`.
- **Límites:** se consultaron GitHub Actions/status, Firebase Rules API,
  inventario de Functions y metadatos de Firestore/backups. No se invocaron
  Functions, no se leyeron documentos comerciales, no se cambiaron Rules,
  Functions, IAM, Secrets ni Vercel, y no se escribieron datos.

## Hallazgos observados

| Superficie | Evidencia read-only a la hora de observación | Consecuencia |
|---|---|---|
| CI | El run `38242586484` para `eae7db5` estaba `in_progress`; no había aún un run exitoso y completado para el SHA. | El candidato aún no tenía CI post-merge completa. |
| Vercel | No se observó un estado Vercel exitoso asociado al SHA objetivo en el status de GitHub. | No se acredita que la aplicación servida corresponda al candidato. Este resultado no identifica por sí solo cuál despliegue está actualmente en producción. |
| Cloud Functions | 80/80 Functions activas, runtime `nodejs22`; 6 hashes de despliegue diferentes, con inventario individual registrado por el colector. Está presente `registrarCompraOperativaV1`; no aparece `registrarCompraBodegaV1`. | No se declara paridad total de código con el candidato. La frontera canónica de compra Bodega aún no está observada como desplegada en producción. No se invocó la callable legacy. |
| Firestore Rules | Release `projects/micafe-pos/releases/cloud.firestore`, ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, `updateTime=2026-08-15T04:20:46.318849Z`. SHA-256 normalizado local `69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`; SHA remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. | `MISMATCH`; bloquea Gate I hasta plan de reconciliación y verificación aprobados. |
| Storage Rules | Release `projects/micafe-pos/releases/firebase.storage/micafe-pos.firebasestorage.app`; SHA local y remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`; `updateTime=2026-08-14T01:09:03.643850Z`. | Paridad observada; falta la atestación independiente del release integral. |
| Firestore recovery | PITR deshabilitado; 1 backup schedule, 35 backups, ubicación `southamerica-east1`. | Hay un punto de recuperación observado, pero no una atestación de restore/rollback aislado vigente para el candidato y alta propuestos. |
| Smoke y attestations | Smoke independiente `MISSING`; recuperación independiente `MISSING`; colección sin errores. | Gate I permanece `INCOMPLETE`; el backup existente no reemplaza una prueba de restauración. |

## Decisión y siguiente paso

La consulta confirma que los hallazgos de Rules observados antes siguen
vigentes contra el SHA actual `eae7db5`. Además, el inventario de producción
no expone la callable Bodega `registrarCompraBodegaV1` y todavía incluye la
callable legacy. El trabajo de este release sigue siendo preparación: primero
deben integrarse y validarse los PR de código abiertos, luego reconciliar el
release con un plan aprobado, acreditar smoke y restauración aislada contra el
SHA candidato y repetir la verificación. No se autoriza ni ejecuta aquí ningún
despliegue o alta real.
