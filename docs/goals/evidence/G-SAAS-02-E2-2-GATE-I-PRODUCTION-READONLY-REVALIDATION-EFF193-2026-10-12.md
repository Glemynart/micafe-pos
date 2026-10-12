# G-SAAS-02 / M2 / E2.2 — Gate I: revalidación read-only contra `main @ eff193b` (2026-10-12)

## Dictamen

`INCOMPLETE` — Gate I permanece bloqueado. El SHA candidato tiene CI post-merge exitosa y las Functions/Storage observadas están disponibles, pero producción no está reconciliada con `main`: Firestore Rules difieren, no hay estado Vercel exitoso asociado al SHA, las operaciones Bodega nuevas no están desplegadas y faltan atestaciones independientes de smoke y recuperación. Esta evidencia no autoriza despliegues, altas ni escrituras.

## Identidad y método

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **Proyecto consultado:** `micafe-pos` (producción).
- **SHA objetivo y `origin/main`:** `eff193bd15c6e68e031c820ca6b47dc2ef119198`.
- **Hora del colector:** `2026-10-12T16:38:34.620Z`.
- **Colector:** `scripts/g-saas-02/release-evidence.ts`, con proyecto y SHA explícitos.
- **Resultado:** `INCOMPLETE`; `collectionErrors=[]`, `readOnly=true`, `productionWrites=false`.
- **CI post-merge:** run `38275619597`, mismo SHA, `completed/success`.
- **Límites:** se leyeron CI, estados de Vercel asociados al commit, Cloud Functions, Firestore/Storage Rules y metadatos de recuperación. `vercel list`, `vercel inspect` y el colector se ejecutaron en modo de lectura. No se invocaron Functions, no se leyeron documentos de clientes y no se modificaron Rules, Functions, IAM, Secrets, Auth, Vercel, tenants ni datos.

## Hallazgos observados

| Superficie | Evidencia observada | Resultado |
|---|---|---|
| CI | `38275619597`, `headSha=eff193bd15c6e68e031c820ca6b47dc2ef119198`, `completed/success`. | `PASS`. |
| Vercel para el SHA objetivo | El colector no encontró un estado Vercel exitoso asociado a `eff193b`. `vercel list cafeatrato --environment production` mostró como despliegue más reciente `cafeatrato-2mgbt0pse-glemynarts-projects.vercel.app`, `READY`, creado `2026-10-06T09:52:13.319-05:00`; `vercel inspect --json` confirmó los alias de producción, pero devolvió `gitSource=null`, por lo que esta lectura no prueba el SHA servido. | `FOLLOW_UP`; el deploy no queda certificado para el candidato. |
| Cloud Functions | 80/80 activas; todas usan `nodejs22`. `registrarCompraOperativaV1` figura en el inventario y `registrarCompraBodegaV1` no aparece. Los seis hashes de despliegue fueron observados y reconciliados por Function. | Falta paridad de las operaciones Bodega con el candidato. |
| Firestore Rules | Release `projects/micafe-pos/releases/cloud.firestore`, ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, actualizado `2026-08-15T04:20:46.318849Z`. SHA-256 local `69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`; remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. | `MISMATCH`; bloquea Gate I. |
| Storage Rules | SHA-256 local/remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`, actualizado `2026-08-14T01:09:03.643850Z`. | Paridad observada. |
| Smoke | No hay atestación independiente de smoke productivo sintético vinculada al SHA candidato. | `MISSING`. |
| Recuperación | PITR deshabilitado; un backup schedule y 35 backups observados en `southamerica-east1`. | Existe un mecanismo/punto de recuperación, pero falta evidencia independiente de restore/rollback vigente para el release candidato. |

## Conclusión y siguientes condiciones

El merge #571 fue documental y su CI post-merge terminó correctamente; no alteró el runtime. Este recheck reemplaza la observación objetivo anterior de `main @ 1ec3cbe` para el SHA actual, pero confirma el mismo bloqueo: no se puede certificar el release productivo ni preparar el tenant real mientras Vercel/Functions/Rules no estén reconciliadas y falten smoke y recuperación independientes.

Gate I también mantiene una decisión arquitectónica pendiente: `ADR-SAAS-073` sigue `PROPUESTO`. La aprobación previa autoriza preparar la propuesta, no implementarla. No se creó el tenant real ni se materializaron plan, Trial o catálogo. Los datos legales y de contacto reales siguen bajo responsabilidad de Diana; no se inventaron ni se consultaron.

No ejecutar un deploy para resolver estas diferencias por inferencia. El siguiente paso habilitado es definir, dentro del Goal y sus gates de release, el corte mínimo con preflight exacto, respaldo/rollback verificable, atestación de smoke y sincronización de Rules; la decisión del ADR-073 debe seguir su ciclo de aprobación antes de implementar el onboarding.
