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
| E1.1 Tenant operativo | Empresa, administrador, membresía, claims, configuración, módulos y espacios certificados. | P0-01 | ACTIVO |
| E1.2 Readiness fiscal | Identidad, impuestos, numeración y asignación vigentes; decisión DIAN registrada. | P0-02, P0-09 | PENDIENTE |

### M2 — Núcleo transaccional íntegro — PENDIENTE

Resultado: venta, stock, tesorería, cuentas y turnos mantienen sus invariantes ante operación y reintento.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E2.1 Venta server-authoritative | La segunda fase de venta no depende de transacciones críticas del cliente. | P0-03 | PENDIENTE |
| E2.2 Compatibilidad financiera | Todas las rutas usan cuentas válidas del tenant sin IDs históricos funcionales. | P0-05 | PENDIENTE |
| E2.3 Cobro y anulación | Efectivo, transferencia, mixto, crédito y anulación certificados sin duplicados. | P0-04 | PENDIENTE |
| E2.4 Turnos y arqueo | Apertura, relevo, cierre ciego y movimientos coinciden. | P0-06 | PENDIENTE |

### M3 — Canal productivo y recuperación — PENDIENTE

Resultado: el canal de caja acordado imprime, se distribuye cuando aplique y puede recuperarse de una pérdida controlada.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E3.1 Impresión física | Venta y reimpresión generan ticket correcto en hardware real. | P0-07 | PENDIENTE |
| E3.2 Distribución de caja | Electron queda certificado si es el canal elegido. | P0-08 | CONDICIONAL |
| E3.3 Recuperación | Restauración Firestore comprobada y documentada. | P0-10 | PENDIENTE |

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

- **Progreso:** ADR-SAAS-013 aceptado, bloqueos previos a P0-01 reconciliados y verificador read-only de certificación integrado en `main @ ede0a8d`; ningún criterio de datos P0 se da por certificado sin ejecución real.
- **Estado:** ACTIVO.
- **PR completados:** PR #147, PR #149, PR #151 y PR #153 — reconciliación, cierre documental, referencia vigente de ADR-SAAS-013 y tooling read-only reutilizable para P0-01.
- **Siguiente PR esperado:** `P0-01 / E1.1 — certificación de datos iniciales de Café Atrato`.
- **Milestone activo:** `M1 — Tenant y fiscalidad listos para operar`.
- **Epic activo:** `E1.1 — Tenant operativo`.

El siguiente PR está condicionado al acceso controlado a Firebase y a los datos corporativos aprobados. Si esa dependencia impide ejecutarlo, el Goal continúa activo y el bloqueo debe hacerse explícito; no se salta a trabajo fuera de la secuencia sin justificar una ruta independiente hacia el mismo Milestone.
