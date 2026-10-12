# G-SAAS-02 / M2 / E2.2 — Gate I: reconocimiento read-only de producción (2026-10-12)

## Dictamen

`BLOCKED — RELEASE DE PRODUCCIÓN Y EVIDENCIA DE RECUPERACIÓN NO ALINEADOS`.

Este reconocimiento es de solo lectura. No habilita Gate I, no autoriza
Bootstrap/Activation, no crea el tenant ni la oferta/Trial y no constituye
autorización para desplegar o escribir en producción.

## Identidad y alcance

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **`main` observado:** `702195d436affdce623715db1eaef076f5c8693e`.
- **PR #559:** integrado el `2026-10-12T06:14:56Z`; CI post-merge
  [`38211605203`](https://github.com/Glemynart/micafe-pos/actions/runs/38211605203)
  terminó `success` sobre el SHA exacto a las `06:39:15Z`.
- **Proyecto productivo consultado:** `micafe-pos`.
- **Límites:** Firebase, Vercel y GitHub se consultaron sin mutaciones. No se
  usaron escrituras de aplicación, deploy, cambios IAM, Secrets ni APIs.

## Hallazgos

| Superficie | Observación read-only | Resultado para Gate I |
|---|---|---|
| Firestore Rules | El ruleset activo de producción es `d5e205db-0ab4-4db1-b5ec-1534bee39d35`; su SHA-256 normalizado es `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. El `firestore.rules` de `main @ 702195d` produce `69560ea6998352400eca77ce5dfb851864e196053b634f77e4bacd8674769fbb`. | `BLOCKED`: Rules de producción no coinciden con el código certificado actual. |
| Storage Rules | El contenido activo de producción coincide con `storage.rules` de `main`; SHA-256 normalizado `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`. | Paridad observada; falta la atestación independiente del paquete integral de release. |
| Cloud Functions | Se observaron 80 Functions activas, todas Node.js 22; los hashes de las superficies inspeccionadas se reconciliaron con el código actual. | Observación favorable, no sustituye la certificación de release ni smoke. |
| Vercel | El despliegue productivo READY más reciente observado corresponde a `1c2f155653536b1fd8e1925db931e2354fa41f7d`, creado el `2026-10-06T14:52:13Z`, anterior a `main @ 702195d`. `vercel.json` mantiene deshabilitados los despliegues Git automáticos de `main`; no se encontró estado de despliegue para el SHA objetivo actual. | `BLOCKED`: no hay evidencia de que la aplicación servida corresponda al release candidato actual. |
| Recuperación | Se observó un schedule de respaldo, 34 backups y ubicación `southamerica-east1`; PITR aparece deshabilitado. | `BLOCKED`: inventario no prueba una restauración ni rollback recuperable para el alta propuesta. |
| Release evidence collector | La primera colección falló al consultar Rules porque la solicitud no llevaba proyecto de cuota. Un GET posterior, limitado a la solicitud y con `x-goog-user-project: micafe-pos`, leyó el release; no se modificó ADC, IAM ni configuración del proyecto. Siguen faltando atestaciones independientes de Rules/Storage, smoke y recuperación. | `COLLECTION_ERROR` inicial resuelto como problema de cuota de la consulta; el conjunto de evidencia sigue incompleto. |

## Revalidación autenticada de Compras en staging

En Edge se verificó la sesión `Administrador Bodega Demo` en el preview
`https://cafeatrato-q2wxnn9m6-glemynarts-projects.vercel.app/admin/compras`,
asociado al preview #558 y al commit `047ae76e5644c5b0de7a9376fd2a286d3fff8c04`.
La página cargó el shell autenticado y el historial: una compra de
`Proveedor sintético Gate F`, total `$1.000 COP`, un ítem, fecha `11/10/2026`.
El panel de métricas mostró una compra y gasto total de `$1.000 COP`. No se abrió
el formulario ni se creó otra compra. Esto confirma lectura/render autenticado
de Compras en ese preview, no verifica el release productivo.

## Conclusión y siguiente paso

Gate H queda cerrado para el alcance reusable de staging conforme a la evidencia
integrada en #559. Gate I permanece bloqueado: el runtime productivo no está
alineado en Firestore Rules ni en aplicación Vercel y la recuperación no ha
demostrado un restore/rollback. Antes de cualquier alta real se requiere un
release plan exacto, preflight repetible, prueba de recuperación con evidencia,
smoke autenticado y las aprobaciones operativas correspondientes. No se hicieron
escrituras ni deploys en producción.
