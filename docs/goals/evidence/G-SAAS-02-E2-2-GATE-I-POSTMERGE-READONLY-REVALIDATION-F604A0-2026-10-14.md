# G-SAAS-02 / M2 / E2.2 — Gate I: revalidación read-only post-merge en `main @ f604a0a`

## Dictamen

`INCOMPLETE` para release productivo y tenant real. PR #594 está integrado. La CI post-merge del SHA objetivo seguía `in_progress` al observarse a las 16:21 UTC; el SHA no tiene estado Vercel exitoso. Esta revalidación no desplegó ni escribió en producción.

## Identidad y método

- **SHA objetivo y `origin/main`:** `f604a0af1669cc0903859c7271b1da1e3f29cea9`.
- **Proyecto productivo:** `micafe-pos`.
- **Hora del collector:** `2026-10-14T16:21:28.347Z`.
- **Checkout:** carpeta productiva aislada, limpia, detached en el SHA objetivo.
- **Colector:** `scripts/g-saas-02/release-evidence.ts`, con `--project micafe-pos --repo Glemynart/micafe-pos --sha f604a0af1669cc0903859c7271b1da1e3f29cea9`.
- **Resultado:** `INCOMPLETE`, `readOnly=true`, `productionWrites=false`, `collectionErrors=[]`.
- **Límites:** lectura de GitHub, Functions, Rules, Storage, metadata de Firestore/backups y listado de Vercel. No se leyeron documentos de negocio ni se invocaron operaciones autenticadas. No hubo deploy, escrituras, cambios IAM/Secrets, ni cambios en tenant, Auth o datos.

## Evidencia

| Superficie | Observación |
|---|---|
| `origin/main` | Coincide con `f604a0af1669cc0903859c7271b1da1e3f29cea9`. |
| CI | Run `38597025350`, SHA objetivo, `in_progress` a las `2026-10-14T16:21Z`; no se reporta como PASS hasta que concluya. |
| Vercel | Sin estado exitoso para el SHA objetivo. Listado read-only de producción: 73 deployments; el más reciente `READY` apunta a `main @ 1c2f155653536b1fd8e1925db931e2354fa41f7d`, creado `2026-10-06T14:52:13.319Z`. El SHA `f604a0a` no está publicado. |
| Functions | 104/104 `ACTIVE`, runtime `nodejs22`. Las 13 rutas objetivo y 11 de soporte Bodega están activas. `registrarCompraOperativaV1` conserva el hash `9282ced0a7b282ea8573e5ba930efb2e4aee6aa0`, anterior al guard ADR-SAAS-075. `wompiReservasWebhookV1` no aparece en el inventario. |
| Firestore Rules | `MISMATCH`; release `d5e205db-0ab4-4db1-b5ec-1534bee39d35`, fuente `2dc12a5972c216601a21cbae6be73bd787558f4fdad4a33227f05dee37087b91`, remoto `c3d98b265c4031bc3bf304b74389ece22feaed2d7afe909fe7ea00f86a6a92f3`. |
| Storage Rules | `PASS`; SHA fuente/remoto `fc837a77b952f3f2cf9e6eec24e7962eb0177a992f0776810d4798b5a1ee9f2b`. |
| Smoke y recuperación | Faltan atestaciones independientes para el release objetivo. PITR está deshabilitado; se observan 1 backup schedule y 35 backups en `southamerica-east1`. |

Las Rules fueron leídas directamente mediante la API; su comparación sigue en `MISMATCH`. `MISSING` para atestación independiente significa que no se proporcionó evidencia externa al collector, no que no se haya inspeccionado el ruleset.

## Revalidación complementaria — 2026-10-14T16:33Z

- `origin/main` sigue en `f604a0af1669cc0903859c7271b1da1e3f29cea9`. La CI post-merge `38597025350` y la CI del PR #595 (`38597973053`) continúan `in_progress`; ningún check se registra como PASS mientras siga pendiente.
- Una nueva lectura del collector a las `2026-10-14T16:29:54.494Z` conservó `INCOMPLETE`, `readOnly=true`, `productionWrites=false` y `collectionErrors=[]`; Functions, hashes, Rules, Storage y recuperación no cambiaron frente a la tabla anterior.
- La consulta directa de deployments Vercel vuelve a mostrar como `READY` más reciente `main @ 1c2f155653536b1fd8e1925db931e2354fa41f7d`, del 6-oct; `f604a0a` no está publicado. `vercel.json` mantiene deshabilitados los deploys automáticos desde `main`.
- Para acotar el impacto DIAN se ejecutó únicamente una agregación server-side, sin devolver documentos ni identificadores: `ventas` con `dian.emitidoEn IS NOT NULL` = `0`. Esto indica que no se observaron ventas con emisión DIAN persistida en el conteo consultado; no demuestra que ningún tenant activo dependa de emitir en el futuro. El código todavía importa y llama `guardarMetadatosDian()` desde `components/pos/historial.tsx`, y la función hace `setDoc` cliente; las Rules candidatas niegan todas las escrituras de `/ventas`. Por eso el corte global sigue condicionado a confirmar la operación de los tenants activos o a resolver ese writer bajo autoridad de servidor; el conteo `0` no autoriza desplegar Rules.
- La evidencia de recovery del `2026-08-15` sí registra un restore aislado `SUCCESSFUL` con RPO `0.220 h` y RTO `0.232 h`; sigue siendo una prueba histórica, no una atestación ligada al release actual. La observación de smoke de esa fecha fue anónima y dejó `AUTHENTICATED_TENANT_SMOKE = MISSING`, por lo que tampoco cierra el smoke de Gate I.

Esta revalidación fue de lectura y agregación únicamente. No hubo deploy, cambio de Rules/Vercel/PITR, modificación IAM/Secrets, lectura de documentos de negocio, ni escritura de tenant o datos.

## Estado y límites de salida

Gate I continúa `INCOMPLETE`: falta publicar/verificar el guard de la callable legacy, resolver y autorizar el corte de Rules tras reconciliar el uso productivo de DIAN, desplegar una versión identificable de Vercel, y obtener smoke/restore independientes. No se activa PITR ni se crea tenant/Trial como parte de esta lectura. La autorización de ADR-SAAS-078 cubrió preparar su PR; no habilita deploy.
