# Goal activo — MVP comercial de Café Atrato

## Identidad estable

- **Goal:** `G-MVP-01`
- **Resultado:** Café Atrato puede operar su primera versión comercial de forma segura, íntegra, recuperable y certificada sobre el canal de caja aprobado.
- **Estado:** ACTIVO
- **Inicio formal:** 2026-08-01
- **Rama base al adoptar:** `main @ f66016e`
- **Fuente de alcance inicial:** `BACKLOG-EJECUTABLE-MVP-CAFE-ATRATO.md`, prioridad P0.

## Alcance del Goal

Incluye únicamente los resultados P0 necesarios antes de operar:

- tenant, acceso y configuración real certificados;
- readiness fiscal y decisión sobre factura electrónica;
- venta, inventario y tesorería bajo autoridad de servidor consistente;
- cobros, anulaciones, cuentas financieras y turnos certificados;
- impresión y canal de caja productivo;
- recuperación de Firestore comprobada;
- prueba integral y preparación de la primera versión comercial.

P1, P2 y P3 permanecen en backlog salvo aprobación explícita de cambio de alcance. El portal SaaS ya integrado se considera parte de la baseline técnica; su existencia no autoriza nuevas ampliaciones fuera del MVP.

Los Milestones M1–M4 reorganizan la prioridad P0 sin cambiar su alcance ni su secuencia vigente. El backlog ordena P0-01 y P0-02 antes de los flujos de caja; no existe un cambio de planificación posterior aprobado que sustituya esa secuencia.

## Milestones y Epics

### M1 — Tenant y fiscalidad listos para operar — ACTIVO

Resultado: Café Atrato tiene un tenant real accesible, configuración B1 válida y autoridad fiscal preparada.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E1.1 Tenant operativo | Empresa, administrador, membresía, claims, configuración, módulos y espacios certificados. | P0-01 | COMPLETADO |
| E1.2 Readiness fiscal | Identidad, impuestos, numeración y asignación vigentes; decisión DIAN registrada. | P0-02, P0-09 | ACTIVO |

### M2 — Núcleo transaccional íntegro — PENDIENTE

Resultado: venta, stock, tesorería, cuentas y turnos mantienen sus invariantes ante operación y reintento.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E2.1 Venta server-authoritative | La segunda fase de venta no depende de transacciones críticas del cliente. | P0-03 | COMPLETADO |
| E2.2 Compatibilidad financiera | Todas las rutas usan cuentas válidas del tenant sin IDs históricos funcionales. | P0-05 | COMPLETADO |
| E2.3 Cobro y anulación | Efectivo, transferencia, mixto, crédito y anulación certificados sin duplicados. | P0-04 | PENDIENTE |
| E2.4 Turnos y arqueo | Apertura, relevo, cierre ciego y movimientos coinciden. | P0-06 | PENDIENTE |

### M3 — Canal productivo y recuperación — PENDIENTE

Resultado: el canal de caja acordado imprime, se distribuye cuando aplique y puede recuperarse de una pérdida controlada.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E3.1 Impresión física | Venta y reimpresión generan ticket correcto en hardware real. | P0-07 | PENDIENTE |
| E3.2 Distribución de caja | Electron queda certificado si es el canal elegido. | P0-08 | CONDICIONAL |
| E3.3 Recuperación | Restauración Firestore comprobada y documentada. | P0-10 | PENDIENTE |
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
- las decisiones condicionales P0-08 y P0-09 están resueltas y documentadas;
- arquitectura, ADR, código y documentación coinciden;
- todas las pruebas requeridas y la certificación integral pasan;
- todos los PR tienen auditoría `APROBADO PARA MERGE`;
- la CI de `main` está completamente verde;
- todo el alcance está integrado en `main`;
- Café Atrato está listo para su primera operación comercial y su recuperación.

## Estado vivo

> Esta sección solo se actualiza ante un evento oficial: merge de un PR, aprobación de un ADR o cambio de planificación aprobado. Mantén los seis campos; no agregues diarios, narrativas ni listas paralelas durante la implementación.

- **Progreso:** ADR-SAAS-013, ADR-SAAS-014, ADR-SAAS-015, ADR-SAAS-016, ADR-SAAS-017, ADR-SAAS-018 y ADR-SAAS-019 aceptados; PR #157 integrado en `main @ 6df0c75` con `CrearSuscripcionTrial`, verificador read-only y smoke E2E reutilizable; PR #159 integrado en `main @ 2a0d508` con el plan SaaS genérico `mvp_comercial` y su validación local reusable; PR #161 integrado en `main @ 43d1faf` con la resolución canónica de capacidades del Plan para la configuración B1; PR #163 integrado en `main @ dbe7c41` con el smoke E2E de P0-01 alineado al Plan, validación de PWA/POS y exclusión de `shifts`; PR #165 integrado en `main @ 32c7aa1` con la Fase 2 de ventas server-authoritative, idempotencia, auditoría, transacción Admin SDK y prueba E2E local; PR #167 integrado en `main @ 0ac5b23` con la eliminación de la escritura financiera legacy desde cliente, inicialización financiera solo lectura y smoke E2E de Finanzas en PWA y Backoffice; PR #168 integrado en `main @ 4297457` con la certificación manual de P0-01, evidencia productiva read-only y cierre de E1.1; PR #170 integrado en `main @ 341b4fe` con ventas DEMO no fiscales durante Trial, elegibilidad reusable, autoridad server-side, idempotencia, auditoría, Fase 2 operativa y separación de evidencia fiscal; PR #172 integrado en `main @ 0df10d3` con `shifts` incorporado al plan SaaS genérico `mvp_comercial`; PR #174 integrado en `main @ f7ccf60` con ADR-SAAS-017 aceptado y P0-11/E3.4 incorporado a la planificación; PR #175 formaliza ADR-SAAS-018, cuya implementación de notificaciones queda para un PR posterior separado; PR #176 integrado en `main @ b9e969d` con recuperación segura de credenciales de administrador y operadores, activación temporal one-shot, revocación de sesiones, evidencia fuera de banda, auditoría e idempotencia; PR #178 integrado en `main @ 714aebd` con ADR-SAAS-019 aceptado y sus invariantes canónicas de cuentas; PR #179 integrado en `main @ ac0e0cd` con resolución financiera tenant-aware por `empresaId + claveOperativa`, rechazo de IDs físicos, aislamiento, idempotencia, auditoría y pruebas reutilizables; en producción, el plan, el Trial de 30 días y los siete módulos aprobados están materializados; P0-01 está certificado, la ruta DEMO está validada localmente y su verificador automatizado, smoke local y evidencia manual están en PASS. P0-02 sigue condicionado a datos fiscales reales; P0-06/E2.4 es la siguiente entrega reusable que puede ejecutarse en paralelo sin escrituras productivas.
- **Estado:** ACTIVO.
- **PR completados:** PR #147, PR #149, PR #151, PR #153, PR #155, PR #157, PR #159, PR #161, PR #163, PR #165, PR #167, PR #168, PR #170, PR #172, PR #174, PR #175, PR #176, PR #178 y PR #179 — reconciliación, cierre documental, referencia vigente de ADR-SAAS-013, tooling de certificación P0-01, comando Trial para una Empresa existente, plan SaaS genérico reusable del MVP con `shifts`, capacidades del Plan disponibles para la configuración B1, smoke E2E P0-01 alineado a la oferta y navegación aprobadas, Fase 2 de ventas server-authoritative, eliminación de escrituras financieras legacy desde el cliente, certificación manual del tenant real, ventas DEMO no fiscales durante Trial, aceptación de ADR-SAAS-017 y su planificación como P0-11/E3.4, aceptación de ADR-SAAS-018 para eventos operativos confiables, recuperación segura de credenciales de administrador y operadores, aceptación de ADR-SAAS-019 y compatibilidad financiera tenant-aware. Las notificaciones se mantienen separadas para un PR posterior.
- **Siguiente PR esperado:** `P0-06 / E2.4 — certificar apertura, relevo y cierre de turno con arqueo tenant-aware usando Emulator y fixtures multi-tenant; depende de P0-03 y P0-05 ya integrados, no requiere datos fiscales de Café Atrato ni escrituras productivas, y no adelanta P0-04/E2.3, que mantiene su dependencia explícita de P0-02`.
- **Milestone activo:** `M1 — Tenant y fiscalidad listos para operar`.
- **Epic activo:** `E1.2 — Readiness fiscal`.

La provisión productiva aprobada, la verificación automatizada y la evidencia manual de login, resolución del tenant y visibilidad de UI/Rules completan P0-01/E1.1. La ruta DEMO permite evaluar el POS durante el Trial sin datos fiscales ficticios; el cierre de P0-02/E1.2 sigue condicionado a datos fiscales reales aprobados y confirmación explícita antes de cualquier escritura productiva. P0-05/E2.2 quedó integrado sin migrar ni reescribir cuentas productivas. El siguiente trabajo general válido es P0-06/E2.4: certificar turnos y arqueo con Emulator y fixtures multi-tenant; P0-04/E2.3 permanece secuencialmente condicionado por P0-02.
