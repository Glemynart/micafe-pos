# Auditoría P0-03 — Venta server-authoritative

## Resultado

**NO APROBADO PARA MERGE**

Este estado es provisional mientras el PR no tenga todos los checks requeridos de CI en verde. La auditoría se actualizará únicamente cuando exista evidencia de CI completa.

## Trazabilidad

- **Goal:** G-MVP-01 — MVP comercial de Café Atrato.
- **Milestone:** M2 — Núcleo transaccional íntegro.
- **Epic:** E2.1 — Venta server-authoritative.
- **PR:** P0-03 — traslado de la Fase 2 de ventas al backend.
- **ADR:** ADR-SAAS-015 — Ejecución server-authoritative de la Fase 2 de ventas, aceptado por decisión técnica delegada por el usuario.

## Alcance auditado

El cambio sustituye la ejecución local de la Fase 2 por la callable existente `aplicarEfectosVentaOperativaV1` en `registrarVenta`, `cobrarPedido` y el reconciliador operativo cliente. El backend deriva la venta desde Firestore y ejecuta en una transacción Admin SDK los efectos de inventario, tesorería, saldos, secuencias, transición a `COMPLETO`, recibo, índice de idempotencia y auditoría. Cuando la venta proviene de un pedido, la misma transacción cierra el pedido y las comandas.

No se modificaron Rules, Bootstrap, Fase 1, numeración, `snapshotFiscal`, Planes, producción, anulaciones ni operaciones posteriores.

## Revisión por dimensión

- **Arquitectura:** conforme a ADR-SAAS-015; la autoridad de la Fase 2 queda en Functions y no se crea una segunda implementación.
- **Dominio:** se conserva la semántica de venta pagada y cuenta por cobrar; `sell` es la capacidad canónica del MVP y no se agrega `pos` al plan.
- **Seguridad:** la callable revalida tenant, membresía, rol, lifecycle y capacidad; el cliente no recibe autoridad sobre stock, saldos ni estado operativo.
- **Persistencia:** los efectos críticos se escriben en una sola transacción; las lecturas de idempotencia, artículos, recetas, cuentas, turno y pedido preceden las escrituras.
- **Idempotencia y auditoría:** el comando determinista `efectos-venta:<ventaId>` se reutiliza en retry y reconciliación; se conservan recibo, índice, correlación, causación y auditoría.
- **Compatibilidad:** la Fase 1 y el contrato fiscal no cambian; el reconciliador server-side usa el mismo ejecutor y deja de duplicar la ruta cliente.
- **Rollback:** revertir el cliente no reabre escrituras críticas porque Rules continúa bloqueándolas; la ruta server-side es aditiva y las ventas pendientes pueden recuperarse por reconciliación.
- **Migraciones:** no hay migraciones ni escrituras productivas.
- **Alcance:** no hay cambios de módulos, planes, Bootstrap, Rules ni funcionalidades de PR posteriores.

## Evidencia ejecutada

- `npx tsc --noEmit` — PASS.
- `npm run build` — PASS.
- `npm run build:functions` — PASS.
- `npm run test:auth-foundation` — PASS: 225 passed, 1 skipped, 0 failed.
- Pruebas focalizadas de cierre/reconciliación — PASS: 14/14.
- `npm run test:rules` — PASS; las denegaciones esperadas pertenecen a casos negativos.
- `npm run test:tickets` — PASS: 51 passed, 1 skipped.
- `npm run test:reimpresion` — PASS: 18 passed.
- `npm run test:tenant` — PASS: 8 passed, 1 skipped.
- `npm run test:backfill` — PASS: 19 passed.
- `npm run test:email:integration` — PASS con emuladores aislados; la primera ejecución fue impedida por la colisión de puertos del emulador de ventas y se repitió después de liberar los procesos exactos.
- E2E local browser con el fixture `demo-p0-01-e2e` — PASS: HTTP 200 de `aplicarEfectosVentaOperativaV1`, UI `Venta Completada`, cero errores de consola y cero respuestas HTTP fallidas.
- Verificación Admin SDK en Firestore Emulator: venta `COMPLETO`, stock `99`, saldo Bancolombia `6000`, saldo caja `0`, un movimiento financiero, un movimiento de inventario, un comando y una auditoría; replay sin duplicados.
- Rules: no hubo cambios en `firestore.rules`.

## Observación de tooling preexistente

El script `npm run lint` no puede ejecutarse en el checkout actual porque `eslint` no está declarado ni instalado. El script y la ausencia de la dependencia son preexistentes y no forman parte de P0-03; además, el workflow `.github/workflows/ci.yml` no incluye lint. Esta observación no sustituye los checks de CI requeridos.

## Condición para cerrar la auditoría

Actualizar este resultado a **APROBADO PARA MERGE** solo después de que `gh pr checks <PR>` confirme todos los checks en verde, sin pendientes, y el diff mantenga el alcance auditado.
