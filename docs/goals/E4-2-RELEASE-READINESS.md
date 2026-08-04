# E4.2 — Release readiness

**Goal:** G-MVP-01 — MVP SaaS comercial reusable
**Milestone:** M4 — Certificación comercial
**Epic:** E4.2 — Release readiness
**Fecha de auditoría:** 2026-08-04
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

## Seguimientos técnicos

| ID | Hallazgo | Impacto | Acción posterior | ADR |
|---|---|---:|---|---|
| E4.2-SEC-001-STORAGE-RULES | La app usa Storage para imágenes, pero no hay `storage.rules` versionado ni declaración en `firebase.json`. | Alto | Diseñar y certificar reglas tenant-aware con Emulator. | Sí, si cambia el contrato de autorización |
| E4.2-SEC-002-DEPENDENCIES | `npm audit` presenta vulnerabilidades conocidas en raíz y Functions. | Alto | PR separado de dependencias con validación de compatibilidad. | Solo si cambia arquitectura/contrato |
| E4.2-SEC-003-MASTER-PLAN | El plan maestro todavía describe el producto como single-tenant y en borrador. | Alto | Alinear el documento con el estado SaaS real y conservar riesgos no mitigados. | No |
| E4.2-CI-001-UNCOVERED-SURFACES | Operator Portal, R1A, Electron, Storage y reservas/Wompi no forman parte del gate core. | Medio/alto | Abrir gates o PRs separados según el alcance comercial aprobado. | Según cada frontera |

## Gates externos pendientes

Estos gates no se implementan ni se simulan dentro de E4.2:

- **P0-07/E3.1:** impresora térmica y certificación física.
- **P0-08/E3.2:** decisión de canal Electron/PWA.
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
