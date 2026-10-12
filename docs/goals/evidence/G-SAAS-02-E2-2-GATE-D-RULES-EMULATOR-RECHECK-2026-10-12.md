# G-SAAS-02 / M2 / E2.2 — Recheck local de Rules para ADR-SAAS-072 (2026-10-12)

## Contexto

El merge de PR #570 avanzó `main` a
`d5328125efb01fe15da08ad3f426c4b4c7100d5a`. Para no confundir las pruebas del
emulador con el requisito remoto pendiente de Gate D, se repitió la suite de
Rules sobre el mismo `firestore.rules` y los mismos archivos de prueba que ese
SHA de `main`.

## Verificación ejecutada

- Rama de ejecución: `codex/e2-2-post-569-goal-reconcile` en
  `90c3e64b7159f76b19bcd22d9ae3d2eb001fe536`.
- Se comprobó que no hay diferencias entre ese checkout y `origin/main` en
  `firestore.rules` ni `firestore-rules/`.
- Comando: `npm run test:rules`.
- Runner: Firestore Emulator con proyecto de demostración
  `demo-mt-u4-rules`; Firebase CLI indicó que los servicios emulados usan una
  configuración demo y que cualquier intento contra servicios no emulados
  fallaría.

## Resultado

`PASS` — 42 tests aprobados, 0 fallidos, 0 cancelados y 0 omitidos; duración
registrada por Node.js: `19,219.9421 ms`.

Incluye los casos de ADR-SAAS-072 que verifican que el administrador Bodega
puede leer compras de su tenant, pero se deniegan su creación y eliminación
directas; también se conserva el contrato de create/delete para otro vertical.

## Límites y estado de Gate D

- Esta prueba se ejecutó únicamente en Firestore Emulator; no es una prueba de
  Rules remotas ni de identidad autenticada en staging.
- No se hicieron deploys ni escrituras en staging o producción, ni se registró
  compra, movimiento de inventario o ajuste de stock.
- `BODEGA_DIRECT_WRITE_DENIAL_REMOTE_SMOKE = NOT RUN` permanece vigente.
- La evidencia read-only del release de staging y de la compra canónica
  posterior a Rules está en [la reconciliación remota de Rules](G-SAAS-02-E2-2-GATE-D-RULES-READONLY-RECONCILIATION-2026-10-12.md).
