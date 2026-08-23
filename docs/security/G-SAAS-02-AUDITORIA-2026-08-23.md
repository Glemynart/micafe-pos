# G-SAAS-02 — Auditoría operativa y de seguridad 2026-08-23

## Alcance y base

- **SHA auditado:** `d2b8cdeb94c0c1513a85dfeae61765e2c092c437` (`origin/main`).
- **PR #355:** abierto, detrás de `main`, checks verdes; propone `ADR-SAAS-037` y no autoriza implementación.
- **P1-09:** PR #351 fusionado en `96a1a3c32ab5d547a00a93e9df686c7e73e02258`; capacidad pública de reservas/Wompi `DISABLED / FAIL CLOSED`.
- **Scan Codex Security:** `6c0ba85e-4375-487f-af8d-e3a5292f90ab`, Standard, un finding MEDIUM real, confianza alta. Los artefactos canónicos permanecen en el directorio temporal del scan y no contienen secretos.
- **Regla de modelo:** `empresaId` es la frontera de seguridad. `espacioId` es dimensión operativa/analítica; no representa una Sede y no se implementa multi-sede.

No se ejecutaron despliegues, pagos, escrituras productivas, configuración de secretos, smoke contra un tenant real ni recuperación productiva.

## Estado por módulo

| Superficie | Estado técnico | Evidencia o pendiente |
|---|---|---|
| Onboarding, empresa, administrador, membresía, claims y configuración | Implementado y probado de forma reusable | Certificación del tenant real pendiente (`P0-01`). |
| Productos, inventario, kardex y mermas | Server-authoritative y tenant-aware | Functions, Rules y Emulator verdes; certificación con datos aprobados pendiente (`P1-01`). |
| Compras, proveedores y costos | Server-authoritative, snapshots e idempotencia | Tests de Functions verdes; recorrido con tenant real pendiente (`P0-12`, `P1-03`). |
| Ventas/POS y fiscalidad | DEMO server-authoritative; fiscalidad condicional | Autoridad de precio, snapshots y efectos financieros probados; certificación comercial pendiente (`P0-03`, `P0-04`). |
| Caja, turnos, egresos y cuentas financieras | Resolución por `empresaId + claveOperativa`, ledger e idempotencia | Tests financieros y E2E de turnos verdes; arqueo real pendiente (`P0-05`, `P0-06`). |
| Clientes, crédito, cobranza e historial | Rutas tenant-aware y cobro server-side | Certificación con casos aprobados pendiente (`P1-05`). |
| Salón, comandas y cocina | Server-authoritative, concurrente e idempotente | E2E Emulator multi-tenant verde (`P1-04`). |
| Reservas internas | Server-authoritative y separada de reservas públicas | Functions, agenda y replay cubiertos; no se activa Wompi. |
| Administración, operadores, permisos y auditoría | Integrado; membresías conservan autoridad | Hallazgo abierto en lectura global de perfiles (`ADR-SAAS-037`). |
| Rules y Storage | Tenant-aware y fail-closed | Rules y Storage Emulator verdes; reconciliación productiva del SHA sigue siendo gate de release. |
| Recovery y soporte | Herramientas y guards implementados | Restore observable y ensayo productivo pendientes (`P0-10`). |
| Impresión Web/PWA 58/80 mm | Capacidad técnica integrada | Hardware concreto es validación operativa no bloqueante (`P0-07`). |

## Seguridad y triage

### MEDIUM real — perfiles globales de usuarios

Un usuario autenticado puede leer cualquier `usuarios/{uid}` y listar `usuarios` porque `firestore.rules` mantiene `allow read: if esAutenticado()`. La suite de Rules lo reproduce explícitamente. El impacto es exposición cross-tenant de PII y potenciales `fcmTokens`; no se demostró modificación de perfiles ajenos, acceso financiero ni escalada de privilegios.

La remediación propuesta está en `ADR-SAAS-037` y PR #355: proyección mínima tenant-aware escrita por backend, Rules por `empresaId` y membresías como autoridad de roles/permisos. No se modifica esta frontera hasta que el ADR sea aprobado.

### Controles revisados sin nuevo hallazgo

- Egresos y compras resuelven la cuenta dentro de la transacción por tenant y clave operativa; el cliente no aporta IDs físicos como autoridad.
- Ventas y fiscalidad rechazan montos, snapshots o efectos financieros no autoritativos; replay e aislamiento están cubiertos.
- Hold público responde fail-closed cuando la feature, la clave pública o el secreto de integridad no están configurados.
- No existe una ruta vigente `app/api/debug-tokens`; no se encontraron secretos crudos en la superficie revisada.
- Storage impide lectura/escritura cross-tenant de assets privados y escritura anónima de contenido público.

## Prioridades y bloqueadores

### P0

- **Internos verificables:** cerrar la matriz de certificación comercial de `P0-01`, `P0-03`, `P0-04`, `P0-05` y `P0-06` con evidencia del tenant aprobado.
- **Externos:** `P0-10` requiere operador autorizado y un entorno de recovery aprobado.
- **Condicionales:** `P0-02` y `P0-09` solo si el cliente exige fiscalidad real; `P0-07` depende de hardware concreto y no bloquea la capacidad Web/PWA.
- `P0-11` y `P0-12` están implementados y cubiertos por pruebas automatizadas; su evidencia de tenant/release sigue separada.

### P1

- `P1-01`, `P1-02`, `P1-03` y `P1-04` tienen cobertura reusable; falta certificación con el primer tenant cuando aplique.
- `P1-05`, `P1-06` y `P1-07` requieren cerrar aceptación funcional y trazabilidad de rutas.
- `P1-08` permanece fuera del Trial actual por decisión de alcance.
- `P1-09` permanece deshabilitado por gates externos y no se activa sin autorización.
- `ADR-SAAS-037` es un bloqueo arquitectónico explícito, no una autorización implícita de implementación.

### P2/P3

Notificaciones completas, paginación general, reconciliación offline, billing SaaS, multi-sede, reservas públicas pagadas y otras ampliaciones permanecen en backlog o fuera del Goal. No se convierten en alcance por esta auditoría.

### Gates externos bloqueados

`DEPLOYMENT AUTHORIZATION REQUIRED`, `WOMPI SECRET CONFIGURATION REQUIRED`, `WAF EVIDENCE REQUIRED`, `TENANT AUTHORIZATION REQUIRED` y `PRODUCTIVE WINDOW REQUIRED`.

## Validaciones ejecutadas

- `npx tsc --noEmit` — PASS.
- `npm run lint` — PASS.
- `npm run build` — PASS.
- `npm run build:functions` — PASS.
- `npm run test:auth-foundation` — PASS: 306 passed, 3 skipped, 0 failed.
- Suites de tenant, membresías, configuración, onboarding, fiscalidad, finanzas, inventario, proveedores, reservas, compras, tickets y reimpresión — PASS; skips declarados por las propias suites.
- `npm run test:rules` — PASS, incluidas denegaciones cross-tenant esperadas.
- `npm run test:storage-rules` — PASS: 7/7.
- `npm run e2e:p0-06` — PASS.
- `npm run e2e:p1-02` — PASS.
- `npm run e2e:p1-04` — PASS.
- Codex Security Standard scan `6c0ba85e-4375-487f-af8d-e3a5292f90ab` — 1 MEDIUM real, sin nuevos hallazgos financieros, fiscales, Storage, hold público o debug.

## Próxima unidad ejecutable

1. Mantener `P1-09` y `ADR-SAAS-037` bloqueados hasta recibir sus decisiones/evidencias externas correspondientes.
2. Preparar la certificación local reutilizable de la matriz `P0-01 → P0-06` sin datos productivos ni secretos.
3. Con autorización del tenant, ejecutar únicamente la certificación aprobada y registrar evidencia independiente.
4. Continuar con release/recovery y Trial real; el Goal permanece `ACTIVO` hasta completar el Trial de 30 días y su cierre contractual.
