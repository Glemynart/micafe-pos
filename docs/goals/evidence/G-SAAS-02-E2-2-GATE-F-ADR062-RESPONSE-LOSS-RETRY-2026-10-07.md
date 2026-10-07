# G-SAAS-02 / M2 / E2.2 — Gate F: retry tras pérdida de respuesta de venta (2026-10-07)

## Alcance

Registra la cobertura automatizada del retry del comando de venta de vendedor
introducido por ADR-SAAS-062. Es evidencia de CI bajo Emulator; no es una
ejecución contra `micafe-pos-staging` y no cierra por sí sola Gate F.

## Integración y validaciones

- PR #472, `test(e2e): cover ADR-062 retry after lost sale response`, quedó
  `MERGED` en `main`.
- Commit del PR: `885d5bcf48957913ea8e043bc09ac6ba7bfe1daa`.
- Merge commit: `fe383994a299baf9c346be15731ede3383b1d83e`, integrado el
  `2026-10-07T15:42:53Z`.
- Checks previos al merge: `Tipos y pruebas`, `Vercel` y `Vercel Preview
  Comments` — `PASS`.
- CI post-merge: run `37646184683`, sobre el merge commit, terminó `success`.
- La prueba aislada `npm run e2e:bodega-u4-u5` reportó `9 passed`; ESLint y
  `git diff --check` también pasaron en el PR.

## Escenario cubierto

En `tests/e2e/bodega-u4-u5/bodega.spec.ts`, con tenant y datos de test del
Emulator, el vendedor crea una solicitud y el administrador la aprueba. Al
confirmar la venta, el harness deja que el servidor responda HTTP `200` y
aborta la respuesta antes de que llegue al navegador. El usuario reintenta el
mismo comando. La prueba comprueba que ambos intentos conservan el mismo
payload y que queda una sola solicitud ejecutada, una venta, un movimiento de
inventario de `-2` unidades base y un ingreso financiero de `5.000 COP`.

Este escenario demuestra idempotencia ante pérdida de respuesta en el entorno
Emulator. No demuestra transporte, autenticación ni persistencia del proyecto
remoto `micafe-pos-staging`.

## Estado de Gate F

El subescenario de retry en Emulator queda `PASS`. Gate F continúa `EN CURSO`;
siguen requeridos el retry autenticado bajo pérdida de respuesta en staging,
el aislamiento A/B de las superficies operativas y la revocación/restauración
de membresía con replay del actor restaurado. Gate G debe repetirse tras el
cierre de F y Gate H requiere una matriz actualizada.

## Mutation audit

- Código de producto, Firebase remoto/staging, escrituras Firestore/Auth
  remotas, Rules, IAM, Secrets, deploy, tráfico, fixture de staging,
  Bootstrap, Activation y producción por esta prueba: `0`.
- La prueba E2E usa el Emulator y datos de test aislados; esas escrituras no
  alcanzan ningún proyecto Firebase remoto.
- El único archivo funcional del PR #472 fue una prueba E2E de Emulator; esta
  reconciliación registra su merge y alcance sin añadir nuevas mutaciones.
