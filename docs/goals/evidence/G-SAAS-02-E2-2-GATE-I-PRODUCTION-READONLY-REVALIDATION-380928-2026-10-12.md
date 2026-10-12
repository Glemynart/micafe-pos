# G-SAAS-02 / M2 / E2.2 — Gate I: revalidación read-only de producción en `main @ 380928b` (2026-10-12)

## Dictamen

`INCOMPLETE` — Gate I sigue bloqueado para release y tenant real. La CI está
verde y las 80 Functions observadas están activas en Node.js 22, pero el
deployment productivo más reciente que expone metadatos Git es del 6-oct y
sirve `main @ 1c2f155`, 365 commits detrás del `main @ 380928b` objetivo.
Firestore Rules no coincide con `main`, el codebase Bodega aún no está
desplegado, hay cuatro colisiones de IDs entre Functions Bodega y producción,
y faltan smoke y restore independientes. Esta lectura no autoriza deploy, alta
ni escritura productiva.

## Identidad y método

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **Proyecto productivo consultado:** `micafe-pos`.
- **`origin/main` y SHA objetivo:** `380928bf5841e3b338cfc6b0d2f00749e551d2b4`.
- **Hora del colector:** `2026-10-12T17:38:55.281Z`.
- **Relectura read-only de deployment Vercel:** `2026-10-12T17:57:24Z`.
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
| Vercel asociado al SHA | `vercel ls cafeatrato --environment production --json --limit 100` devuelve como deployment productivo más reciente `cafeatrato-2mgbt0pse-glemynarts-projects.vercel.app`, `READY`, creado `2026-10-06T14:52:13Z`. Sus metadatos Git identifican `main` en `1c2f155653536b1fd8e1925db931e2354fa41f7d` (merge de #460). `git merge-base --is-ancestor` confirma que ese SHA es ancestro del objetivo `380928b`; el rango contiene 365 commits posteriores. `vercel inspect --json` no expone `gitSource`, pero el listado sí conserva `meta.githubCommitSha`. | `BLOCKED`: producción sirve una revisión antigua, no el `main` certificado actual |
| Cloud Functions | `firebase functions:list --project micafe-pos --json`: 80/80 `ACTIVE`, todas `nodejs22`, región `us-central1`; las 80 llevan codebase remoto `saas-auth`. Está `registrarCompraOperativaV1`; no está `registrarCompraBodegaV1`. | Falta despliegue/paridad Bodega |
| Colisión de nombres | Comparación read-only de exports actuales Bodega con IDs remotos: un conflicto en `saas-bodega` y tres en `saas-bodega-operations`, todos activos bajo `saas-auth` en `us-central1`. La unicidad regional impide tratar el campo `codebase` como namespace. | `BLOCKED`: requiere decisión de arquitectura |
| Firestore Rules | Ruleset remoto `d5e205db-0ab4-4db1-b5ec-1534bee39d35`. SHA-256 local `69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`; remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. | `MISMATCH` |
| Storage Rules | SHA-256 local/remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`. | `PASS` |
| Smoke | No hay atestación independiente de smoke productivo sintético asociada al candidato. | `MISSING` |
| Recuperación | PITR deshabilitado; se observan 1 backup schedule y 35 backups en `southamerica-east1`, pero no hay atestación independiente de restore vigente para el candidato. | Punto observado; evidencia de restore `MISSING` |

### Alcance del drift de Firestore Rules

En una segunda lectura read-only se obtuvo el contenido del ruleset remoto
`d5e205db-0ab4-4db1-b5ec-1534bee39d35` y se comparó en memoria con
`firestore.rules` del SHA objetivo. El archivo remoto tiene 360 líneas y el
local 422; la comparación ordenada registra 82 líneas locales y 20 remotas
distintas. Esto es un drift amplio, no una diferencia aislada de compras.

Los principales cambios de comportamiento visibles son:

| Superficie | Rules remotas observadas | `main @ 380928b` local | Impacto para el plan |
|---|---|---|---|
| Categorías Bodega | Admin puede crear, actualizar y eliminar directamente. | Esas mutaciones directas se niegan cuando el tenant es Bodega. | Requiere preservar el comportamiento de otros verticales y validar que Bodega use las callables. |
| Productos, presentaciones y clientes | Lecturas de cliente más amplias para vendedores; no existe la nueva regla de presentaciones. | Restringe lecturas de vendedor y agrega lectura de presentaciones solo para roles no vendedores. | Puede cambiar pantallas existentes y requiere compatibilidad del cliente desplegado. |
| Ventas | Permite una actualización cliente acotada de transición operativa. | Niega actualización directa y exige efectos server-authoritative. | Debe certificarse para los verticales y clientes productivos antes de desplegar. |
| Compras | Admin puede crear y eliminar directamente. | Niega esas escrituras para Bodega, no globalmente. | La callable legacy con Admin SDK es un control separado; Rules no la bloquean. |
| Ledger y perfiles | Lectura de ledger a autenticados y lectura de perfil autenticado. | Niega ledger a vendedores y limita perfiles a lectura propia. | Son cambios sensibles de autorización que no deben desplegarse solo para cerrar Gate I Bodega. |
| Señales Bodega y bindings SaaS | No están estas rutas/cierres en el ruleset remoto. | Agrega señales tenant-aware y deny-by-default para bindings. | Exige atestación de aislamiento y compatibilidad de toda superficie que consuma estas rutas. |

La tabla resume diferencias de fuente; no equivale a certificar el impacto en
cada vertical productivo. Por esa razón no es seguro desplegar
`firestore.rules` de `main` a producción como una simple reconciliación de
hash. El plan de Gate I debe enumerar y validar consumidores afectados,
conservar sus contratos o separar el cambio en Rules acotadas, y definir
rollback antes de cualquier mutación.

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
`380928b`; la relectura de Vercel precisa que producción continúa en el ancestro
`1c2f155` de 2026-10-06, con 365 commits entre ambos SHAs. No es evidencia de
que el candidato actual esté desplegado ni mejora el estado del release.
ADR-SAAS-074 recomienda evitar las cuatro colisiones con IDs Bodega únicos,
conforme a la dirección indicada por el responsable el 2026-10-12; esa
preferencia no es aceptación formal del ADR. ADR-SAAS-075 propone resolver la
callable legacy genérica, que actualmente no restringe el vertical Bodega, y su
decisión sigue pendiente. Hasta aceptar las decisiones no se implementan
cambios de endpoints ni de autoridad.

Después de las decisiones, Gate I sigue requiriendo: resolver por separado la
callable legacy de compras conforme a ADR-SAAS-072/075; preparar y verificar
un artifact de producción basado en el código aprobado después de cerrar los
gates previos; tratar el drift amplio de Rules con un plan compatible por
vertical y rollback probado; obtener smoke y restore independientes; y
resolver ADR-SAAS-073 antes del onboarding real. No se creó ni configuró tenant,
Trial, oferta ni catálogo de Distribuidora Las Jiménez.
