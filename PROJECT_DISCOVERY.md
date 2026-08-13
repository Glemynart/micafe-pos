# Project Discovery — MiCafe POS

Estado: `VIGENTE` para `origin/main @ 3a02dbbd4cafcc9dfd716859c29ba18d1839c3d7` (2026-08-13).

## Stack verificado

- Next.js 16, React 19, TypeScript 5.7 y Tailwind.
- Firebase Web SDK y Firebase Admin SDK.
- Cloud Functions for Firebase v2 con Node 22.
- Firestore Rules y Storage Rules.
- Node test runner vía `tsx`, Firebase Emulator Suite y Playwright para E2E.
- Vercel para la aplicación web; Functions se despliegan mediante Firebase CLI según `functions/README.md`.

## Arquitectura operativa

- Web/PWA es el canal soportado.
- Empresa/Tenant es la frontera de aislamiento.
- Espacio es una unidad operativa interna y no equivale a Sede técnica.
- Claims son proyección; membresía y lifecycle son autoridades canónicas.
- Operaciones críticas de ventas, compras, caja, turnos, finanzas y lifecycle
  pasan por Functions/Admin SDK con idempotencia y auditoría. Las mutaciones de
  stock de catálogo y mermas siguen siendo una frontera histórica pendiente de
  ADR/cutover; no se presentan como backend-only hasta aceptar esa decisión.
- El cliente lee la configuración por su provider/callable; `configuraciones/{empresaId}` está bloqueada en Rules.

## Entry points relevantes

- `app/(tenant)/pos/page.tsx`: módulos POS y permisos.
- `functions/src/bootstrap/service.ts`: provisioning empresarial.
- `functions/src/configuracion/service.ts`: configuración canónica.
- `functions/src/onboarding/service.ts`: readiness y onboarding.
- `functions/src/platform/queries.ts`: diagnóstico de operadores.
- `functions/src/finanzas/callables.ts`: efectos financieros server-authoritative.
- `firestore.rules` y `storage.rules`: frontera de seguridad del cliente.
- `docs/goals/GOAL-MVP-COMERCIAL.md`: Goal vivo.
- `docs/goals/G-SAAS-02-TRIAL-OPERATIONS.md`: runbook del Trial.

## Verificación documental

- G-SAAS-01 y ADR-SAAS-028 están integrados en `main`.
- G-SAAS-02 queda formalizado como Goal activo.
- `SECURITY.md` y este plan describen el modelo SaaS actual.
- Fiscalidad es tenant-specific y condicional; DEMO no requiere datos fiscales.
- MT-U10 y MT-U11 no son dependencias del primer Trial.
- Wompi, reservas públicas, offline y notificaciones permanecen fuera de alcance.

## Límites de evidencia

- CI, Emulator y E2E no demuestran por sí solos despliegue productivo.
- La existencia de un tenant no demuestra onboarding ni operación real.
- Un tenant DEMO puede operar con fiscalidad y numeración pendientes, siempre que la readiness operativa esté completa.
- Hardware de impresión requiere validación con el dispositivo del cliente cuando aplique.
- La recuperación productiva requiere evidencia específica antes del Trial.
