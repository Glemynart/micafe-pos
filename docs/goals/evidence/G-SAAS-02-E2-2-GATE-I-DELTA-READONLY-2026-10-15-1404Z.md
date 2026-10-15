# G-SAAS-02 / M2 / E2.2 — Gate I: actualización read-only de bloqueos

**Observación inicial:** `2026-10-15T14:04:56Z` para Firebase/GitHub; consulta Vercel posterior durante la misma pasada.
**SHA objetivo:** `origin/main @ 88d3644a4763b7ca236c58235450c7a946a13dd4`.
**Resultado:** `INCOMPLETE`; esta evidencia no autoriza despliegues ni escrituras productivas.
**Hosting objetivo vigente:** Firebase App Hosting, conforme a
[`ADR-SAAS-083`](../../../ADR-SAAS-083-app-hosting-produccion.md). Vercel es
`NOT APPLICABLE TO CURRENT RELEASE` para publicación productiva.

## Deltas verificados

| Frente | Evidencia actual | Estado y criterio de cierre |
|---|---|---|
| CI de `main` | Run `38744738763`, SHA `88d3644a4763b7ca236c58235450c7a946a13dd4`, `completed/success`. | `PASS` para CI del SHA consultado; no demuestra publicación. |
| Firestore Rules producción | La release `cloud.firestore` apunta a `d5e205db-0ab4-4db1-b5ec-1534bee39d35`. Hash desplegado `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`; hash de `firestore.rules` del SHA objetivo `b8fb7ddd5370ddaa3784db4921b2bbbc71e51f285ffde912c3b0650ab1517fdf`. | `FAIL` de coincidencia, no prueba por sí sola un fallo de runtime. La matriz del 14-oct está desactualizada: PR #600 cambió la condición de `/compras` y añadió `/controles_release_compras`. El número exacto de divergencias efectivas requiere recalcularse contra esta fuente antes del corte. Cierre: matriz de paths actual, compatibilidad y tests revisados, controles/tenants afectados enumerados de forma autorizada, pausa efectiva y secuencia de corte aprobada. No desplegar Rules hasta entonces. |
| Storage Rules producción | Hash local y remoto coinciden (`fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`). | `PASS` para igualdad observada; no requiere cambio en este release. |
| Functions producción | Inventario `104/104 ACTIVE`, Node.js 22. `registrarCompraOperativaV1` conserva hash `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`; `registrarCompraBodegaV1` tiene hash `fa7f47c21b994a5ebccefded6e548e0f6b193c79`; `transicionarPausaComprasSaas` no aparece. | `FAIL` frente al artefacto requerido: el guard/autoridad de corte no está publicado. No se observó una excepción de ejecución. Cierre: preflight dirigido por codebase/Function, artefacto ligado al SHA, delta remoto revisado, deployment y hashes posteriores verificados. No desplegar codebases completos como sustituto. |
| Vercel producción (arquitectura anterior) | Históricamente se observó `dpl_4viR3AppP838CJjtUHYeBLo1W19C`, `READY`, con alias Vercel y SHA antiguo; uso previo 9,95/10 GB. | `NOT APPLICABLE TO CURRENT RELEASE` por decisión del administrador documentada en ADR-SAAS-083. Se conserva como historial; capacidad, aliases y SHA Vercel no bloquean App Hosting. Los checks Vercel Preview de PR son controles de CI separados. |
| Firebase App Hosting | Staging: backend `micafe-pos` en `micafe-pos-staging/us-central1`; rollout `build-2026-10-15-001` `SUCCEEDED`, build `READY`, tráfico 100%, fuente `a460f4d33be2ef08991fd0ed898c3e7e24c724b1`, Node 24, URI `micafe-pos--micafe-pos-staging.us-central1.hosted.app`, identidad runtime staging y siete nombres de variables staging. Proyecto productivo `micafe-pos`: `apphosting:backends:list` devolvió `[]`. | Staging `PASS` técnico en el alcance de rollout. Producción `BLOCKED / NOT EXECUTED`: no hay backend productivo; falta configurar/verificar entorno, cuenta IAM, URI y SHA. Next.js 16.4.1 sigue Preview en App Hosting; la aceptación anterior cubre solo staging y falta versión activa o aceptación explícita del riesgo para producción. |
| Controles y facultad de release | La callable y el Backoffice compatibles no están acreditados como publicados para la versión de producción. No hay evidencia nueva de que `RELEASE_COMPRAS_GOBERNAR` haya sido asignada a la identidad Edge. La verificación de controles/tenants sigue sin una consulta canónica read-only acreditada. | `BLOCKED`: primero se requiere interfaz/callable compatible y asignación por un operador distinto con `OPERADORES_GOBERNAR`; luego debe poder verificarse el alcance antes de inicializar/pausar. No inferir asignaciones ni leer directamente Firestore para eludir la autoridad. |
| Smoke | En staging existe evidencia limitada de sesión admin persistente y lectura seller. No se ejecutó smoke autenticado productivo. | Producción `NOT EXECUTED`; para cerrar Gate I falta identidad existente, tenant, rol/claims, rutas read-only y autorización documentados. El negativo cross-tenant A/B de staging permanece `NOT EXECUTED` y no bloquea el Trial inicial de Diana por decisión del administrador; sigue requerido para certificación de aislamiento. |
| Recovery y PITR | El restore aislado conserva su evidencia `PASS`; PITR deshabilitado es decisión aprobada. | `PASS` / decisión preservada. No repetir restore ni activar PITR sin evidencia nueva o autorización. |
| DIAN web | No se acredita una autoridad web server-side para emitir con Factus. | `BLOCKED` para certificación fiscal. No impide por sí sola el Trial no fiscal aceptado, pero no se puede presentar como capacidad disponible. |
| Trial de Diana y catálogo | La fecha confirmada es `2026-10-15`. En esta pasada no se creó tenant, usuario, credencial ni Trial; no se reconsultó si existe provisioning iniciado por otro actor. Las cuatro fotos del catálogo no equivalen a un archivo digital aprobado. | `NOT EXECUTED`. No importar productos/stock sin archivo digital aprobado. Provisionar solo después de demostrar las precondiciones técnicas y de seguridad aplicables; verificar acceso real antes de declarar entrega. |

## Relectura puntual de producción — 2026-10-15T14:22:34Z

El colector `release-evidence.ts` se ejecutó de nuevo contra el mismo SHA,
con `readOnly=true`, `productionWrites=false` y `collectionErrors=[]`.
`origin/main` y CI siguieron en `PASS`; no hay estado Vercel exitoso para el
SHA objetivo. El inventario de Functions seguía en `104/104 ACTIVE`, Node.js
22. Las Functions consultadas devolvieron:

- `registrarCompraOperativaV1`: `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0` (anterior al artefacto candidato).
- `registrarCompraBodegaV1`: `fa7f47c21b994a5ebccefded6e548e0f6b193c79`.
- `confirmarVentaVendedorBodegaV1`: `f41aa6f5340c363a107072b792409e13763bef0f`.
- `consultarCatalogoPresentacionesVendedorBodegaV1`: `fa7f47c21b994a5ebccefded6e548e0f6b193c79`.
- `transicionarPausaComprasSaas`: ausente del inventario.

La lectura autenticada de Rules confirmó que Firestore sigue en el ruleset
`d5e205db-0ab4-4db1-b5ec-1534bee39d35`, con hash desplegado
`c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`, distinto
del SHA de `firestore.rules` en `main`. Storage continúa coincidente. La
lectura App Hosting del 2026-10-15 confirmó el rollout de staging
`build-2026-10-15-001` `SUCCEEDED`, 100% de tráfico y fuente
`a460f4d33be2ef08991fd0ed898c3e7e24c724b1`. La lista App Hosting del proyecto
productivo `micafe-pos` devolvió `[]`; no hay backend productivo. El backend
staging confirma URI, Node 24, identidad runtime y siete nombres de variables,
sin registrar valores.

**Clasificación:** Firestore `FAIL` por mismatch de contenido, sin afirmar un
fallo runtime; Functions `FAIL` frente al paquete requerido (hash anterior y
callable de pausa ausente), sin prueba de excepción runtime; Vercel
`NOT APPLICABLE TO CURRENT RELEASE`; App Hosting productivo `BLOCKED` porque
no hay backend en `micafe-pos` y `NOT EXECUTED`; smoke productivo
`NOT EXECUTED`. El conteo semántico de paths no se infiere del hash:
la matriz previa sigue desactualizada hasta que se recalcule con el ruleset
remoto exacto y el SHA candidato.

## Efecto de PR #600 sobre la matriz anterior

El diff integrado de `firestore.rules` desde la base de la matriz del 14-oct
añade `comprasHabilitadasParaTenant()`, condiciona el alta/borrado directo de
`/compras` al control `ACTIVA` y deniega al cliente `/controles_release_compras`.
Por ello, la clasificación anterior no debe usarse como matriz vigente sin una
comparación semántica renovada. El ruleset remoto no cambió en esta observación.

## Límites de ejecución

Lecturas de CI, Functions, Rules, Vercel histórico y App Hosting únicamente. No hubo
deploy, cambio IAM/Secrets, lectura de documentos de negocio, inicialización o
transición de controles, smoke productivo, bootstrap, ni escrituras en Firebase.
La guía de corte y sus precondiciones siguen en
[`ADR-SAAS-081`](../../../ADR-SAAS-081-pausa-tecnica-compras-corte-rules.md).
