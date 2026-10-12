# G-SAAS-02 / M2 / E2.2 — Gate I: revalidación read-only de producción en `main @ 380928b` (2026-10-12)

## Dictamen

`INCOMPLETE` — Gate I sigue bloqueado para release y tenant real. La CI está
verde y las 80 Functions observadas están activas en Node.js 22, pero no se
demostró que Vercel sirva el SHA candidato, Firestore Rules no coincide con
`main`, el codebase Bodega aún no está desplegado, hay cuatro colisiones de IDs
entre Functions Bodega y producción, y faltan smoke y restore independientes.
Esta lectura no autoriza deploy, alta ni escritura productiva.

## Identidad y método

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **Proyecto productivo consultado:** `micafe-pos`.
- **`origin/main` y SHA objetivo:** `380928bf5841e3b338cfc6b0d2f00749e551d2b4`.
- **Hora del colector:** `2026-10-12T17:38:55.281Z`.
- **Colector:** `scripts/g-saas-02/release-evidence.ts`, con `--project`,
  `--repo` y `--sha` explícitos, sin `--out`.
- **Resultado:** `INCOMPLETE`; `collectionErrors=[]`, `readOnly=true`,
  `productionWrites=false`.
- **CI del SHA objetivo:** run `38282136197`, `completed/success`.
- **Límites:** GitHub, Vercel, inventario de Functions, Rules publicadas y
  metadatos de recuperación se consultaron en modo lectura. No se invocaron
  callables ni se leyeron documentos de clientes; no hubo deploy, cambios de
  Rules/IAM/Secrets, tenant, Auth o datos.

## Evidencia observada

| Superficie | Observación | Resultado |
|---|---|---|
| CI | Run `38282136197`, `headSha=380928bf5841e3b338cfc6b0d2f00749e551d2b4`, `success`. | `PASS` |
| Vercel asociado al SHA | GitHub no tiene estado Vercel para el SHA objetivo. `vercel list cafeatrato --environment production` muestra como despliegue más reciente `cafeatrato-2mgbt0pse-glemynarts-projects.vercel.app`, `READY`, target `production`; `vercel inspect --json` devuelve `gitSource=null`. | `FOLLOW_UP`: identidad del artifact no probada |
| Cloud Functions | `firebase functions:list --project micafe-pos --json`: 80/80 `ACTIVE`, todas `nodejs22`, región `us-central1`; las 80 llevan codebase remoto `saas-auth`. Está `registrarCompraOperativaV1`; no está `registrarCompraBodegaV1`. | Falta despliegue/paridad Bodega |
| Colisión de nombres | Comparación read-only de exports actuales Bodega con IDs remotos: un conflicto en `saas-bodega` y tres en `saas-bodega-operations`, todos activos bajo `saas-auth` en `us-central1`. La unicidad regional impide tratar el campo `codebase` como namespace. | `BLOCKED`: requiere decisión de arquitectura |
| Firestore Rules | Ruleset remoto `d5e205db-0ab4-4db1-b5ec-1534bee39d35`. SHA-256 local `69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`; remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. | `MISMATCH` |
| Storage Rules | SHA-256 local/remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`. | `PASS` |
| Smoke | No hay atestación independiente de smoke productivo sintético asociada al candidato. | `MISSING` |
| Recuperación | PITR deshabilitado; se observan 1 backup schedule y 35 backups en `southamerica-east1`, pero no hay atestación independiente de restore vigente para el candidato. | Punto observado; evidencia de restore `MISSING` |

Los IDs duplicados son `crearArticuloInventarioV1`,
`abrirTurnoOperativoV1`, `actualizarArticuloInventarioV1` y
`cerrarTurnoOperativoV1`. El inventario remoto los atribuye a `saas-auth`;
los exports actuales los atribuyen a los codebases Bodega. Firebase documenta
que los nombres deben ser únicos por proyecto/región, mientras que el codebase
sirve para organizar el despliegue, no para separar nombres.

Además, la Function legacy `registrarCompraOperativaV1` está activa en
producción. Su wrapper actual deriva tenant/actor/rol y llama el núcleo genérico
sin ejecutar la política específica `exigirCompraBodegaHabilitada` de la ruta
`registrarCompraBodegaV1`. No se invocó en producción. ADR-SAAS-072 requiere
resolver esta exposición antes de considerar seguro el corte de Rules para
Bodega.

## Conclusión y siguiente paso

La revalidación actualiza la evidencia anterior de `eff193b` al SHA
`380928b`; no mejora el estado del release. Se propone ADR-SAAS-074 para
decidir cómo evitar las cuatro colisiones sin tocar `saas-auth`. La ADR sigue
`PROPUESTA`; hasta su aceptación no se implementan cambios de endpoints.

Después de la decisión, Gate I sigue requiriendo: resolver por separado la
callable legacy de compras conforme a ADR-SAAS-072; demostrar el artifact
exacto de Vercel; reconciliar Rules de producción con un plan acotado y
rollback probado; obtener smoke y restore independientes; y resolver ADR-
SAAS-073 antes del onboarding real. No se creó ni configuró tenant, Trial,
oferta ni catálogo de Distribuidora Las Jiménez.
