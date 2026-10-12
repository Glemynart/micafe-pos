# G-SAAS-02 / M2 / E2.2 — Gate I: revalidación read-only contra `main @ 1ec3cbe` (2026-10-12)

## Dictamen

`INCOMPLETE` — Gate I sigue bloqueado. La revalidación confirma el estado de producción frente al merge SHA actual; no autoriza ni ejecuta despliegues, altas o escrituras.

## Identidad y método

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **Proyecto consultado:** `micafe-pos` (producción).
- **SHA objetivo y `origin/main`:** `1ec3cbe2c5bb44198f2ec4df15e50bbaafd2735b`.
- **Hora del colector:** `2026-10-12T14:28:05.054Z`.
- **Colector:** `scripts/g-saas-02/release-evidence.ts`, con proyecto y SHA explícitos.
- **Resultado:** `INCOMPLETE`; `collectionErrors=[]`, `readOnly=true`, `productionWrites=false`.
- **CI post-merge:** run `38260069144`, mismo SHA, `completed/success`.
- **Límites:** el colector consultó CI, estados de Vercel asociados al commit, Functions, Firebase Rules/Storage y metadatos de recuperación. `vercel list cafeatrato --environment production` y `firebase functions:list --project micafe-pos` se ejecutaron en modo de lectura. No se invocaron Functions, no se leyeron documentos de clientes y no se modificaron Rules, Functions, IAM, Secrets, Auth, Vercel, tenants ni datos.

## Hallazgos observados

| Superficie | Evidencia observada | Resultado |
|---|---|---|
| CI | `38260069144`, `headSha=1ec3cbe2c5bb44198f2ec4df15e50bbaafd2735b`, `completed/success`. | `PASS`. |
| Vercel para el SHA objetivo | El colector no encontró un estado Vercel exitoso asociado a `1ec3cbe`. La lista de despliegues de producción sigue encabezada por `cafeatrato-2mgbt0pse-glemynarts-projects.vercel.app`, estado `READY`, SHA `1c2f155653536b1fd8e1925db931e2354fa41f7d`, creado el `2026-10-06T14:52:13.319Z`. | `FOLLOW_UP`; producción sirve un SHA anterior al objetivo. |
| Cloud Functions | 80/80 activas, todas en `nodejs22`; `registrarCompraOperativaV1` aparece activa en `us-central1`; `registrarCompraBodegaV1` no aparece. Se reconciliaron seis hashes desplegados. | No hay paridad de operaciones Bodega con el candidato. |
| Firestore Rules | Release `projects/micafe-pos/releases/cloud.firestore`, ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, actualizado `2026-08-15T04:20:46.318849Z`. SHA-256 local `69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`; remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. | `MISMATCH`; bloquea Gate I. |
| Storage Rules | SHA-256 local/remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`, actualizado `2026-08-14T01:09:03.643850Z`. | Paridad observada; falta atestación integral del release. |
| Recuperación | PITR deshabilitado; un backup schedule, 35 backups, ubicación `southamerica-east1`. | Hay puntos de recuperación, pero no hay evidencia de un restore/rollback aislado e independiente vigente para el release candidato. |
| Smoke | No hay atestación independiente de smoke productivo sintético vinculada al SHA candidato. | `MISSING`. |

## Conclusión y siguiente gate

El merge #569 fue documental y su CI post-merge terminó correctamente; no cambió el runtime. La revalidación confirma que Gate I continúa `BLOCKED`: Vercel y Functions no sirven las operaciones Bodega del candidato, Firestore Rules divergen y faltan smoke/recovery independientes. No se corrigen esas diferencias con un deploy improvisado; se requiere un plan de release y rollback verificable y seguir los gates de despliegue. No se inició tenant real ni Trial.

Gate D de staging es otro pendiente: falta probar el rechazo remoto de escrituras directas de compras con una sesión admin de Bodega tenant-aware; la sesión integrada observada corresponde al vendedor y no sustituye esa prueba.
