# G-SAAS-02 / M2 / E2.2 — Gate I: revalidación read-only de producción contra `main @ d2bb06e` (2026-10-12)

## Dictamen

`INCOMPLETE` — Gate I permanece bloqueado. Esta observación es read-only; no
autoriza ni ejecuta despliegues, altas, cambios de Rules, ofertas, Trials o
escrituras de datos.

## Identidad y método

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **Proyecto consultado:** `micafe-pos` (producción).
- **SHA objetivo y `origin/main`:**
  `d2bb06e49f3d46b99365aa3553e288ed76463353`.
- **Hora de observación:** collector `2026-10-12T11:48:36.476Z`; Vercel CLI
  `2026-10-12T11:48:42.142Z`.
- **Colector:** `scripts/g-saas-02/release-evidence.ts` en la rama actualizada
  del PR #563, con el proyecto/commit explícitos.
- **Resultado del collector:** `INCOMPLETE`; `collectionErrors=[]`,
  `readOnly=true`, `productionWrites=false`.
- **Límites:** se leyeron status de CI/GitHub, inventario de Functions,
  releases/rulesets, estado de Firestore/backups y metadatos del deployment de
  Vercel. No se invocaron Functions ni se leyeron documentos comerciales. No se
  cambiaron Rules, Functions, IAM, Secrets, Auth, Vercel, tenants o datos.

## Hallazgos observados

| Superficie | Evidencia | Resultado para Gate I |
|---|---|---|
| CI | El run `38244892509` para el SHA objetivo estaba `in_progress`; todavía no existía una ejecución CI exitosa y completada para ese commit. | Sigue `FOLLOW_UP`; el SHA candidato aún no está certificado post-merge. |
| Vercel | GitHub no tenía estado Vercel exitoso para `d2bb06e`. `vercel list cafeatrato --environment production --limit 1` identificó el último deployment `READY` en el alias `cafeatrato-git-main-glemynarts-projects.vercel.app`, URL `cafeatrato-2mgbt0pse-glemynarts-projects.vercel.app`, SHA `1c2f155653536b1fd8e1925db931e2354fa41f7d`, creado `2026-10-06T14:52:13.319Z`. | `BLOCKED`: producción sirve un SHA anterior al candidato. |
| Cloud Functions | 80/80 activas en `nodejs22`, seis hashes desplegados. Está presente `registrarCompraOperativaV1`; `registrarCompraBodegaV1` no aparece en el inventario observado. | No se declara paridad total con el candidato; la frontera canónica Bodega no está observada como desplegada. No se invocó la callable legacy. |
| Firestore Rules | Release `projects/micafe-pos/releases/cloud.firestore`, ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, actualizado `2026-08-15T04:20:46.318849Z`. SHA-256 local `69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`; remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. | `MISMATCH`; bloquea Gate I. |
| Storage Rules | Hash local y remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`, actualizado `2026-08-14T01:09:03.643850Z`. | Paridad observada; falta atestación del release integral. |
| Recuperación | PITR deshabilitado; un schedule, 35 backups, ubicación `southamerica-east1`. | Existe un punto de recuperación, pero falta restauración/rollback aislado verificado para el candidato. |
| Smoke / attestation | Smoke independiente `MISSING`; recovery independiente `MISSING`; no hubo errores de colección. | `INCOMPLETE`; Gate I no puede declararse PASS. |

## Conclusión

PR #564 quedó integrado en `main` después de la observación anterior; esta
revalidación ya toma como candidato su merge SHA `d2bb06e`. Rules productivas
siguen divergentes y Vercel sirve un build del 6 de octubre. El inventario
productivo todavía no muestra `registrarCompraBodegaV1`. Antes de entregar al
cliente se necesita CI completa del candidato, release plan aprobado, despliegue
controlado con verificación, smoke autenticado sintético y evidencia de restore
aislado. No se desplegó ni escribió en producción.
