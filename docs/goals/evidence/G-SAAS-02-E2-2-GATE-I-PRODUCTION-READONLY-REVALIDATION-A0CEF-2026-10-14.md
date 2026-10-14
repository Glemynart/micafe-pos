# G-SAAS-02 / M2 / E2.2 — Gate I: revalidación read-only de producción en `main @ a0cef89` (2026-10-14)

## Dictamen

`INCOMPLETE` — Gate I sigue bloqueado para release productivo, creación del
tenant real, persistencia de oferta/Trial e importación de catálogo. La CI del
SHA observado está verde y las 80 Functions listadas están activas en Node.js
22; sin embargo, producción sirve un deployment Vercel de `main @ 1c2f155`,
Firestore Rules no coincide con el código actual, las nuevas callables Bodega
no están publicadas y la callable legacy de compras sigue activa. Faltan
atestaciones independientes de smoke y recuperación. Este preflight es de
solo lectura: no autoriza deploy ni escrituras productivas.

## Identidad y método

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **SHA objetivo y `origin/main`:**
  `a0cef89994698e664c0cd2ae7b6676739cfda86e`.
- **Proyecto productivo:** `micafe-pos`, siempre pasado como ID literal en
  cada comando Firebase.
- **Hora de la colección:** `2026-10-14T05:35:19.107Z`.
- **Colector:** `scripts/g-saas-02/release-evidence.ts`, con `--project`,
  `--repo` y `--sha` explícitos; sin `--out`. La lectura Rules usó un token
  efímero de corta duración en memoria, sin imprimirlo ni persistirlo.
- **Resultado del colector:** `INCOMPLETE`; `collectionErrors=[]`,
  `readOnly=true`, `productionWrites=false`.
- **Comprobaciones locales previas:** carpeta dedicada de Gate I, árbol limpio,
  SHA exacto y proyecto productivo confirmado. No se usó la carpeta de staging.
- **Límites:** solo se consultaron GitHub, Vercel y metadatos Firebase de
  Functions, Rules, Storage y recuperación. No se consultaron documentos de
  clientes ni se invocaron callables. No hubo deploy, cambios de Rules/IAM/
  Secrets, tráfico, Auth, tenant ni datos.

## Evidencia observada

| Superficie | Observación al 2026-10-14 | Resultado |
|---|---|---|
| CI | Run `38465098694`, SHA `a0cef89994698e664c0cd2ae7b6676739cfda86e`, `completed/success`. | `PASS` |
| Vercel | El deployment productivo `READY` más reciente es `cafeatrato-2mgbt0pse-glemynarts-projects.vercel.app`, creado `2026-10-06T14:52:13Z`, asociado a `main @ 1c2f155653536b1fd8e1925db931e2354fa41f7d`. No se observó un estado Vercel exitoso para el SHA objetivo. | `BLOCKED`: no hay evidencia de que producción sirva el candidato actual. |
| Functions | `firebase functions:list --project micafe-pos --json`: 80/80 `ACTIVE`, todas `nodejs22`; el colector registró y reconcilió los hashes por Function. | `PASS` para estado/runtime; no acredita compatibilidad de Bodega. |
| Callables Bodega / compras | Los once IDs nuevos de ADR-SAAS-076 están ausentes; también está ausente `registrarCompraBodegaV1`. `registrarCompraOperativaV1` continúa `ACTIVE` en `us-central1`, Node.js 22, codebase `saas-auth`. | `BLOCKED`: aún no está publicada la ruta Bodega y sigue activa la ruta legacy. |
| Firestore Rules | Ruleset `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, actualizado `2026-08-15T04:20:46Z`. SHA local `69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`; remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. | `MISMATCH`; no desplegar el archivo completo sin corte compatible por vertical y rollback probado. |
| Storage Rules | SHA local y remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`. | `PASS` |
| Smoke independiente | No se proporcionó atestación independiente asociada al candidato productivo. | `MISSING` |
| Recuperación | PITR deshabilitado; 1 backup schedule y 34 backups observables en `southamerica-east1`. No se proporcionó atestación independiente de restore vigente asociada al candidato. | Punto de recuperación observado; restore `MISSING` |

Los once IDs Bodega ausentes, conforme a ADR-SAAS-076, son:
`crearClienteVendedorBodegaV1`, `crearPresentacionComercialBodegaV1`,
`actualizarPresentacionComercialBodegaV1`, `crearArticuloInventarioBodegaV1`,
`confirmarVentaVendedorBodegaV1`,
`consultarCatalogoPresentacionesVendedorBodegaV1`,
`consultarClientesVendedorBodegaV1`, `consultarMisVentasVendedorBodegaV1`,
`actualizarArticuloInventarioBodegaV1`, `abrirTurnoBodegaV1` y
`cerrarTurnoBodegaV1`.

## Consecuencia para Gate I

La observación anterior del 12-oct queda actualizada para el SHA actual, pero
no vuelve seguro un release. En particular, ADR-SAAS-072/075 requieren
compatibilidad del cliente, compra exclusivamente por la ruta Bodega y bloqueo
de la ruta legacy antes del corte de Rules; el inventario actual de producción
no satisface esas condiciones. El hash de Rules también continúa diferente al
candidato, por lo que no es seguro desplegar `firestore.rules` en bloque.

El siguiente trabajo permitido es preparar y validar el plan de release
compatible por vertical, con orden de publicación y rollback verificables, y
obtener atestaciones independientes de smoke y restore. Cualquier deploy
productivo, modificación de Rules, creación del tenant, oferta/Trial, usuarios,
catálogo o stock requiere sus gates y autorización operativa propios. La fecha
prevista del Trial ya pasó; su inicio debe derivarse de la activación canónica,
no retrofecharse.

## Mutation audit

- Archivos de aplicación/pruebas y servicios remotos: cambios `0`.
- Functions, Rules, IAM, Secrets, tráfico, Auth, Firestore, Storage, tenant,
  oferta/Trial, catálogo e inventario: escrituras `0`.
- El único artefacto de este cambio es esta nota de evidencia.

## Revisión

- **Fecha de observación:** 2026-10-14.
- **Base:** `origin/main @ a0cef89994698e664c0cd2ae7b6676739cfda86e`.
- **Alcance:** actualizar evidencia read-only de Gate I; no declara Gate I
  completo ni modifica el estado vivo del Goal antes de la integración.
