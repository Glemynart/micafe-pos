# E4.2 — Release readiness

**Goal:** G-MVP-01 — MVP SaaS comercial reusable
**Milestone:** M4 — Certificación comercial
**Epic:** E4.2 — Release readiness
**Fecha de auditoría:** 2026-08-08
**Alcance:** auditoría, evidencia y alineación documental; no cambia el dominio ni el comportamiento del producto.

## Decisión de release

El MVP SaaS/POS Web/PWA está **COMPLETADO y listo para comercialización** en su
alcance operativo. El recorrido DEMO y las operaciones server-authoritative están
respaldados por las certificaciones integradas en Emulator/CI, y `main` está verde.

Las capacidades que dependen de una decisión del tenant no bloquean esta release:

- P0-07/E3.1 tiene transporte Web/PWA y layouts POS de 58/80 mm; el navegador usa
  su diálogo estándar y el PC aporta el driver. La prueba física de un modelo
  concreto es una validación operativa posterior.
- P0-02/P0-09 habilitan fiscalidad/DIAN únicamente cuando el tenant decide usarla y
  proporciona sus datos. No son requisitos para vender DEMO ni para operar el POS.
- P1-09 (reservas públicas/Wompi) queda fuera del MVP actual y pasa a backlog de
  una fase posterior.

Esta clasificación no simula una impresora, no inventa datos fiscales y no presenta
reservas/Wompi como capacidades certificadas.

> **Estado vivo (2026-08-12):** `main @ 6a018e32164796bb0e33669dcf83efe5cad38b31`
> tiene CI post-merge completamente verde. B3-027 y ADR-SAAS-026/027 están
> cerrados; Electron/P0-08 permanece retirado. E4.2 queda cerrado para el MVP
> Web/PWA, con validaciones físicas y capacidades fiscales tenant-specific
> registradas como condiciones no bloqueantes.

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
| E4.2-CI-001-UNCOVERED-SURFACES | Operator Portal y R1-A Web/PWA forman parte del gate; Electron fue retirado por PR #224. Storage cuenta con suite tenant-aware en CI; reservas/Wompi queda fuera del MVP y en backlog. | Medio/alto | Mantener estas suites como barrera contra regresiones; no abrir trabajo de reservas/Wompi dentro de E4.2. | Según cada frontera |
| E4.2-B3-CLOSURE | **Cerrado en la ejecución B3-027 del 2026-08-11 y PR #235:** ADR-SAAS-026 y ADR-SAAS-027, allowlist estricta, preflight, recovery, journal, idempotencia y precondiciones por objetivo quedaron verificados; se eliminaron exactamente 1 Evento legacy y 3 assets autorizados. | Alto | Mantener el allowlist congelado y conservar la evidencia productiva fuera del repositorio. | ADR-SAAS-026 / ADR-SAAS-027 |

### Evidencia de ejecución productiva B3-027

La ejecución se realizó únicamente contra `micafe-pos` y
`micafe-pos.firebasestorage.app`, con el manifiesto canónico
`61a2fadfec3a67975a975309f1c04bb8f93dd652b6c6529bb4f5553193d52fe5`. El
journal registra cuatro estados `ELIMINADO` y ningún target adicional. La
carpeta de evidencia, el recovery y sus hashes se conservan fuera del
repositorio en `B3-027-PRODUCTION-EXECUTION-20260811`.

La verificación read-only posterior confirmó la ausencia de los cuatro targets
y la permanencia del asset excluido `eventos/1781122906272-gzhck1.png`. El
verificador de recovery fue corregido para aceptar el round-trip JSON de
timestamps Firestore; las pruebas B3 siguen en verde y no se realizaron nuevas
escrituras. PR #235 integró esta corrección, PR #236 reconcilió el estado de
E4.2 y PR #237 alineó la documentación con el estado vivo de `main @ fabcf65`;
las CI post-merge terminaron completamente en verde.

> **Nota de vigencia:** el inventario y las actualizaciones descritos en esta
> sección son evidencia histórica de la auditoría anterior al retiro de
> Electron por PR #224. No representan dependencias ni gates activos del
> producto Web/PWA.

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
- **Evidencia histórica pre-PR #224:** `npm run dist` alcanzaba Electron
  42.8.1, pero Windows rechazaba la escritura de la integridad del `.exe`
  generado con error `UNKNOWN`. Este resultado ya no es un gate vigente:
  Electron fue retirado y la certificación actual se limita a Web/PWA.

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

## Condiciones operativas y capacidades posteriores

Estos elementos no se implementan ni se simulan dentro de E4.2 y no bloquean la
release del MVP Web/PWA:

- **P0-07/E3.1 — NO BLOQUEANTE:** validación física de una impresora térmica
  concreta; la compatibilidad técnica Web/PWA 58/80 mm ya está integrada.
- **P0-08/E3.2 — COMPLETADO:** Web/PWA-only mediante PR #224; Electron no es una
  superficie soportada.
- **P0-02/E1.2-P0-09 — CONDICIONADO:** datos fiscales, DIAN y operación FISCAL
  solo si el tenant los activa.
- **P1-09 — BACKLOG:** Wompi y reservas públicas para una fase posterior.
- **P2-04 — BACKLOG:** offline y reconciliación.
- **P2-01 — BACKLOG:** notificaciones FCM, permisos y dispositivos.

## Fuera de alcance

E4.2 no modifica:

- Firestore Rules o Storage Rules;
- funciones Callable, dominio, estados o persistencia;
- Bootstrap o migraciones;
- Electron, impresión física, DIAN, Wompi, offline o notificaciones;
- producción o datos reales de cualquier tenant.

## Criterio de cierre

E4.2 queda **COMPLETADO** cuando el runner no detecta fallos en el contrato de
certificación, todas las pruebas requeridas están verdes y la documentación
clasifica explícitamente las capacidades condicionales y los seguimientos no
bloqueantes. La validación física, la activación fiscal de un tenant y el trabajo
de reservas/Wompi no se convierten en gates globales del Goal.
> **Current channel decision (2026-08-10):** Web/PWA is the only supported distribution surface. Electron and its packaging/runtime gate are retired by product decision; historical references below are preserved as evidence only.
