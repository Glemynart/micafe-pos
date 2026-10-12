# G-SAAS-02 / M2 / E2.2 — Gate I: revalidación read-only contra `main @ 01da6e1` (2026-10-12)

## Dictamen

`INCOMPLETE` — Gate I permanece bloqueado. Esta observación solo leyó metadatos de producción y no autoriza ni ejecuta cambios, despliegues, altas o escrituras.

## Identidad y método

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **Proyecto consultado:** `micafe-pos` (producción).
- **SHA objetivo y `origin/main`:** `01da6e18723496d207ec97484cc3419e89f19b3e`.
- **Hora del colector:** `2026-10-12T12:09:15.458Z`.
- **Colector:** `scripts/g-saas-02/release-evidence.ts`, tras integrar PR #563, con proyecto y SHA explícitos.
- **Resultado:** `INCOMPLETE`; `collectionErrors=[]`, `readOnly=true`, `productionWrites=false`.
- **Límites:** se consultaron CI/estados GitHub, Functions, Firebase Rules/Storage y metadatos de recuperación. Se consultó Vercel con `vercel list` de solo lectura. No se invocaron Functions, no se leyeron documentos de clientes y no se cambiaron Rules, Functions, IAM, Secrets, Auth, Vercel, tenants ni datos.

## Hallazgos observados

| Superficie | Evidencia observada | Resultado |
|---|---|---|
| CI | No existe una ejecución `CI` observada para el SHA exacto `01da6e1`; la CI del PR #563 pasó en `f54d5b5`, que no es el SHA del merge. El run post-merge #564 (`38244892509`) seguía `in_progress` para el SHA anterior `d2bb06e`. | `FOLLOW_UP`; no hay CI completada para el target actual. |
| Vercel | No hay estado Vercel exitoso asociado al SHA `01da6e1`. La última deployment `READY` de producción observada sigue en `cafeatrato-2mgbt0pse-glemynarts-projects.vercel.app`, SHA `1c2f155653536b1fd8e1925db931e2354fa41f7d`, creada el `2026-10-06T14:52:13.319Z`. | `FOLLOW_UP`; producción sirve un SHA antiguo frente al candidato. |
| Cloud Functions | 80/80 activas, runtime `nodejs22`, seis hashes desplegados. Existe `registrarCompraOperativaV1`; no aparece `registrarCompraBodegaV1`. | No hay paridad observada de las operaciones Bodega con el candidato. |
| Firestore Rules | Release `projects/micafe-pos/releases/cloud.firestore`, ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, actualizado `2026-08-15T04:20:46.318849Z`. SHA-256 local `69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`; remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. | `MISMATCH`; bloquea Gate I. |
| Storage Rules | Hash local y remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`, actualizado `2026-08-14T01:09:03.643850Z`. | Paridad observada; falta atestación integral del release. |
| Recuperación | PITR deshabilitado; un schedule, 35 backups, ubicación `southamerica-east1`. | Hay backups, pero falta una restauración/rollback aislado vigente e independiente para el release candidato. |
| Smoke | No hay atestación independiente de smoke productivo sintético vinculada al SHA candidato. | `MISSING`. |

## Conclusión y siguiente gate

PR #563 integró una corrección de lectura del colector; no cambió la aplicación, Functions ni Rules desplegadas. La lectura actual mantiene los bloqueos anteriores y el SHA de producción continúa en `1c2f155`. No se corrige el `MISMATCH` con un deploy improvisado: primero se requiere CI completa del candidato, plan exacto de release y rollback, gates y autorización operativa correspondientes; después se deberá verificar el deploy, ejecutar smoke sintético autenticado y demostrar recovery aislado. Gate I no está aprobado y no se inició el tenant real.

La prueba remota de staging que falta para Gate D es otra validación: demostrar que una escritura directa de compra Bodega es rechazada y que la ruta canónica funciona. Esta evidencia no la reemplaza.
