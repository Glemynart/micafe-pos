# G-SAAS-02 / M2 / E2.2 — Gate B post-merge de ADR-SAAS-062

## Dictamen

`IMPLEMENTATION = CERTIFIED` para el alcance de ADR-SAAS-062 integrado por PR
#461. Esta evidencia cierra Gate B — implementación y CI; no cierra la
revalidación staging de Gates F/G/H ni autoriza Gate I.

## Identidad GitHub y CI

- PR #461: `feat(bodega): require admin approval for seller sales`.
- HEAD auditado: `e7d028a25300117bf1dec800fc01905dff9fdb49`.
- Merge commit en `origin/main`: `d5cd66e5bc02a06bcb5c318fce989e75e897c8bc`.
- Checks del PR: `Tipos y pruebas`, `Vercel` y `Vercel Preview Comments`, todos
  `PASS`.
- CI post-merge de `main`: run `37516562659`, SHA
  `d5cd66e5bc02a06bcb5c318fce989e75e897c8bc`, conclusión `success`.
- En ese run, el paso `Build, pruebas, discovery y module-load del codebase
  Bodega` y el E2E `E2E Bodega — solicitud, aprobación y venta canónica`
  concluyeron `success`.

## Superficie implementada

`functions-bodega/src/index.ts` descubre exactamente estas diez callables Gen
2 en `us-central1`, con runtime Node.js 22 y cero Secrets:

1. `crearCategoriaBodegaV1`
2. `crearClienteVendedorV1`
3. `crearPresentacionComercialV1`
4. `actualizarPresentacionComercialV1`
5. `crearArticuloInventarioV1`
6. `confirmarVentaBodegaV1`
7. `crearSolicitudVentaBodegaV1`
8. `consultarSolicitudesVentaBodegaV1`
9. `resolverSolicitudVentaBodegaV1`
10. `cancelarSolicitudVentaBodegaV1`

La implementación conserva la venta canónica en
`confirmarVentaBodegaV1`; la solicitud/aprobación no registra por sí sola
venta, caja, inventario ni obligación financiera. La venta del rol `admin`
continúa directa conforme a ADR-SAAS-062.

## Validación local

Ejecutado en `functions-bodega`, Node.js `v22.23.2`, npm `10.9.8`:

| Comando | Resultado |
| --- | --- |
| `npm run build` | PASS — TypeScript build. |
| `npm test` | PASS — 2 tests, 0 fallos, 0 skips. |
| `npm run test:discovery` | PASS — 1 test; diez callables, Gen 2, `us-central1`, cero Secrets. |
| `npm run test:module-load` | PASS — 1 test; no Firestore/Auth/Secrets I/O durante import. |

## Estado staging (solo lectura)

Al 2026-10-06, el inventario de `micafe-pos-staging` mostraba seis
`saas-bodega` activas: `crearClienteVendedorV1`,
`crearPresentacionComercialV1`, `actualizarPresentacionComercialV1`,
`crearArticuloInventarioV1`, `confirmarVentaBodegaV1` y
`crearCategoriaBodegaV1`. Todas reportaban `us-central1`/Node.js 22, revisión
`READY` con 100 % del tráfico y sin referencias a Secret en variables o
volúmenes de Cloud Run. Las cuatro callables de ADR-SAAS-062 no estaban
desplegadas. La revisión de venta era
`confirmarventabodegav1-00003-cud`, creada el `2026-10-03T09:23:50Z`.

En consecuencia, **Gate C — preflight del candidato de diez callables** y
Gate D — deploy staging permanecen pendientes. La CI E2E de Emulator no se
presenta como certificación funcional de staging.

## Gates posteriores

- Gate E: `PASS` — el fixture retenido existente es reutilizable; no crear
  otro por esta implementación. Está usado en
  [`Gate G`](G-SAAS-02-E2-2-GATE-G-REHEARSAL-2026-10-05.md) y
  [`Gate H`](G-SAAS-02-E2-2-GATE-H-CERTIFICATION-2026-10-05.md).
- Gate F: repetir la matriz staging afectada por la aprobación previa, junto
  con las demás validaciones funcionales críticas.
- Gate G: repetir el rehearsal completo bajo ADR-SAAS-062.
- Gate H: emitir certificación nueva con cada fila `PASS`, `FAIL`, `NOT
  EXECUTED` o `BLOCKED` respaldada por evidencia.
- Gate I: sigue pendiente; la oferta interna de `1.600.000 COP` no equivale a
  aceptación del cliente ni a una oferta persistida, y el tenant real no
  existe.

## Mutation audit

- Archivos de producto/Firebase modificados por esta verificación: `0`.
- Commits, push, PR y merge de código en esta verificación: `0`.
- Firebase deploy, Functions remotas, Firestore/Auth, Rules, IAM, Secrets,
  tráfico, fixture nuevo, Bootstrap, Activation, tenant real y producción: `0`.
- Solo se ejecutaron lecturas remotas y build/tests locales; outputs locales
  generados están ignorados por Git.
