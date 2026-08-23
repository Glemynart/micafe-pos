# P1-09 — Cierre post-merge y gates de activación

Fecha de verificación: 2026-08-22.

## Identificación

- PR integrado: `#351 — P1-09 Security remediation`.
- Base del PR: `9cdb25f0ad52eb1e3b4a44c6f6e924403a43f3b9`.
- Head del PR: `d1a8c5164ca83a760759c23094cd88e40d807bf1`.
- Merge commit y SHA observado de `origin/main`: `96a1a3c32ab5d547a00a93e9df686c7e73e02258`.
- Método: merge normal de GitHub; no se modificó `main` manualmente.
- Activación productiva: **DESHABILITADA**.

## Evidencia post-merge

| Gate | Estado | Evidencia |
| --- | --- | --- |
| Merge PR #351 | PASS | GitHub registra el PR como `MERGED` el 2026-08-22T19:02:43Z; el commit de merge tiene como padres la base y el head documentados. |
| CI de `main` | PASS | GitHub Actions run `32592546684`, job `97078487534`: todas las validaciones terminaron en verde, incluidas build Web/Functions, Rules, Storage, Auth/Firestore integration, Operator E2E, E4.1/E4.2 y P0-01. |
| Vercel del merge | PASS TÉCNICO | El status del commit terminó en `success`; deployment registrado: `8gSZndpqeBWKS3y3pvXqZxSaXPV7`. Esto no demuestra variables Wompi ni WAF. |
| Codex Security sobre `main` | PASS P1-09 / DEUDA SEPARADA | Scan `c10e69cc-ac29-458c-8e52-e2c364450822` sobre el SHA de merge: cero regresiones P1-09; un MEDIUM preexistente y fuera de alcance en lectura global de `usuarios` (`csf_5ca8a6446e681d29d5c898cd`). Cobertura declarada: parcial y focalizada. |
| Function Wompi desplegada | BLOCKED — DEPLOYMENT AUTHORIZATION REQUIRED | `firebase functions:list --project micafe-pos --json` no contiene `wompiReservasWebhookV1`; el build local sí genera y exporta la Function. El procedimiento está en el runbook. |
| Secretos y ambiente Wompi | BLOCKED | No existe evidencia autoritativa de bindings productivos para `WOMPI_EVENTS_SECRET`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_ENVIRONMENT` y la llave pública. No se leyeron valores. |
| WAF/rate limit del hold | BLOCKED | No existe evidencia de regla Preview para `POST /api/reservas/hold`, 5 solicitudes/10 minutos por IP, JA4 cuando aplique, sexta respuesta 429 y recuperación de ventana. |
| Readiness fiscal y tesorería del tenant | BLOCKED | No se suministró tenant/ventana autorizada ni evidencia de numeración vigente, producto tarifario y cuenta lógica tenant-aware. |
| Smoke productivo | BLOCKED — PRODUCTIVE WINDOW REQUIRED | Está preparado en `P1-09-SMOKE-CONTROLADO.md`; no se ejecutaron pagos ni escrituras productivas. |
| Rollback | DOCUMENTADO / NO EJECUTADO | El runbook define `RESERVAS_PUBLICAS_ENABLED=false`, deshabilitación de tarifa y preservación de pagos/intenciones para conciliación. Falta validarlo dentro de la ventana de activación. |

## Resultado del scan post-merge

El flujo P1-09 conserva autoridad server-side de tenant, tarifa, monto, moneda y referencia; intención de pago persistida; firma de checkout; validación firmada de `id`, `status`, `reference`, `amount_in_cents`, `currency` y `environment`; revalidación de reserva, mesa, agenda y hold; efectos fiscales/tesorería idempotentes; cuenta financiera tenant-aware; cancelación serializada; Rules que niegan acceso cliente a intenciones; y webhook Next legacy fail-closed. Los valores `35_000` y `3_500_000` observados corresponden a fixtures de prueba, no a un fallback productivo.

La verificación local posterior confirmó `npm run build:functions`, `npx tsc --noEmit`, `npm run build`, las 306 pruebas de Functions (303 PASS, 3 skips) y 19 pruebas focalizadas de reservas/Wompi (19 PASS). La Function está exportada en el artefacto compilado; el bloqueo restante es la autorización y ejecución del deployment externo.

El scan reportó separadamente que `firestore.rules` permite leer `usuarios/{uid}` a cualquier principal autenticado. Es una deuda de identidad previa a P1-09: no altera la conclusión del corte financiero, pero debe remediarse en una iniciativa independiente con proyección mínima tenant-aware y pruebas Emulator de denegación cross-tenant.

Artefactos canónicos del scan: `report.md`, `findings.json`, `coverage.json` y `exports/results.sarif`, sellados bajo el scan ID indicado. La consulta TAC no estuvo disponible y la política del repositorio prohibió workers delegados.

## Decisión

P1-09 está integrado técnicamente, pero no está listo para activación. La ausencia de la Function desplegada y de evidencia de secretos, WAF, readiness fiscal/tesorería y smoke mantiene el gate cerrado. Este documento no autoriza despliegues, cambios de secretos, escrituras de tenant ni pagos.

`P1-09 — BLOQUEADO`
