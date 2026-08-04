# Goal activo — MVP comercial SaaS multi-tenant

## Identidad estable

- **Goal:** `G-MVP-01`
- **Resultado:** Cualquier tenant puede operar la primera versión comercial del SaaS de forma segura, íntegra, recuperable y reusable; Café Atrato permanece como primer tenant de referencia.
- **Estado:** ACTIVO
- **Inicio formal:** 2026-08-01
- **Rama base al adoptar:** `main @ f66016e`
- **Fuente de alcance inicial:** `BACKLOG-EJECUTABLE-MVP-CAFE-ATRATO.md`, prioridad P0.

## Alcance del Goal

Incluye los resultados necesarios para que el SaaS pueda venderse a múltiples
tenants y para certificar, cuando corresponda, el canal de cada tenant:

- tenant, Trial, acceso y configuración operativa certificados;
- ventas DEMO durante Trial y readiness fiscal condicional para operación FISCAL;
- venta, inventario, compras y tesorería bajo autoridad de servidor consistente;
- cobros, anulaciones, cuentas financieras, cuentas por cobrar y turnos certificados;
- impresión y canal de caja productivo cuando el tenant lo requiera;
- recuperación de Firestore comprobada;
- prueba integral y preparación de la primera versión comercial.

P1, P2 y P3 permanecen en backlog salvo aprobación explícita de cambio de
alcance. El portal SaaS ya integrado se considera parte de la baseline técnica;
su existencia no autoriza nuevas ampliaciones fuera del MVP. Café Atrato se
utiliza como tenant de referencia, pero no define la arquitectura ni la oferta.

Los Milestones M1–M4 reorganizan la prioridad del MVP reusable. P0-02 conserva
su gate fiscal para operación FISCAL/productiva, mientras ADR-SAAS-020 habilita
la operación DEMO no fiscal sin datos del cliente ni escrituras productivas.
ADR-SAAS-021 admite P0-12 como trabajo del núcleo transaccional y mantiene la
autoridad única server-side para compras.

## Milestones y Epics

### M1 — Fundación SaaS y Trial listos para operar — COMPLETADO

Resultado: cualquier tenant puede provisionarse, acceder al Trial y resolver su
configuración operativa sin depender de datos fiscales reales.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E1.1 Tenant operativo | Empresa, administrador, membresía, claims, configuración, módulos y espacios certificados. | P0-01 | COMPLETADO |
| E1.2 Readiness fiscal | Identidad, impuestos, numeración y asignación vigentes; decisión DIAN registrada. | P0-02, P0-09 | CONDICIONAL |

### M2 — Núcleo transaccional íntegro — EN PROGRESO

Resultado: venta, stock, tesorería, cuentas y turnos mantienen sus invariantes ante operación y reintento.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E2.1 Venta server-authoritative | La segunda fase de venta no depende de transacciones críticas del cliente. | P0-03 | COMPLETADO |
| E2.2 Compatibilidad financiera | Todas las rutas usan cuentas válidas del tenant sin IDs históricos funcionales. | P0-05 | COMPLETADO |
| E2.3 Cobro y anulación | Efectivo, transferencia, mixto, crédito y anulación certificados sin duplicados. | P0-04 | COMPLETADO |
| E2.4 Turnos y arqueo | Apertura, relevo, cierre ciego y movimientos coinciden. | P0-06 | COMPLETADO |
| E2.5 Compras e inventario operativos | Compra, ledger de inventario, costo y efecto financiero se confirman bajo autoridad única server-side. | P0-12 | ACTIVO |

### M3 — Canal productivo y recuperación — PENDIENTE

Resultado: el canal de caja acordado imprime, se distribuye cuando aplique y puede recuperarse de una pérdida controlada.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E3.1 Impresión física | Venta y reimpresión generan ticket correcto en hardware real. | P0-07 | PENDIENTE |
| E3.2 Distribución de caja | Electron queda certificado si es el canal elegido. | P0-08 | CONDICIONAL |
| E3.3 Recuperación | Restauración Firestore comprobada y documentada. | P0-10 | COMPLETADO |
| E3.4 Recuperación de acceso | Administrador y operadores recuperan credenciales mediante autoridad server-side, activación segura, auditoría e idempotencia. | P0-11 | COMPLETADO |

### M4 — Certificación comercial — PENDIENTE

Resultado: la cadena venta → inventario → caja → turno → ticket → recuperación pasa en un entorno representativo, la documentación está alineada y la integración final en `main` está verde.

| Epic | Resultado | Estado |
|---|---|---|
| E4.1 Certificación integral | Evidencia completa del recorrido operativo y decisiones condicionales. | PENDIENTE |
| E4.2 Release readiness | Auditoría final aprobada, CI verde y versión comercial preparada. | PENDIENTE |

## Definition of Done del Goal

Este Goal se marca `COMPLETADO` solo cuando:

- todos los Milestones anteriores están cerrados;
- los criterios P0 aplicables están demostrados;
- las decisiones condicionales de canal físico, Electron y fiscalidad están
  resueltas y documentadas para cada tenant o canal comercial aplicable;
- arquitectura, ADR, código y documentación coinciden;
- todas las pruebas requeridas y la certificación integral pasan;
- todos los PR tienen auditoría `APROBADO PARA MERGE`;
- la CI de `main` está completamente verde;
- todo el alcance está integrado en `main`;
- el SaaS está listo para una primera operación comercial multi-tenant y Café
  Atrato puede utilizarse como tenant de referencia.

## Estado vivo

> Esta sección solo se actualiza ante un evento oficial: merge de un PR, aprobación de un ADR o cambio de planificación aprobado. Mantén los seis campos; no agregues diarios, narrativas ni listas paralelas durante la implementación.

- **Progreso:** ADR-SAAS-013, ADR-SAAS-014, ADR-SAAS-015, ADR-SAAS-016, ADR-SAAS-017, ADR-SAAS-018, ADR-SAAS-019 y ADR-SAAS-020 aceptados; PR #157 integrado en `main @ 6df0c75` con `CrearSuscripcionTrial`, verificador read-only y smoke E2E reutilizable; PR #159 integrado en `main @ 2a0d508` con el plan SaaS genérico `mvp_comercial` y su validación local reusable; PR #161 integrado en `main @ 43d1faf` con la resolución canónica de capacidades del Plan para la configuración B1; PR #163 integrado en `main @ dbe7c41` con el smoke E2E de P0-01 alineado al Plan, validación de PWA/POS y exclusión de `shifts`; PR #165 integrado en `main @ 32c7aa1` con la Fase 2 de ventas server-authoritative, idempotencia, auditoría, transacción Admin SDK y prueba E2E local; PR #167 integrado en `main @ 0ac5b23` con la eliminación de la escritura financiera legacy desde cliente, inicialización financiera solo lectura y smoke E2E de Finanzas en PWA y Backoffice; PR #168 integrado en `main @ 4297457` con la certificación manual de P0-01, evidencia productiva read-only y cierre de E1.1; PR #170 integrado en `main @ 341b4fe` con ventas DEMO no fiscales durante Trial, elegibilidad reusable, autoridad server-side, idempotencia, auditoría, Fase 2 operativa y separación de evidencia fiscal; PR #172 integrado en `main @ 0df10d3` con `shifts` incorporado al plan SaaS genérico `mvp_comercial`; PR #174 integrado en `main @ f7ccf60` con ADR-SAAS-017 aceptado y P0-11/E3.4 incorporado a la planificación; PR #175 formaliza ADR-SAAS-018, cuya implementación de notificaciones queda para un PR posterior separado; PR #176 integrado en `main @ b9e969d` con recuperación segura de credenciales de administrador y operadores, activación temporal one-shot, revocación de sesiones, evidencia fuera de banda, auditoría e idempotencia; PR #178 integrado en `main @ 714aebd` con ADR-SAAS-019 aceptado y sus invariantes canónicas de cuentas; PR #179 integrado en `main @ ac0e0cd` con resolución financiera tenant-aware por `empresaId + claveOperativa`, rechazo de IDs físicos, aislamiento, idempotencia, auditoría y pruebas reutilizables; PR #181 integrado en `main @ d2571a1` con certificación reusable en Emulator del ciclo multi-tenant de turnos, venta DEMO, egreso, faltante, sobrante, relevo, cierre, replay y evidencia en CI; PR #182 integrado en `main @ c15adeb` con exportación/importación separadas de Firestore y Auth Emulator, fixtures de dos tenants, login restaurado, huella íntegra, aislamiento multi-tenant y evidencia de restauración en CI; PR #183 integrado en `main @ 55bc16e` con liquidación server-authoritative de cuentas por cobrar, idempotencia, auditoría, separación DEMO/FISCAL y reversión auditable; en producción, el plan, el Trial de 30 días y los ocho módulos aprobados están materializados; P0-01 está certificado, la ruta DEMO está validada localmente y su verificador automatizado, smoke local y evidencia manual están en PASS. P0-02 sigue condicionado a datos fiscales reales; P0-04/E2.3 está integrado y no requiere datos fiscales reales ni escrituras productivas para su alcance DEMO; P0-06/E2.4 y P0-10/E3.3 están completados. P0-07/E3.1 tiene el transporte técnico integrado y requiere hardware real y P0-08/E3.2 depende de la decisión de canal y P0-07, mientras P0-09 depende de P0-02 y la decisión fiscal. PR #184 integrado en `main @ 7ceffda` con transporte reutilizable de impresión para venta y reimpresión, fallback PWA, formatos 58/80 mm, reimpresión DEMO segura y escape HTML. El transporte técnico queda integrado; la certificación física de P0-07/E3.1 sigue requiriendo hardware real. PR #185 integrado en `main @ 360d9b4` con la sincronización del estado `BLOQUEADO` de E3.1 y su condición externa.
- **Estado:** ACTIVO.
- **PR completados:** PR #147, PR #149, PR #151, PR #153, PR #155, PR #157, PR #159, PR #161, PR #163, PR #165, PR #167, PR #168, PR #170, PR #172, PR #174, PR #175, PR #176, PR #178, PR #179, PR #181, PR #182 y PR #183, PR #184 — reconciliación, cierre documental, referencia vigente de ADR-SAAS-013, tooling de certificación P0-01, comando Trial para una Empresa existente, plan SaaS genérico reusable del MVP con `shifts`, capacidades del Plan disponibles para la configuración B1, smoke E2E P0-01 alineado a la oferta y navegación aprobadas, Fase 2 de ventas server-authoritative, eliminación de escrituras financieras legacy desde el cliente, certificación manual del tenant real, ventas DEMO no fiscales durante Trial, aceptación de ADR-SAAS-017 y su planificación como P0-11/E3.4, aceptación de ADR-SAAS-018 para eventos operativos confiables, recuperación segura de credenciales de administrador y operadores, aceptación de ADR-SAAS-019, compatibilidad financiera tenant-aware, certificación reusable P0-06 de turnos y arqueo multi-tenant con Emulator, certificación reusable P0-10 de exportación/importación de Firestore y Auth Emulator con fixtures multi-tenant y huella de restauración, y liquidación server-authoritative de cuentas por cobrar con reversión auditable. Las notificaciones se mantienen separadas para un PR posterior. El PR #184 añade transporte reutilizable de impresión con fallback PWA y pruebas de seguridad del renderer. El PR #185 sincroniza el estado bloqueado de P0-07 por dependencia de hardware y canal.
- **Siguiente PR esperado:** `P0-12 / E2.5 — implementar compras operativas server-authoritative`; no requiere impresora, datos fiscales, hardware ni producción. P0-07/E3.1 permanece como certificación condicional del canal físico y P0-02/P0-09 como gate fiscal condicional.
- **Milestone activo:** `M2 — Núcleo transaccional íntegro`.
- **Epic activo:** `E2.5 — Compras e inventario operativos`.

P0-07/E3.1 requiere una impresora térmica real y la decisión operativa del
canal de caja, pero esa dependencia no bloquea el desarrollo reusable del SaaS.
P0-12 puede ejecutarse íntegramente con Emulator y conserva separadas las
certificaciones físicas y fiscales.

La provisión productiva aprobada, la verificación automatizada y la evidencia manual de login, resolución del tenant y visibilidad de UI/Rules completan P0-01/E1.1. La ruta DEMO permite evaluar el POS durante el Trial sin datos fiscales ficticios. P0-04/E2.3 quedó integrado sobre la autoridad server-side aprobada por ADR-SAAS-020, sin cambios en Rules, Bootstrap, migraciones ni producción. ADR-SAAS-021 fue aceptado y abre P0-12/E2.5 para migrar compras al backend sin depender de datos fiscales, hardware ni producción. P0-07/E3.1 continúa como certificación física condicional y P0-02/E1.2 como gate fiscal independiente para la futura operación FISCAL.
