# G-SAAS-02 / M2 / E2.2 — Gate I: revalidación read-only contra `main @ 0936c21` (2026-10-12)

## Dictamen

`INCOMPLETE` — Gate I permanece bloqueado. Esta observación solo leyó metadatos de producción y no autoriza ni ejecuta cambios, despliegues, altas o escrituras.

## Identidad y método

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **Proyecto consultado:** `micafe-pos` (producción).
- **SHA objetivo y `origin/main`:** `0936c211fad0b7f22417b5db28ee49b55e32f3bd`.
- **Hora del colector:** `2026-10-12T13:35:29.928Z`.
- **Colector:** `scripts/g-saas-02/release-evidence.ts`, tras integrar PR #568, con proyecto y SHA explícitos.
- **Resultado:** `INCOMPLETE`; `collectionErrors=[]`, `readOnly=true`, `productionWrites=false`.
- **Límites:** se consultaron CI/estados GitHub, Functions, Firebase Rules/Storage y metadatos de recuperación. Vercel se consultó con `vercel ls` y `vercel inspect`, en modo solo lectura. No se invocaron Functions, no se leyeron documentos de clientes y no se cambiaron Rules, Functions, IAM, Secrets, Auth, Vercel, tenants ni datos.

## Hallazgos observados

| Superficie | Evidencia observada | Resultado |
|---|---|---|
| CI | La ejecución post-merge `38256656665` corresponde al SHA objetivo; estaba `in_progress` al momento de la lectura. | `FOLLOW_UP`; aún no hay CI post-merge completada para el SHA actual. |
| Vercel | No hay estado exitoso asociado al SHA `0936c21`. La última deployment de producción observada está `READY` en `cafeatrato-2mgbt0pse-glemynarts-projects.vercel.app`, creada el `2026-10-06T14:52:13.319Z`, y sirve el SHA `1c2f155653536b1fd8e1925db931e2354fa41f7d`. | `FOLLOW_UP`; producción sirve un SHA antiguo frente al candidato. |
| Cloud Functions | 80/80 activas, runtime `nodejs22`, seis hashes desplegados reconciliados. Existe `registrarCompraOperativaV1`; no aparece `registrarCompraBodegaV1`. | No hay paridad observada de las operaciones Bodega con el candidato. |
| Firestore Rules | Release `projects/micafe-pos/releases/cloud.firestore`, ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, actualizado `2026-08-15T04:20:46.318849Z`. SHA-256 local `69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`; remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. | `MISMATCH`; bloquea Gate I. |
| Storage Rules | Hash local y remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`, actualizado `2026-08-14T01:09:03.643850Z`. | Paridad observada; falta atestación integral del release. |
| Recuperación | PITR deshabilitado; un schedule, 35 backups, ubicación `southamerica-east1`. | Hay backups, pero falta una restauración/rollback aislado vigente e independiente para el release candidato. |
| Smoke | No hay atestación independiente de smoke productivo sintético vinculada al SHA candidato. | `MISSING`. |

## Conclusión y siguiente gate

PR #567 y PR #568 son documentales; no cambiaron el runtime desplegado. PR #568 integra ADR-SAAS-073 con estado `PROPUESTO`, sin aceptar la decisión ni materializar un tenant. La lectura confirma que producción sigue en el SHA `1c2f155` y conserva los bloqueos previos. No se corrige el `MISMATCH` con un deploy improvisado: primero se requiere CI completa del candidato, plan exacto de release y rollback, gates y autorización operativa correspondientes; después se deberá verificar el deploy, ejecutar smoke sintético autenticado y demostrar recovery aislado. Gate I no está aprobado y no se inició el tenant real.

La prueba remota de staging que falta para Gate D es distinta: demostrar que una escritura directa de compra Bodega se rechaza y que la ruta canónica funciona. Esta evidencia no la reemplaza.
