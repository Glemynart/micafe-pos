# G-SAAS-02 / M2 / E2.2 — Gate F: conciliación de efectivo

**Estado:** corrección preparada; validación del Preview posterior al cambio pendiente. No cierra Gate F.

**Última revisión:** 2026-10-09.

## Hallazgo reproducido en staging

El 9 de octubre de 2026 se inspeccionaron, sin mutaciones, los reportes y el
detalle de turno del fixture sintético `E2_2-BODEGA-STAGING-FIXTURE` en
`micafe-pos-staging`:

- El detalle del turno cerrado mostró base de apertura de `$1.000 COP`, ventas
  en efectivo de `$5.000 COP`, efectivo esperado de `$6.000 COP`, efectivo
  contado de `$6.000 COP` y diferencia canónica de `$0 COP`.
- Reportes mostraba `$5.000 COP` como vendido y `$6.000 COP` como declarado,
  calculando un sobrante falso de `$1.000 COP`.

La causa estaba demostrada en `lib/reportes-service.ts`: el informe restaba las
ventas en efectivo del período al efectivo contado, ignorando la base de
apertura y el efectivo esperado persistido por el cierre. También acumulaba
turnos abiertos como si fueran cierres declarados.

## Corrección

La conciliación por vendedor usa exclusivamente cierres `cerrado` que tengan
importes canónicos válidos. Suma `totalEsperadoEfectivo` y
`totalReportadoEfectivo`, y calcula `contado - esperado`; las ventas en efectivo
siguen mostrándose como métrica de venta, separada del cuadre. Si no hay un
cierre conciliable en el período, la interfaz lo indica y no inventa una
diferencia de `$0`.

La regla corresponde al dato canónico que ya persiste el cierre de turno; no
cambia autoridad, esquema, persistencia ni fórmula del cierre.

## Validación local

- `npm run test:reportes`: 5/5 PASS (incluye base de apertura, agregado de
  cierres, y exclusión de turnos abiertos o incompletos).
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS.
- ESLint dirigido a los cuatro archivos de aplicación/prueba afectados: PASS.
- `git diff --check`: PASS.

La CI de `main` posterior al PR #509 y la CI/Preview de esta corrección siguen
siendo requisitos independientes. No se ha desplegado esta corrección en
staging ni se han modificado Firestore, Auth, Rules, Functions, Scheduler, IAM,
Secrets, Vercel o producción.

**Gate F:** permanece `EN CURSO`; la matriz funcional integral sigue pendiente.
