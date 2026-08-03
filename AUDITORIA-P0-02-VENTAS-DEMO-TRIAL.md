# Auditoría P0-02 — Ventas DEMO durante Trial

## Resultado

**APROBADO PARA MERGE**

La implementación satisface el alcance aprobado de `ADR-SAAS-016` y sus
invariantes adicionales. No se realizaron escrituras ni despliegues en
producción.

## Trazabilidad

- **Goal:** `G-MVP-01` — MVP comercial de Café Atrato.
- **Milestone:** `M1` — Tenant y fiscalidad listos para operar.
- **Epic:** `E1.2` — Readiness fiscal.
- **PR:** `P0-02` — habilitar ventas DEMO no fiscales durante Trial.
- **Rama:** `codex/e1-2-p0-02-trial-demo-sales`.
- **ADR:** `ADR-SAAS-016`, aceptado por aprobación explícita del usuario.

## Alcance auditado

- La elegibilidad DEMO se deriva sin persistir un nuevo estado: Empresa en
  `trial`, suscripción `trialing` vigente, plan publicado con `sell`, y
  fiscalidad B1+B2 aún incompleta.
- La callable `crearVentaDemostracionV1` es la única autoridad de creación.
  Revalida tenant, rol, suscripción, plan, readiness, catálogo y totales
  dentro de la transacción.
- La venta DEMO persiste únicamente el contrato comercial permitido: no
  contiene `consecutivo`, `snapshotFiscal`, `dian` ni campos tributarios de
  línea. La referencia es operativa (`DEMO-<ventaId>`).
- Se conserva la auditoría, el recibo de comando, la idempotencia y la
  recuperación por `aplicarEfectosVentaOperativaV1`.
- La Fase 2 mantiene los efectos operativos de inventario, tesorería y pedido;
  esos efectos no convierten la venta en un documento fiscal.
- El onboarding permite `Continuar más tarde`, muestra el modo DEMO y solo
  habilita el flujo FISCAL cuando B1+B2 están completos.
- El ticket y el historial identifican explícitamente `DEMO · NO FISCAL`, sin
  identidad fiscal, numeración fiscal, impuestos impresos, CUFE o DIAN.

## Invariantes y seguridad

- `confirmarVentaFiscal` rechaza cualquier intento de usar una venta DEMO como
  venta fiscal (`VENTA_DEMO_NO_FISCALIZABLE`). No existe migración ni comando
  de promoción DEMO → FISCAL.
- La autoridad de elegibilidad y persistencia está en Functions; el cliente
  solo selecciona el modo entregado por `OnboardingGate` y envía una intención
  comercial.
- Las ventas DEMO permanecen fuera de snapshot, numeración, CUFE y proyección
  DIAN. Pueden aparecer en las vistas y reportes operativos existentes, donde
  conservan su modo identificable.
- No se modificó `firestore.rules`; Bootstrap, planes publicados y la ruta
  fiscal existente permanecen fuera de esta implementación.

## Persistencia, compatibilidad y rollback

- No hay migraciones de datos ni cambios de esquema retroactivos.
- La ruta FISCAL mantiene su contrato y su consumo de numeración.
- La Fase 2 existente se reutiliza; no se crea una segunda autoridad para
  inventario, tesorería, auditoría o transacciones.
- Un rollback consiste en revertir la callable y el adaptador cliente; no
  requiere escrituras productivas ni migración. Las ventas DEMO locales se
  aíslan en el emulador de pruebas.

## Evidencia ejecutada

- `npx tsc --noEmit` — PASS.
- `npm run build` — PASS.
- `npm run build:functions` — PASS.
- `npm run test:auth-foundation` — PASS: 230 aprobadas, 1 skip existente, 0
  fallos; incluye las pruebas DEMO server-side.
- `npx tsx --test functions/src/fiscal/service.test.ts` — PASS: 19/19.
- `npx tsx --test functions/src/onboarding/service.test.ts` — PASS: 2/2.
- `npx tsx --test functions/src/finanzas/cierre-turno.test.ts` — PASS: 11/11.
- `npm run test:tickets` — PASS: 53 aprobadas, 1 skip existente.
- `npm run test:configuracion` — PASS: 44/44.
- `npm run test:onboarding` — PASS: 4/4.
- `npm run test:reimpresion` — PASS: 18/18.
- `npm run test:tenant` — PASS: 8 aprobadas, 1 skip existente.
- `npm run test:p0-01:verifier` — PASS: 10/10.
- `npm run test:p0-01:plan` — PASS: 4/4.
- `npm run test:rules` — PASS; las denegaciones `PERMISSION_DENIED` son casos
  negativos esperados y las Rules no cambiaron.
- `npm run e2e:p0-01` — PASS en `demo-p0-01-e2e`: cero errores de consola o
  página y cero respuestas 401, 403 o 404.
- `git diff --check` — PASS.

## Cierre

`APROBADO PARA MERGE`. El merge queda condicionado únicamente a que la CI de
GitHub termine completamente en verde y sin checks pendientes. No se autoriza
despliegue ni escritura productiva como parte de este PR.
