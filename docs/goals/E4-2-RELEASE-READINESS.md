# E4.2 — Release readiness

**Goal:** G-MVP-01 — MVP SaaS comercial reusable
**Milestone:** M4 — Certificación comercial
**Epic:** E4.2 — Release readiness
**Fecha de auditoría:** 2026-08-08
**Alcance:** auditoría, evidencia y alineación documental; no cambia el dominio ni el comportamiento del producto.

## Decisión de release

El núcleo SaaS/POS DEMO puede certificarse de forma reusable en Emulator/CI. La
decisión de release es **CONDICIONAL**: el recorrido DEMO/PWA controlado está
respaldado por las certificaciones integradas, pero el Goal completo no puede
declararse terminado mientras permanezcan pendientes los gates externos y los
seguimientos de seguridad indicados en este documento.

Esta distinción evita presentar como listo un producto fiscal, físico o
multicanal que todavía no ha sido probado en esos canales.

## Evidencia disponible

| Área | Evidencia | Resultado |
|---|---|---|
| Núcleo multi-tenant | PR #193 / E4.1 | PASS en Emulator/CI |
| Ventas DEMO | P0-01/P0-04 y autoridades server-side | PASS reusable |
| Compras e inventario | P1-03 / ADR-SAAS-021 | PASS reusable |
| Turnos y arqueo | P0-06 | PASS reusable |
| Salón y cocina | P1-04 / ADR-SAAS-023 | PASS reusable |
| Cuentas por cobrar | P0-12 / ADR-SAAS-020 | PASS reusable |
| CI core | P1-07 y E4.1 | Verde en main |
| Producción | E4.1 | No utilizada por el runner |

## Seguimientos y cierres técnicos

| ID | Hallazgo | Impacto | Acción posterior | ADR |
|---|---|---:|---|---|
| E4.2-SEC-001-STORAGE-RULES | **CERRADO en PR #195:** `storage.rules` está versionado, declarado en `firebase.json` y aplica el contrato tenant-aware. La suite de Storage Emulator está conectada a CI. | Alto | Mantener la suite tenant-aware y la evidencia de aislamiento. | ADR-SAAS-024 aceptado |
| E4.2-SEC-002-DEPENDENCIES | `npm audit` presentaba vulnerabilidades conocidas en raíz y Functions. | Alto | PR #203 y PR #205 integrados; quedan siete moderadas documentadas por requerir cambios mayores incompatibles. | Solo si cambia arquitectura/contrato |
| E4.2-SEC-003-MASTER-PLAN | **CERRADO:** `MASTER-SECURITY-PLAN.md` está vigente y registra la evolución SaaS, Storage tenant-aware y los riesgos residuales sin declararlos mitigados implícitamente. | Alto | Mantenerlo alineado cuando se cierre un riesgo o se integre una nueva frontera. | No |
| E4.2-CI-001-UNCOVERED-SURFACES | Operator Portal y R1-A Web/PWA forman parte del gate; Electron fue retirado por PR #224 y reservas/Wompi permanecen fuera por dependencias externas. Storage cuenta con suite tenant-aware en CI. | Medio/alto | Mantener el seguimiento abierto hasta resolver las dependencias externas de reservas/Wompi. | Según cada frontera |
| E4.2-B3-CLOSURE | **Mecanismo y operador cerrados en PR #226/#229:** ADR-SAAS-026 y ADR-SAAS-027, allowlist estricta, dry-run, recovery, journal, idempotencia y precondiciones por objetivo están implementados y certificados sin escrituras productivas. | Alto | Preparar y ejecutar únicamente el dry-run productivo read-only con el manifiesto externo congelado; detenerse antes de eliminar y solicitar la autorización operativa independiente correspondiente. | ADR-SAAS-026 / ADR-SAAS-027 |

### Evidencia E4.2-SEC-002 - parche compatible de dependencias

El parche de seguridad actualiza unicamente `package-lock.json`, conservando
los rangos declarados en `package.json` y sin cambiar el dominio, las
autoridades server-side, las Rules ni la persistencia. La instalacion limpia
con `npm ci` es reproducible con Node 22 y `firebase-tools` 15.26.0.

El inventario de produccion paso de 21 vulnerabilidades (1 critica, 11 altas y
9 moderadas) a 10 (0 criticas, 3 altas y 7 moderadas) con PR #203. Las actualizaciones
compatibles incluyen DOMPurify, Electron/Electron Builder, electron-updater,
Playwright, PostCSS, Firebase Admin y tooling de Firebase.

Las tres vulnerabilidades altas residuales de la evidencia de PR #203 estaban
ancladas en `next@16.2.4`, sus dependencias anidadas `postcss`/`sharp`, y se
resolvieron en PR #205 fijando `next@16.3.0`. Las moderadas restantes
requieren degradar `firebase-admin`, `firebase-tools` o `exceljs` a versiones
incompatibles. Esas decisiones no se fuerzan en este PR; requieren una
validacion de compatibilidad independiente antes de declararse resueltas.

Validaciones ejecutadas en la rama del parche:

- `npm ci`: PASS.
- `npx tsc --noEmit`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.
- `npm run build:functions`: PASS.
- `npm run test:auth-foundation`: PASS (268 pass, 3 skip, 0 fail).
- `npm run test:backfill`: PASS (19 pass, 0 fail).
- `npm run e2e:b3-eventos-backfill`: PASS en Emulator; `productionWrites:false`.
- `npm run dist`: la compilacion y el empaquetado alcanzan Electron 42.8.1,
  pero Windows rechaza la escritura de la integridad del `.exe` generado con
  error `UNKNOWN`; no forma parte del gate CI de E4.2 y queda como evidencia
  del gate Electron pendiente.

### Evidencia E4.2-SEC-002A - actualizacion de Next y cadena de imagenes

El PR de seguimiento fija `next@16.3.0` y actualiza su cadena compatible de
`postcss`, `sharp` y binarios SWC. No modifica rutas, autoridades server-side,
Rules, persistencia, dominio ni configuracion de produccion. La instalacion
limpia con `npm ci` y Node 22 es reproducible.

Con este cambio `npm audit --omit=dev` queda en 0 vulnerabilidades criticas,
0 altas y 7 moderadas. Las moderadas restantes provienen de cadenas legacy de
`uuid`/tooling y su correccion automatica propone degradaciones incompatibles
de `firebase-admin`, `firebase-tools` o `exceljs`; permanecen documentadas y
fuera de este PR.

Validaciones adicionales de compatibilidad: `npx tsc --noEmit`, `npm run lint`,
`npm run build`, `npm run build:functions`, `npm run test:auth-foundation`,
`npm run test:backfill` y `npm run e2e:b3-eventos-backfill` pasan. El E2E usa
un proyecto demo y no realiza escrituras productivas.

El runner E2E B2 usa `next dev --webpack` de forma explícita. Durante la
validación de CI con Next 16.3.0, Turbopack presentó un panic interno al
recompilar el servidor de desarrollo; fijar Webpack en este runner elimina la
inestabilidad del harness sin cambiar el bundle productivo, las rutas, la
autoridad del servidor ni el contrato tenant-aware.

## Gates externos pendientes

Estos gates no se implementan ni se simulan dentro de E4.2:

- **P0-07/E3.1:** impresora térmica y certificación física.
- **P0-08/E3.2:** cerrado como decisión Web/PWA-only mediante PR #224; Electron no es una superficie soportada.
- **P0-02/E1.2-P0-09:** datos fiscales, DIAN y operación FISCAL.
- **P1-09:** Wompi y reservas públicas en operación comercial.
- **P2-04:** offline y reconciliación.
- **P2-01:** notificaciones FCM, permisos y dispositivos.

## Fuera de alcance

E4.2 no modifica:

- Firestore Rules o Storage Rules;
- funciones Callable, dominio, estados o persistencia;
- Bootstrap o migraciones;
- Electron, impresión física, DIAN, Wompi, offline o notificaciones;
- producción o datos reales de cualquier tenant.

## Criterio de cierre

El PR de E4.2 puede auditarse como **APROBADO PARA MERGE** si su runner no
detecta fallos en el contrato de certificación, todas las pruebas requeridas
están verdes y la documentación conserva explícitamente la decisión
CONDICIONAL y los seguimientos. Esta aprobación no equivale a declarar el Goal
completo: los gates externos se cierran mediante sus propias evidencias.
> **Current channel decision (2026-08-10):** Web/PWA is the only supported distribution surface. Electron and its packaging/runtime gate are retired by product decision; historical references below are preserved as evidence only.
