# Gate C — inventario read-only posterior a PR #578

- **Última relectura remota:** Functions `2026-10-13T02:19:02Z`; catálogo completo de APIs `2026-10-13T02:12:55Z` (UTC).
- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2 — Provisioning y onboarding` / `E2.2 — Configuración inicial`
**Resultado:** `INCOMPLETE` — inventario remoto observado; preflight de despliegue no aprobado.

## Alcance y separación de entornos

- Comprobación hecha desde la carpeta dedicada de staging: `C:\Users\seguc\.codex\worktrees\e2-2-gate-c-staging\PROYECTO CAFE`.
- `git rev-parse HEAD`: `867299065aaf185470326deb983f8dc91bc11882` (merge de PR #578 en `main`). El árbol estaba limpio antes de crear la rama de evidencia `codex/e2-2-gate-c-post-578-readonly`.
- `firebase.json` enumera 19 codebases; `saas-tenant-profile` ya forma parte del candidato de #578. `.firebaserc` declara `staging: micafe-pos-staging` y `production: micafe-pos`; el comando usó explícitamente el ID literal de staging.
- CLI Firebase bloqueado por el checkout: `15.33.0`.
- Las carpetas históricas `PROYECTO CAFE-STG-02` y `PROYECTO CAFE-STG-02-v2` solo declaran `saas-auth`, así que no son candidatas al deploy del SHA actual. La carpeta local antes identificada para producción (`PROYECTO CAFE`) también declara solo `saas-auth` y tiene cambios locales sin commit; no se usó para este preflight ni para comandos Firebase. Gate I requiere un checkout de producción separado, limpio y verificado en el SHA aprobado antes de ejecutarse.

## Lectura remota

Comando ejecutado, sin `deploy`, `--force` ni operación de escritura:

```powershell
firebase functions:list --project micafe-pos-staging --json --non-interactive
```

El CLI devolvió `status: success` y 44 Functions `ACTIVE` en `us-central1`, distribuidas en 17 codebases. En el artefacto remoto no aparecen Functions activas bajo `saas-auth` ni `saas-tenant-profile`, aunque ambos codebases están en el manifiesto local. La ausencia en este inventario no se interpreta por sí sola como prueba de que un codebase sea seguro de desplegar. Se conserva una proyección JSON de los 44 registros (`id`, `codebase`, `state`, `hash`), sin variables de entorno ni secretos: [snapshot remoto redacted](G-SAAS-02-E2-2-GATE-C-READONLY-POST-578-2026-10-13.functions.json).

El inventario confirma que siguen activos los once IDs Bodega anteriores de ADR-SAAS-076 y no devuelve ninguno de sus once IDs nuevos. También devuelve `registrarCompraBodegaV1` activa en `saas-bodega-operations` y no devuelve `registrarCompraOperativaV1` ni la callable nueva `registrarPerfilComercialBodegaV1`.

La última lectura read-only a las `2026-10-13T02:19:02Z` devolvió nuevamente 44/44 Functions `ACTIVE`, 17 codebases remotos, los once IDs anteriores activos y cero de los doce IDs nuevos. No se observó deriva respecto al snapshot inicial.

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

En el checkout de staging, con HEAD `32938869a8f37ea0182647a8f777a0a41dd567bf` y Firebase CLI `15.33.0`, se reconstruyó el ZIP mediante el helper de empaquetado del CLI (`prepareFunctionsUpload`). Se registró el hash de fuente calculado por Firebase a partir de los contenidos incluidos. El SHA-256 binario del ZIP no se usa como fingerprint reproducible: en dos empaquetados del mismo contenido y tamaño varió, mientras el hash de fuente permaneció idéntico.

| Codebase fuente | Runtime configurado | Funciones de la allowlist | Hash de fuente Firebase | ZIP (bytes) |
|---|---|---:|---|---:|
| `saas-bodega` | Node.js 22 | 5 | `dccaa655e79132e439d9d64567e2e47f89177622` | 151171 |
| `saas-bodega-operations` | Node.js 22 | 6 | `1807ece7429f40e06663a250416571b889dd3748` | 135473 |
| `saas-tenant-profile` | Node.js 22 | 1 | `a50552d4f895e7fda6b78ad52c28dc66e64f195e` | 102962 |

La allowlist se simuló sin deploy con el parser/matcher de selectores de Firebase CLI 15.33.0: 12 selectores exactos y codificados por codebase (5 + 6 + 1), 12/12 candidatos locales coincidentes y ninguno de los once IDs legacy coincidente. Todos los doce IDs nuevos están ausentes del inventario remoto. Esto acota una publicación futura a altas de endpoint por nombre; **no** equivale a ejecutar el planificador completo del CLI ni demuestra delta de runtime, IAM, APIs, borrados o rollback. Los once IDs legacy solo podrían entrar en una operación de retiro si se selecciona el codebase completo o se pide explícitamente su borrado; no están en esta allowlist.

Los doce exports existen en los módulos compilados locales. Los manifiestos de los tres codebases declaran Node.js 22; las dependencias runtime directas son `firebase-admin` y `firebase-functions` con lockfiles locales. No se hallaron archivos `.env*` en los árboles fuente de esos paquetes ni declaraciones runtime `defineSecret`; las pruebas de descubrimiento y module-load pasan. Esto es evidencia estática/local, no una lectura o validación de Secrets en staging.

## Evaluación del gate

Este resultado no es `PREFLIGHT = PASS`. El remoto aún sirve los once IDs anteriores mientras el código de `main` expone los nuevos. Además, #578 añade un codebase/function que aún no aparece en staging. Antes de cualquier publicación se requiere un artefacto de preflight que enumere el delta exacto por codebase/ID, analice cómo coexisten las Functions antiguas y nuevas durante el cambio, verifique secretos y dependencias y detalle el rollback compatible con clientes ya abiertos. La lectura `functions:list` no determina esas consecuencias ni autoriza borrados, reemplazos o deploy.

Se inspeccionó `firebase deploy --help`: `--dry-run` construye y valida sin desplegar, pero advierte que aún podría habilitar APIs en el proyecto destino. No se ejecutó, ya que una habilitación sería un cambio remoto fuera del alcance aprobado por ADR-SAAS-073/075/076. La lectura completa de APIs habilitadas se repitió con `gcloud services list --enabled --project=micafe-pos-staging --format=value(config.name)`; devolvió 53 servicios e incluye `cloudscheduler.googleapis.com`, necesario por `reconciliarAgendaPedidosBodegaV1`. `cloudtasks.googleapis.com` no está habilitado y los codebases seleccionados no exportan `onTaskDispatched`. El catálogo completo está en [snapshot de APIs staging](G-SAAS-02-E2-2-GATE-C-STAGING-ENABLED-APIS-2026-10-13.json). Aunque más completa, esta lectura no asigna aún cada API a efectos del planificador Firebase por codebase ni descarta que una ejecución intente habilitar otra API. El `--dry-run` queda pendiente hasta cerrar esa matriz y contar con autorización específica para cualquier efecto remoto que pudiera producir.

El manifiesto local contiene 19 codebases mientras la lectura de staging devuelve 17 codebases con Functions activas. ADR-SAAS-076 conserva los once nombres legacy en `saas-auth` y les asigna IDs Bodega únicos a los wrappers Bodega; el inventario actual no observa Functions activas en `saas-auth`. Por tanto, un despliegue global (`--only functions`) no queda cubierto por este inventario y podría tener un delta muy distinto al de los codebases Bodega aprobados. El preflight debe especificar explícitamente cada codebase permitido y comprobar su delta; no inferir que un codebase ausente del remoto está vacío o es seguro de publicar.

Por tanto, Gate C continúa `INCOMPLETE`: ya se dispone de hashes de fuente por codebase, una allowlist exacta a nivel de selector y la lectura completa de APIs, pero aún falta demostrar el plan final del CLI y sus efectos colaterales, compatibilidad de coexistencia con clientes desplegados, cierre de dependencias/Secrets por endpoint y rollback verificable. Gates D/F/G/H no se consideran repetidos para el namespace de #578/ADR-SAAS-076 y Gate I continúa bloqueado. No se ejecutaron comandos de deploy, cambios de Firestore Rules/IAM/Secrets, ni escrituras de datos o tenant. Producción no fue consultada ni modificada.
