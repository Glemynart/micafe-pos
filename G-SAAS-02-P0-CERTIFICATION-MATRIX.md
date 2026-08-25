# G-SAAS-02 — Matriz de certificación interna P0-01 → P0-06

Fecha de corte: 2026-08-24
SHA base y `origin/main`: `a568fdace6ace0e873e1879451b0a8c9c1c8f1e0`
Rama: `codex/g-saas-02-p0-certification`
Checkout: `C:\Users\seguc\Downloads\PROYECTOS POS\PROYECTO CAFE-gsaas02-p0-certification`
Worktree histórico ajeno: `C:\Users\seguc\Downloads\PROYECTOS POS\PROYECTO CAFE` (no modificado)

## Alcance y regla de interpretación

Esta matriz certifica evidencia local del contrato P0 canónico del backlog. `empresaId` es la frontera de aislamiento y `membresias` la autoridad de pertenencia; `espacioId` es una dimensión operativa/analítica y no se convierte en Sede. Reservas, mesas, comandas y cocina se registran como capacidad suplementaria P1-04/ADR-SAAS-033, no como sustituto del P0-06 canónico de turnos, arqueo y cierre.

Los estados distinguen evidencia local de activación. `PASS — LOCAL ONLY` no equivale a autorización productiva ni a evidencia de un primer cliente real.

## Matriz P0

| P0 | Capacity | Contract | Code | Functions | Rules | Unit | Emulator | E2E | Production | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P0-01 Onboarding, empresa, administrador, membresía, claims, configuración B1, módulos y espacios | PASS: flujo inicial y configuración B1 disponibles; `espacioId` permanece operativo | PASS: `empresaId`/membresía/claims son la frontera; sin multi-sede | PASS: onboarding, memberships, tenant y configuración revisados | PASS: callable de estado de onboarding y autorización server-side probados | PASS local en Rules/tenant; persiste lectura global de `usuarios` como hallazgo MEDIUM abierto | PASS: verifier, plan y suites de auth/membresías/tenant/configuración | PASS: emuladores limpios | PASS — retry limpio: login, tenant, módulos, Finanzas PWA y Backoffice; primer intento falló por emulador residual | BLOCKED — TENANT AUTHORIZATION / PRODUCTIVE WINDOW | `npm run test:auth-foundation`, `test:tenant`, `test:configuracion`, `test:onboarding`, `test:membresias`, `test:p0-01:verifier`, `e2e:p0-01` | PASS — LOCAL ONLY |
| P0-02 Fiscalidad opcional y operación DEMO/TRIAL | PASS: operación DEMO no depende de fiscalidad activa | PASS: configuración fiscal/numeración es condicional al alcance aprobado | PASS: snapshots y validaciones existentes; escritor DIAN cliente queda fail-closed por Rules | PASS: efectos de venta server-authoritative | PASS local | PASS: suites de configuración y ventas | PASS: pruebas locales relacionadas | No se activó DIAN ni se ejecutó producción | `npm run test:configuracion`, `npm run test:p0-01:plan`, `npm run e2e:p1-02` | PASS — LOCAL ONLY |
| P0-03 Venta server-authoritative, inventario, tesorería, idempotencia y auditoría | PASS: efectos críticos no dependen de transición cliente | PASS: servidor/Functions es autoridad; cliente no fija efectos | PASS: corregido `firestore.rules` para negar update cliente de `ventas` | PASS: Functions de efectos y reconciliación revisadas; sin escritura productiva | PASS: regresión niega `PENDIENTE_EFECTOS → COMPLETO` desde cajero/admin cliente | PASS: Rules, ventas, auth y suites G-SAAS-02 | PASS: Rules Emulator | PASS indirecta mediante P1-02 y suites de venta/idempotencia | BLOCKED — DEPLOYMENT AUTHORIZATION / PRODUCTIVE WINDOW | `npm run test:rules`, `npm run test:p1-02:unit`, `npm run e2e:p1-02`, `npm run build:functions` | PASS — LOCAL ONLY |
| P0-04 Caja, transferencia, mixto, crédito y cancelación sin duplicados | PASS: efectos de pago y cancelación modelados con idempotencia | PASS: medios de pago y ledger son server-authoritative | PASS: servicios y Functions revisados; no se amplió el contrato | PASS: recovery/reconciliación revisados | PASS: cliente no puede alterar saldos/ventas | PASS: suites de tickets/reimpresión y recuperación | PASS: emulator tests | PASS local en suites disponibles; no pagos reales | BLOCKED — PRODUCTIVE WINDOW | `npm run test:tickets`, `npm run test:reimpresion`, `npm run test:g-saas-02:recovery` | PASS — LOCAL ONLY |
| P0-05 Cuentas financieras tenant-aware | PASS: claves operativas incluyen tenant | PASS: nunca cuenta bancaria global fija; `empresaId` se conserva | PASS: resolver tenant-aware revisado en tesorería/Wompi | PASS: reconciliador usa contexto canónico y revalida tenant | PASS local | PASS: reglas y recovery | PASS: emulator tests | PASS local; Wompi deshabilitado | BLOCKED — WOMPI SECRET CONFIGURATION / TENANT AUTHORIZATION | `npm run test:g-saas-02:recovery`, `npm run e2e:p1-04`, revisión de resolver de cuenta | PASS — LOCAL ONLY |
| P0-06 Turnos, apertura, relevo, cierre y arqueo real | PASS: contrato canónico R1-A/R1-B identificado | PASS: P0-06 es turnos/caja; reservas/comandas/cocina son suplementarios | PARTIAL: existe escritor administrativo legacy directo; cierre/relief no se amplió en este corte | PASS: operaciones server-authoritative existentes; migración total del writer pendiente | PASS local, con writers legacy explícitamente acotados | PASS: suites de recuperación y Rules | PASS: `npm run e2e:p0-06` exit 0 | No se abrió ni cerró caja productiva | BLOCKED — TENANT AUTHORIZATION / PRODUCTIVE WINDOW | `npm run e2e:p0-06`, `npm run test:g-saas-02:preflight`, `test:g-saas-02:recovery`, revisión R1-A | PASS — LOCAL ONLY |

## Capacidad suplementaria auditada

| Superficie | Resultado | Evidencia | Límite |
|---|---|---|---|
| P1-04 reservas/salón/mesas/comandas/cocina | PASS — LOCAL ONLY | `npm run e2e:p1-04` (1/1), replay, concurrencia y dos tenants | No convierte `espacioId` en Sede ni cierra P0-06 |
| P1-09 hold público/Wompi | DISABLED / FAIL CLOSED | precio y moneda server-side, monto esperado inmutable, cuenta tenant-aware, webhook validado | No activar: rate limit, WAF, secretos, autorización, ventana productiva y tenant real pendientes |
| Storage B3 | PASS — LOCAL ONLY / separado | Guard emulator-only presente en `origin/main`; evidencia histórica B3 | No se mezcla código B3 en este corte |

## Hallazgos de seguridad que gobiernan la decisión

| ID / estado | Severidad real | Evidencia y decisión |
|---|---:|---|
| `P0-03-RULES-F2-AUTHORITY-001` — corregido en este corte | HIGH | El cliente podía marcar `ventas/{id}` como `COMPLETO` preservando snapshot fiscal. Se eliminó el `allow update` y se añadió regresión en `firestore-rules/role-invariants.test.ts`. |
| `csf_8bb214ae583434dc19716a37` — corregido en código actual | HIGH histórico | Monto Wompi ya deriva de cotización server-side y se verifica en webhook; activación permanece bloqueada. |
| `csf_bf73f435656ece4ec92efbb5` — corregido en código actual | HIGH histórico | Cuenta Wompi ya es tenant-aware; no se activa sin secretos/autorización. |
| `csf_315dceb35b51f89f377496a7` / `csf_a0f567c810adaf46d8a5d8f1` — abierto, condicionado | MEDIUM | Hold público tiene límites estrictos pero no rate limit de aplicación antes de transacción Admin SDK. Feature disabled/fail closed; requiere control y WAF antes de habilitar. |
| `csf_adf4f35149dc8683767bb599` / `csf_79317329808666ebb823ad25` — abierto | MEDIUM | `/usuarios/{uid}` permite lectura a cualquier sesión autenticada. ADR-SAAS-037 está Propuesto; requiere decisión arquitectónica antes de modificar contrato. |
| `csf_863ed88949cb4d6327025324` — stale/false positive actual | N/A | `/api/debug-tokens` no existe en `origin/main` ni en este checkout; no se encontró superficie actual que remediar. |
| `csf_dbd160b74f23770fbaa455ae5` — riesgo operacional | MEDIUM reportado | Service account local no está en el checkout aislado; el worktree histórico podría conservar un archivo ignorado. No se reprodujo ni se eliminó sin autorización; requiere verificación/rotación del propietario. |

## Gates

### PASS local

- Base aislada coincide con `origin/main`; worktree histórico no fue tocado.
- TypeScript, lint, build web y build Functions pasan.
- Rules, Storage Rules, auth, tenant, configuración, onboarding, memberships, verifier, tickets, reimpresión, P1-02, P1-04 y suites G-SAAS-02 pasan.
- E2E P0-01 pasó en retry con emuladores limpios; P0-06, P1-02 y P1-04 pasaron localmente.
- No hubo pagos, escrituras productivas, despliegues, activación Wompi ni cambios de secretos.

### BLOCKED externo

- `DEPLOYMENT AUTHORIZATION REQUIRED`
- `WOMPI SECRET CONFIGURATION REQUIRED`
- `WAF EVIDENCE REQUIRED`
- `TENANT AUTHORIZATION REQUIRED`
- `PRODUCTIVE WINDOW REQUIRED`
- Aprobación de ADR-SAAS-037 para corregir el contrato de perfiles globales.
- Diseño/implementación de rate limit de hold público antes de habilitar P1-09.
- Verificación IAM/rotación del service account local por su propietario.

## Recomendación

`NO APROBADO PARA ACTIVACIÓN/PRIMER CLIENTE` mientras existan los hallazgos MEDIUM abiertos y los gates externos. El corte técnico de Rules, regresión y documentación puede evaluarse para merge de forma independiente si CI queda verde y la auditoría del PR concluye `APROBADO PARA MERGE`; esto no cierra G-SAAS-02 ni autoriza producción.
