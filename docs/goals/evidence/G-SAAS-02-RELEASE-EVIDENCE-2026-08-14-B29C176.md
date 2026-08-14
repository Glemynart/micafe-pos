# G-SAAS-02 — Evidencia read-only de release — 2026-08-14 — b29c176

## Estado

INCOMPLETE

Esta evidencia actualiza la observación del release contra el SHA vigente de
origin/main. Fue recolectada sin escrituras productivas, sin cambios de
Rules/Storage y sin mutaciones del tenant Café Atrato.

- ObservedAt: 2026-08-14T19:30:00.211Z
- Proyecto: micafe-pos
- Repositorio: Glemynart/micafe-pos
- SHA objetivo y origin/main: b29c17622b0bca761d4953f840cda81425c1305f
- Tenant de referencia: Café Atrato (1ae0rD9H8t3ZFSBKrrHR)
- Escrituras productivas: false

## Observaciones automáticas

| Control | Resultado | Evidencia |
| --- | --- | --- |
| ORIGIN_MAIN_MATCH | PASS | El SHA objetivo coincide con origin/main. |
| CI_GREEN_FOR_TARGET | PASS | CI 31832206149, completada con success. |
| VERCEL_STATUS_FOR_TARGET | PASS | GitHub reportó deployment Vercel success; deployment observado: Hi6LwBdTqMKjghgdJmWmGNTQCJHb. |
| FUNCTIONS_ACTIVE_NODE22 | PASS | 74 Functions observadas, 74 activas, runtime nodejs22. |
| FUNCTIONS_HASH_DISTRIBUTION | PASS | Se observaron tres hashes desplegados y sus conteos: 3, 12 y 59. |
| FUNCTIONS_HASH_RECONCILIATION | PASS | El hash desplegado de cada Function fue observado y reconciliado. |
| RECOVERY_POINT_OBSERVED | PASS | Existe un schedule de recovery observable. |

## Gates independientes pendientes

| Gate | Resultado | Motivo |
| --- | --- | --- |
| Rules | MISSING | La atestación independiente no está enlazada en esta recolección. |
| Storage | MISSING | La atestación independiente no está enlazada en esta recolección. |
| Smoke productivo | MISSING | No existe una ventana/cuenta segura; el dominio público no está disponible para certificar el tenant. |
| Recovery independiente | MISSING | Hay schedule, pero todavía no hay backup observable ni restore aislado medido. |

## Recovery observado

- Base: (default) en southamerica-east1.
- Schedule: projects/micafe-pos/databases/(default)/backupSchedules/fa16b7c4-ecb8-418f-bf3a-815da592fabc.
- Recurrencia: diaria.
- Retención: 3024000s (35 días).
- Backups observables: 0.
- PITR: deshabilitado.

La existencia del schedule no se interpreta como backup ni como atestación de
restore. El Trial anual no se inicia y el tenant histórico no se modifica.

## Conclusión

El release técnico de origin/main está reconciliado para CI, Vercel y
Functions, pero el release productivo global permanece INCOMPLETE hasta
cerrar smoke productivo, Rules/Storage independientes y recovery verificable.

Referencia del colector: npx tsx scripts/g-saas-02/release-evidence.ts.
