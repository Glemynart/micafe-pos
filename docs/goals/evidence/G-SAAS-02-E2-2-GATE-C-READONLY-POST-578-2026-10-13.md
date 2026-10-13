# Gate C — inventario y preflight staging posterior a PR #578

- **Relecturas remotas:** inventario y catálogo completos originales Functions `2026-10-13T02:32:00Z` / APIs `2026-10-13T02:12:55Z`; verificación posterior al dry-run, aproximadamente `2026-10-13T02:50Z` (UTC), confirmó 44 Functions activas/17 codebases, 53 APIs y cero de los 12 IDs nuevos.
- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2 — Provisioning y onboarding` / `E2.2 — Configuración inicial`
**Resultado:** `PREFLIGHT = PASS` únicamente para el changeset exacto de 12 creates documentado abajo. Gate D no se ha desplegado ni queda autorizado por este resultado.

## Alcance y separación de entornos

- Comprobación hecha desde la carpeta dedicada de staging: `C:\Users\seguc\.codex\worktrees\e2-2-gate-c-staging\PROYECTO CAFE`.
- `git rev-parse HEAD`: `867299065aaf185470326deb983f8dc91bc11882` (merge de PR #578 en `main`). El árbol estaba limpio antes de crear la rama de evidencia `codex/e2-2-gate-c-post-578-readonly`.
- `firebase.json` enumera 19 codebases; `saas-tenant-profile` ya forma parte del candidato de #578. `.firebaserc` declara `staging: micafe-pos-staging` y `production: micafe-pos`; el comando usó explícitamente el ID literal de staging.
- Firebase CLI `15.33.0`, resuelto desde `package-lock.json` y ejecutado mediante `node_modules/.bin/firebase.cmd` para evitar el CLI global del PATH.
- Las carpetas históricas `PROYECTO CAFE-STG-02` y `PROYECTO CAFE-STG-02-v2` solo declaran `saas-auth`, así que no son candidatas al deploy del SHA actual. La carpeta local antes identificada para producción (`PROYECTO CAFE`) también declara solo `saas-auth` y tiene cambios locales sin commit; no se usó para este preflight ni para comandos Firebase. Gate I requiere un checkout de producción separado, limpio y verificado en el SHA aprobado antes de ejecutarse.

## Lectura remota

Comando ejecutado, sin `deploy`, `--force` ni operación de escritura:

```powershell
.\node_modules\.bin\firebase.cmd functions:list --project micafe-pos-staging --json --non-interactive
```

El CLI devolvió `status: success` y 44 Functions `ACTIVE` en `us-central1`, distribuidas en 17 codebases. En el artefacto remoto no aparecen Functions activas bajo `saas-auth` ni `saas-tenant-profile`, aunque ambos codebases están en el manifiesto local. La ausencia en este inventario no se interpreta por sí sola como prueba de que un codebase sea seguro de desplegar. Se conserva una proyección JSON de los 44 registros (`id`, `codebase`, `state`, `hash`), sin variables de entorno ni secretos: [snapshot remoto redacted](G-SAAS-02-E2-2-GATE-C-READONLY-POST-578-2026-10-13.functions.json).

El inventario confirma que siguen activos los once IDs Bodega anteriores de ADR-SAAS-076 y no devuelve ninguno de sus once IDs nuevos. También devuelve `registrarCompraBodegaV1` activa en `saas-bodega-operations` y no devuelve `registrarCompraOperativaV1` ni la callable nueva `registrarPerfilComercialBodegaV1`.

La última lectura read-only a las `2026-10-13T02:32:00Z`, repetida con el binario local `15.33.0`, devolvió nuevamente 44/44 Functions `ACTIVE`, 17 codebases remotos, los once IDs anteriores activos y cero de los doce IDs nuevos. La proyección completa (`id`, `codebase`, `state`, `hash`) coincide registro por registro con el snapshot anterior.

## Comparación estática de exports por codebase

Se compararon los `export const` de los entrypoints locales de los cuatro codebases Bodega relacionados con el inventario remoto anterior. Este contraste identifica solo nombres de exports; no es una vista previa del plan de Firebase CLI ni compara el contenido/hash del código desplegado.

| Codebase objetivo | Exports locales | Functions remotas | IDs iguales | Solo local (posibles altas) | Solo remoto (posibles retiros) |
|---|---:|---:|---:|---|---|
| `saas-bodega` | 17 | 17 | 12 | 5 IDs nuevos | 5 IDs anteriores |
| `saas-bodega-operations` | 7 | 7 | 1 | 6 IDs nuevos | 6 IDs anteriores |
| `saas-bodega-membership` | 1 | 1 | 1 | 0 | 0 |
| `saas-tenant-profile` | 1 | 0 | 0 | 1 callable nueva | 0 |

Los 11 IDs solo locales de Bodega y los 11 solo remotos corresponden a los mapeos aceptados en ADR-SAAS-076. `registrarCompraBodegaV1` permanece con el mismo ID en `saas-bodega-operations`; la callable de perfil solo tiene alta local. En total hay 12 exports solo locales: 11 IDs Bodega nuevos y 1 callable de perfil; hay 11 IDs legacy solo remotos (posibles retiros). Estos conteos de nombres **no son todavía un delta de deploy aprobado**: faltan los cambios de hash/entorno por codebase, el comportamiento de borrado de IDs remotos ausentes, las dependencias y el plan de coexistencia/rollback.

| Codebase | ID anterior | Estado remoto | ID nuevo | Estado remoto |
|---|---|---|---|---|
| `saas-bodega` | `crearClienteVendedorV1` | `ACTIVE` | `crearClienteVendedorBodegaV1` | ausente |
| `saas-bodega` | `crearPresentacionComercialV1` | `ACTIVE` | `crearPresentacionComercialBodegaV1` | ausente |
| `saas-bodega` | `actualizarPresentacionComercialV1` | `ACTIVE` | `actualizarPresentacionComercialBodegaV1` | ausente |
| `saas-bodega` | `crearArticuloInventarioV1` | `ACTIVE` | `crearArticuloInventarioBodegaV1` | ausente |
| `saas-bodega` | `confirmarVentaBodegaV1` | `ACTIVE` | `confirmarVentaVendedorBodegaV1` | ausente |
| `saas-bodega-operations` | `consultarCatalogoPresentacionesVendedorV1` | `ACTIVE` | `consultarCatalogoPresentacionesVendedorBodegaV1` | ausente |
| `saas-bodega-operations` | `consultarClientesVendedorV1` | `ACTIVE` | `consultarClientesVendedorBodegaV1` | ausente |
| `saas-bodega-operations` | `consultarMisVentasVendedorV1` | `ACTIVE` | `consultarMisVentasVendedorBodegaV1` | ausente |
| `saas-bodega-operations` | `actualizarArticuloInventarioV1` | `ACTIVE` | `actualizarArticuloInventarioBodegaV1` | ausente |
| `saas-bodega-operations` | `abrirTurnoOperativoV1` | `ACTIVE` | `abrirTurnoBodegaV1` | ausente |
| `saas-bodega-operations` | `cerrarTurnoOperativoV1` | `ACTIVE` | `cerrarTurnoBodegaV1` | ausente |
| `saas-tenant-profile` | — | — | `registrarPerfilComercialBodegaV1` | ausente |

## Paquete fuente y allowlist de endpoints

En el checkout de staging, con HEAD `32938869a8f37ea0182647a8f777a0a41dd567bf` y Firebase CLI `15.33.0`, se reconstruyó el ZIP mediante el helper de empaquetado del CLI (`prepareFunctionsUpload`). Se registró el hash de fuente calculado por Firebase a partir de los contenidos incluidos. Aunque ese commit de evidencia no es ancestro de `main @ 867299065aaf185470326deb983f8dc91bc11882`, la comparación local `git diff --exit-code 867299065aaf185470326deb983f8dc91bc11882 32938869a8f37ea0182647a8f777a0a41dd567bf -- firebase.json .firebaserc package.json package-lock.json functions-bodega functions-bodega-operations functions-tenant-profile` no encontró diferencias en la configuración, dependencias ni fuentes de los tres codebases que se empaquetan. El PR #580 solo cambia documentación en esas rutas, así que sus commits no alteran el artefacto verificado. El SHA-256 binario del ZIP no se usa como fingerprint reproducible: en dos empaquetados del mismo contenido y tamaño varió, mientras el hash de fuente permaneció idéntico.

| Codebase fuente | Runtime configurado | Funciones de la allowlist | Hash de fuente Firebase | ZIP (bytes) |
|---|---|---:|---|---:|
| `saas-bodega` | Node.js 22 | 5 | `dccaa655e79132e439d9d64567e2e47f89177622` | 151171 |
| `saas-bodega-operations` | Node.js 22 | 6 | `1807ece7429f40e06663a250416571b889dd3748` | 135473 |
| `saas-tenant-profile` | Node.js 22 | 1 | `a50552d4f895e7fda6b78ad52c28dc66e64f195e` | 102962 |

Los 12 selectores exactos probados con el parser/matcher de Firebase CLI 15.33.0 son:

```text
functions:saas-bodega:crearClienteVendedorBodegaV1
functions:saas-bodega:crearPresentacionComercialBodegaV1
functions:saas-bodega:actualizarPresentacionComercialBodegaV1
functions:saas-bodega:crearArticuloInventarioBodegaV1
functions:saas-bodega:confirmarVentaVendedorBodegaV1
functions:saas-bodega-operations:consultarCatalogoPresentacionesVendedorBodegaV1
functions:saas-bodega-operations:consultarClientesVendedorBodegaV1
functions:saas-bodega-operations:consultarMisVentasVendedorBodegaV1
functions:saas-bodega-operations:actualizarArticuloInventarioBodegaV1
functions:saas-bodega-operations:abrirTurnoBodegaV1
functions:saas-bodega-operations:cerrarTurnoBodegaV1
functions:saas-tenant-profile:registrarPerfilComercialBodegaV1
```

El parser/matcher confirmó 12/12 candidatos locales y ninguno de los IDs legacy. Además, se invocó localmente la función pura `calculateChangesets` del planner 15.33.0 con esos endpoints seleccionados y la proyección remota observada: `saas-bodega` = 5 create / 0 update / 0 delete; `saas-bodega-operations` = 6 / 0 / 0; `saas-tenant-profile` = 1 / 0 / 0. Cero endpoints remotos coinciden con los selectores nuevos; las 25 Functions remotas en esos codebases quedan fuera del filtro. Esta simulación del changeset no ejecuta el planificador completo ni sus comprobaciones remotas de APIs/IAM/Secrets; tampoco demuestra delta de runtime ni rollback. Los once IDs legacy no están en la allowlist y no entran en este changeset.

Los doce exports existen en los módulos compilados locales. Los manifiestos de los tres codebases declaran Node.js 22; las dependencias runtime directas son `firebase-admin` y `firebase-functions` con lockfiles locales. No se hallaron archivos `.env*` en los árboles fuente de esos paquetes ni declaraciones runtime `defineSecret`; las pruebas de descubrimiento y module-load pasan. Esto es evidencia estática/local, no una lectura o validación de Secrets en staging.

## Revalidación de preparación y efectos del CLI — 2026-10-13

Se ejecutaron los builds locales de los tres paquetes y el discovery del SDK `firebase-functions` a través del runtime delegate de Firebase CLI `15.33.0`, sin desplegar ni llamar a APIs remotas desde ese discovery. El resultado completo fue 17 endpoints en `saas-bodega`, 7 en `saas-bodega-operations` y 1 en `saas-tenant-profile` (25 en total); todos son Gen 2 en `us-central1`, con cero parámetros y cero bindings de Secret. El único `requiredAPI` descubierto por los triggers es `cloudscheduler.googleapis.com` para el schedule de `saas-bodega`. Los otros endpoints no seleccionados incluyen el trigger Firestore de aviso, el schedule de agenda y `registrarCompraBodegaV1`; no forman parte de los 12 selectores aprobados.

Después del build y el empaquetado real del CLI, el helper `prepareFunctionsUpload` reprodujo exactamente los tres `sourceHash` y bytes ya documentados. El dry-run exacto terminó con `Dry run complete!` y empaquetó `functions-bodega` (151171 bytes), `functions-bodega-operations` (135473 bytes) y `functions-tenant-profile` (102962 bytes). El CLI prepara cada codebase completo antes de filtrar el release; por eso también comprueba APIs requeridas por triggers no seleccionados. El `--only` sigue siendo esencial: el changeset puro del planner 15.33.0 con la lectura remota y los filtros exactos continúa siendo 5 creates / 0 updates / 0 deletes, 6 / 0 / 0 y 1 / 0 / 0, respectivamente. El dry-run no imprime un listado de cambios de endpoint, así que el conteo exacto se mantiene atribuido a la simulación reproducible del planner, no al texto del dry-run.

Comando ejecutado exclusivamente contra staging:

```powershell
$selectors = @(
  'functions:saas-bodega:crearClienteVendedorBodegaV1',
  'functions:saas-bodega:crearPresentacionComercialBodegaV1',
  'functions:saas-bodega:actualizarPresentacionComercialBodegaV1',
  'functions:saas-bodega:crearArticuloInventarioBodegaV1',
  'functions:saas-bodega:confirmarVentaVendedorBodegaV1',
  'functions:saas-bodega-operations:consultarCatalogoPresentacionesVendedorBodegaV1',
  'functions:saas-bodega-operations:consultarClientesVendedorBodegaV1',
  'functions:saas-bodega-operations:consultarMisVentasVendedorBodegaV1',
  'functions:saas-bodega-operations:actualizarArticuloInventarioBodegaV1',
  'functions:saas-bodega-operations:abrirTurnoBodegaV1',
  'functions:saas-bodega-operations:cerrarTurnoBodegaV1',
  'functions:saas-tenant-profile:registrarPerfilComercialBodegaV1'
)
.\node_modules\.bin\firebase.cmd deploy --only ($selectors -join ',') --project micafe-pos-staging --dry-run --non-interactive
```

El dry-run **no es estrictamente read-only**: solicitó asegurar `cloudfunctions`, `cloudbuild`, `artifactregistry`, `firebaseextensions`, `cloudscheduler`, `run`, `eventarc`, `pubsub` y `storage`, y llamó `generateServiceIdentity` para Pub/Sub y Eventarc. La generación de esas dos identidades estaba autorizada previamente por el responsable para `micafe-pos-staging`; las lecturas IAM anteriores y posteriores muestran los bindings autorizados presentes: Pub/Sub `roles/pubsub.serviceAgent` y `roles/iam.serviceAccountTokenCreator`; Eventarc `roles/eventarc.serviceAgent`; cuenta Compute `roles/eventarc.eventReceiver` y `roles/run.invoker`. No afirmo que el POST de generación no haya creado recursos; se registra como efecto potencial del dry-run. No se ejecutaron Rules, Secrets, datos, compras, fixture, tenant ni producción.

La lectura posterior en staging encontró 44/44 Functions `ACTIVE` en 17 codebases, cero de los 12 IDs nuevos y 11/11 IDs legacy todavía `ACTIVE`. El catálogo de APIs permaneció en 53 servicios: todas las APIs que el CLI pidió asegurar ya estaban habilitadas; `cloudtasks.googleapis.com` continúa ausente, coherente con que los codebases no descubren endpoints de tareas. El dry-run no desplegó Functions. La cuenta de servicio de una callable Bodega existente es la Compute predeterminada `192423427245-compute@developer.gserviceaccount.com`, que mantiene `roles/editor` además de los dos bindings autorizados; los nuevos endpoints no declaran otra cuenta y, por tanto, heredan ese default. Es un privilegio preexistente que debe revalidarse para producción; este Gate C no lo amplía ni lo corrige.

## Evaluación del gate

El preflight confirma una adición acotada: 12 Functions nuevas en `micafe-pos-staging`, repartidas en los tres codebases indicados, sin actualización ni eliminación de endpoints remotos. Las 11 Functions legacy equivalentes permanecen activas, los IDs nuevos no colisionan con los 44 remotos, el dispatcher Bodega apunta a los nombres nuevos, y ambos namespaces delegan en el mismo núcleo de dominio aprobado. La propuesta de rollback de cliente para un despliegue futuro consiste en revertir el dispatcher al código base anterior a #574 (`9892ab2a006c2e71702569a7bf004ad78129d462`) y conservar las Functions añadidas; no se borrarían endpoints ni se revertirían hechos de inventario/ledger. Este rollback no se ha ejecutado ni ensayado. Las Functions legacy estaban activas en la lectura, por lo que clientes antiguos conservan su destino.

El inventario global de la fuente declara 19 codebases frente a 17 codebases remotos con Functions activas; `saas-auth` no tiene Functions activas observadas. Un despliegue global (`--only functions`) queda fuera de esta autorización y podría tener un delta distinto. El comando permitido debe conservar los 12 selectores, el proyecto literal de staging y Firebase CLI `15.33.0`; cualquier delta o binding distinto detiene Gate D.

**Resultado Gate C: `PREFLIGHT = PASS` solo para el changeset exacto de 12 creates de este artefacto, con los efectos previos de API/service identity declarados arriba; `PREFLIGHT = PASS` no autoriza por sí solo el deploy.** Existe una autorización operativa separada, registrada en el Goal y en el cuerpo de PR #580, para desplegar únicamente esos 12 creates en `micafe-pos-staging`, condicionada al merge de #580 y a CI post-merge completamente verde. Antes de ejecutar Gate D se revalidará el delta efectivo; cualquier cambio adicional detiene la ejecución. Gates D/F/G/H deben repetirse para ADR-SAAS-076/#578 antes de Gate I, que continúa bloqueado. Producción no fue consultada ni modificada.
