# G-SAAS-02 / M2 / E2.2 — Primer rollout productivo de Firebase App Hosting

Fecha de verificación: 2026-10-15 (marcas de tiempo de la API incluidas abajo).

## Alcance

Esta evidencia acredita solamente la creación y el primer rollout técnico del
backend productivo de Firebase App Hosting. No certifica Gate I, gobernanza
autenticada, Functions, Firestore Rules, controles de compras, aislamiento
multi-tenant, ni el Trial de Distribuidora Las Jiménez.

## Fuente verificable

Lectura autenticada, sin mutaciones, de la API oficial Firebase App Hosting
`v1beta` para `projects/micafe-pos/locations/us-central1/backends/micafe-pos`,
su recurso `traffic`, el rollout `build-2026-10-15-001` y el build homónimo.
La lectura se realizó el 2026-10-15; no registra valores de variables de
entorno ni credenciales.

## Resultado remoto

| Campo | Valor observado |
| --- | --- |
| Proyecto / backend / región | `micafe-pos` / `micafe-pos` / `us-central1` |
| URI inicial | `https://micafe-pos--micafe-pos.us-central1.hosted.app` |
| Runtime | `nodejs24` |
| Rollouts automáticos | Desactivados para la rama `main` |
| Build | `build-2026-10-15-001` |
| Estado del build | `READY` |
| SHA fuente | `5c5c4fdd9164abdca0fe05c9fddb51cea8559a29` |
| Rollout | `build-2026-10-15-001` |
| Estado del rollout | `SUCCEEDED` |
| Tráfico actual | 100 % a `build-2026-10-15-001` |

Marcas remotas: el build se creó a `2026-10-15T17:44:49.579846015Z` y quedó
actualizado a `2026-10-15T17:49:23.684821Z`; el rollout se creó a
`2026-10-15T17:44:50.734857908Z` y quedó actualizado a
`2026-10-15T17:49:24.608049Z`. El recurso backend no estaba reconciliando en
la lectura. La API devuelve el recurso de tráfico con su propio `updateTime`
anterior; por ello el porcentaje se registra como estado actual, no como hora
de promoción.

## Límites pendientes

El éxito técnico del rollout no sustituye las verificaciones de sesión y
gobernanza autenticadas, ni autoriza ni acredita cambios en Rules, Functions,
controles de compras, operadores, tenants o Trial. El backend no implica que
Gate I ni E2.2 estén completados.
