# Goal — G-SAAS-01: Plataforma SaaS comercial operable

## Identidad estable

- **Goal:** `G-SAAS-01`
- **Resultado:** operar comercialmente el SaaS multi-tenant con un contrato anual manual, Trial controlado, lifecycle server-side, evidencia contractual inmutable y el plano de operadores autorizado, sin ampliar el alcance aprobado.
- **Estado:** COMPLETADO
- **Inicio formal:** 2026-08-12
- **Rama base al adoptar:** `main @ 6ded075`
- **Fuente de alcance:** `G-SAAS-01-PRODUCT-DECISION-RESOLUTION.md`, aprobada por el Product Owner y conservada en este repositorio.

## Alcance aprobado

MT-U9 queda limitado a la operación comercial inicial del plan inclusivo:

- cobro anual manual confirmado únicamente por un operador SaaS autorizado;
- nueva versión `ANUAL` de `mvp_comercial`, preservando intacta la versión mensual histórica;
- snapshot contractual inmutable de cada nueva Suscripción, con identidad y versión del Plan, código, periodicidad, precio, moneda, capacidades, límites, una Sede conceptual, fiscalidad opcional y fechas contractuales;
- Trial de 30 días, sin cambio de Plan durante Trial y suspensión inmediata al finalizar sin pago confirmado;
- reactivación mediante confirmación manual y periodo anual calculado server-side;
- cancelación programada al final del periodo pagado, sin pérdida anticipada de acceso;
- sin archivado ni eliminación automática de tenants o datos;
- catálogo canónico de capacidades: `sell`, `inventory`, `purchases`, `clientes`, `finanzas`, `reservas`, `waste`, `shifts`, `cuentas_cobro`.

Fuera de alcance: billing automático, Wompi como billing SaaS, Sede técnica,
múltiples Sedes, MT-U10, MT-U11, límites cuantitativos, overages, paquetes de
facturación electrónica, referidos, offline, notificaciones y eliminación
automática de datos.

## Milestone y Epics

### MT-U9 — Contrato y operación comercial inicial — COMPLETADO

| Epic | Resultado | Estado |
|---|---|---|
| E9.1 Contrato comercial y snapshot | Product Decision preservada, ADR-SAAS-028 aceptado y contrato de Suscripción versionado sin mutación retroactiva. | COMPLETADO |
| E9.2 Plan anual y Trial | `mvp_comercial` conserva su versión mensual y obtiene versión `ANUAL`; Trial de 30 días sin cambio de Plan ni gracia. | COMPLETADO |
| E9.3 Cobro y lifecycle manual | Confirmación anual manual, reactivación server-side, suspensión por vencimiento y cancelación al final del periodo. | COMPLETADO |
| E9.4 Operación y certificación | Panel de operadores, auditoría, Rules, pruebas y evidencia de la operación comercial inicial. | COMPLETADO |

## Definition of Done de G-SAAS-01

El Goal solo termina cuando E9.1–E9.4 están implementados o certificados,
documentación y ADR están alineados, las pruebas y auditorías pasan, la CI de
`main` está verde y el contrato anual puede operarse sin billing automático,
sin mutar snapshots históricos y sin ampliar MT-U9.

## Estado vivo

- **Progreso:** PR #243 aceptó e integró el contrato y ADR-SAAS-028; PR #244 implementó E9.1–E9.4 y quedó integrado en `main @ ca2c20c`. La CI post-merge quedó verde con tipos, builds, Rules, Functions, Emulator y E2E. La oferta anual queda fijada en `1.800.000 COP` y la versión mensual histórica permanece intacta.
- **Estado:** COMPLETADO.
- **PR completados:** #243, #244.
- **Siguiente PR esperado:** ninguno para MT-U9; la activación de la oferta en un entorno concreto es una operación manual mediante los comandos canónicos y no una migración automática.
- **Milestone activo:** ninguno; `MT-U9 — Contrato y operación comercial inicial` está COMPLETADO.
- **Epic activo:** ninguno; `E9.1`–`E9.4` están COMPLETADOS.

## Baseline histórica

El contenido que sigue conserva la evidencia histórica de `G-MVP-01`. Sus
Milestones, Epics, PR y estados no son trabajo pendiente ni autorización para
ampliar el nuevo Goal.

## Identidad estable

- **Goal:** `G-MVP-01`
- **Resultado:** Cualquier tenant puede operar la primera versión comercial del SaaS de forma segura, íntegra, recuperable y reusable; Café Atrato permanece como primer tenant de referencia.
- **Estado:** COMPLETADO
- **Inicio formal:** 2026-08-01
- **Rama base histórica al adoptar:** `main @ 0958181`
- **Fuente de alcance inicial:** `BACKLOG-EJECUTABLE-MVP-CAFE-ATRATO.md`, prioridad P0.

## Estado actual post-MVP (2026-08-11)

- **ACTUAL:** `G-MVP-01` está COMPLETADO en la línea base funcional de cierre del MVP (`main @ 65a9fb85d9159eb949ffaf18c5a99ed6377b1554`). La reconciliación documental posterior quedó integrada por PR #241.
- **ACTUAL:** M1, M2, M3 y M4/E4.2 están COMPLETADOS; la CI post-merge de `main` está verde.
- **ACTUAL:** B3-026/B3-027 están COMPLETADOS. El cierre productivo autorizado eliminó únicamente los cuatro objetivos allowlisted y no requiere nuevas ejecuciones.
- **ACTUAL:** Web/PWA es la única superficie soportada. Electron/P0-08 está RETIRADO; sus referencias se conservan solo como historial.
- **ACTUAL:** no existe Milestone, Epic ni PR funcional activo del Goal. Fiscalidad/DIAN y la validación física de hardware son capacidades condicionadas o actividades operativas no bloqueantes; Wompi, notificaciones y offline siguen en backlog.

La cronología y los estados intermedios que aparecen más abajo son **HISTÓRICOS** y se conservan como evidencia de decisiones, implementaciones y cierres. No deben interpretarse como trabajo pendiente ni como autorización para abrir una nueva fase.

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
la capacidad fiscal condicional para operación FISCAL/productiva, mientras
ADR-SAAS-020 habilita la operación DEMO no fiscal sin datos del cliente ni
escrituras productivas.
ADR-SAAS-021 admite P0-12 como trabajo del núcleo transaccional y mantiene la
autoridad única server-side para compras.
ADR-SAAS-022 acepta un catálogo mínimo tenant-aware de proveedores para P1-03,
sin crédito, cuentas por pagar, fiscalidad, migraciones ni dependencia de Café
Atrato.

ADR-SAAS-023 acepta la frontera server-authoritative para operaciones de salón
y cocina, con idempotencia, concurrencia segura y máquina de estados válida;
su implementación P1-04 quedó integrada en `main` mediante el PR #192.

La decisión de producto vigente clasifica P0-07/E3.1 como capacidad técnica
COMPLETADA para Web/PWA: el navegador usa el diálogo estándar y el PC aporta el
driver de la impresora. La prueba con un equipo térmico concreto es una validación
operativa posterior y NO BLOQUEANTE. P1-02 ya quedó integrado como certificación
reusable con Emulator, CI y fixtures multi-tenant.

## Milestones y Epics

### M1 — Fundación SaaS y Trial listos para operar — COMPLETADO

Resultado: cualquier tenant puede provisionarse, acceder al Trial y resolver su
configuración operativa sin depender de datos fiscales reales.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E1.1 Tenant operativo | Empresa, administrador, membresía, claims, configuración, módulos y espacios certificados. | P0-01 | COMPLETADO |
| E1.2 Readiness fiscal | Capacidad opcional de identidad, impuestos, numeración y asignación cuando un tenant decide operar FISCAL/DIAN. | P0-02, P0-09 | CONDICIONAL / NO BLOQUEANTE |

### M2 — Núcleo transaccional íntegro — COMPLETADO

Resultado: venta, stock, tesorería, cuentas y turnos mantienen sus invariantes ante operación y reintento.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E2.1 Venta server-authoritative | La segunda fase de venta no depende de transacciones críticas del cliente. | P0-03 | COMPLETADO |
| E2.2 Compatibilidad financiera | Todas las rutas usan cuentas válidas del tenant sin IDs históricos funcionales. | P0-05 | COMPLETADO |
| E2.3 Cobro y anulación | Efectivo, transferencia, mixto, crédito y anulación certificados sin duplicados. | P0-04 | COMPLETADO |
| E2.4 Turnos y arqueo | Apertura, relevo, cierre ciego y movimientos coinciden. | P0-06 | COMPLETADO |
| E2.5 Compras e inventario operativos | Compra, ledger de inventario, costo y efecto financiero se confirman bajo autoridad única server-side. | P0-12, P1-01, P1-03 | COMPLETADO |

### M3 — Canal productivo y recuperación — COMPLETADO

Resultado: el canal de caja acordado imprime, se distribuye cuando aplique y puede recuperarse de una pérdida controlada.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E3.1 Impresión física | Venta y reimpresión generan tickets Web/PWA compatibles con 58/80 mm; la validación con hardware concreto es operativa y no bloqueante. | P0-07 | COMPLETADO |
| E3.2 Distribución de caja | Web/PWA es la única superficie soportada; Electron queda retirado. | P0-08 | COMPLETADO |
| E3.3 Recuperación | Restauración Firestore comprobada y documentada. | P0-10 | COMPLETADO |
| E3.4 Recuperación de acceso | Administrador y operadores recuperan credenciales mediante autoridad server-side, activación segura, auditoría e idempotencia. | P0-11 | COMPLETADO |

### Línea paralela aprobada — núcleo POS reusable — COMPLETADO

Resultado: las variantes de producto que consumen insumos mantienen sus
snapshots comerciales, inventario e idempotencia bajo la autoridad server-side,
sin depender de hardware, fiscalidad ni producción.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E2.6 Recetas y modificadores | La venta DEMO con receta y modificadores conserva el snapshot comercial y descuenta los insumos correctos de forma tenant-aware. | P1-02 | COMPLETADO |

### Línea paralela — operaciones de salón — COMPLETADA

Resultado propuesto: salón, cuentas múltiples, comandas y cocina operan de forma
concurrente, tenant-aware e idempotente, reutilizando la autoridad server-side
existente y sin depender de hardware ni de datos fiscales reales.

| Epic | Resultado | Backlog | Estado |
|---|---|---|---|
| E2.7 Salón y cocina | Certificación reusable de cuentas, mesas, comandas y transiciones de cocina. | P1-04 | COMPLETADO |

### M4 — Certificación comercial — COMPLETADO

Resultado: la cadena venta → inventario → caja → turno → ticket → recuperación pasa en un entorno representativo, la documentación está alineada y la integración final en `main` está verde.

| Epic | Resultado | Estado |
|---|---|---|
| E4.1 Certificación integral | Evidencia completa del recorrido operativo y decisiones condicionales. | COMPLETADO |
| E4.2 Release readiness | Auditoría final, CI verde y decisión de comercialización Web/PWA con capacidades tenant-specific explícitas. | COMPLETADO |

## Definition of Done del Goal

Este Goal se marca `COMPLETADO` solo cuando:

- todos los Milestones anteriores están cerrados;
- los criterios P0 aplicables están demostrados;
- el canal Web/PWA y la compatibilidad de impresión 58/80 mm están demostrados;
  la validación de hardware concreto queda como actividad operativa no bloqueante;
- la fiscalidad/DIAN está documentada como capacidad tenant-specific condicional,
  sin ser requisito para operar el POS DEMO/operativo;
- arquitectura, ADR, código y documentación coinciden;
- todas las pruebas requeridas y la certificación integral pasan;
- todos los PR tienen auditoría `APROBADO PARA MERGE`;
- la CI de `main` está completamente verde;
- todo el alcance está integrado en `main`;
- el SaaS está listo para una primera operación comercial multi-tenant y Café
  Atrato puede utilizarse como tenant de referencia.

## Estado histórico — G-MVP-01 (no es fuente activa)

> Esta sección solo se actualiza ante un evento oficial: merge de un PR, aprobación de un ADR o cambio de planificación aprobado. Mantén los seis campos; no agregues diarios, narrativas ni listas paralelas durante la implementación.

- **Progreso:** ADR-SAAS-013, ADR-SAAS-014, ADR-SAAS-015, ADR-SAAS-016, ADR-SAAS-017, ADR-SAAS-018, ADR-SAAS-019, ADR-SAAS-020 y ADR-SAAS-021 aceptados; PR #157 integrado en `main @ 6df0c75` con `CrearSuscripcionTrial`, verificador read-only y smoke E2E reutilizable; PR #159 integrado en `main @ 2a0d508` con el plan SaaS genérico `mvp_comercial` y su validación local reusable; PR #161 integrado en `main @ 43d1faf` con la resolución canónica de capacidades del Plan para la configuración B1; PR #163 integrado en `main @ dbe7c41` con el smoke E2E de P0-01 alineado al Plan, validación de PWA/POS y exclusión de `shifts`; PR #165 integrado en `main @ 32c7aa1` con la Fase 2 de ventas server-authoritative, idempotencia, auditoría, transacción Admin SDK y prueba E2E local; PR #167 integrado en `main @ 0ac5b23` con la eliminación de la escritura financiera legacy desde cliente, inicialización financiera solo lectura y smoke E2E de Finanzas en PWA y Backoffice; PR #168 integrado en `main @ 4297457` con la certificación manual de P0-01, evidencia productiva read-only y cierre de E1.1; PR #170 integrado en `main @ 341b4fe` con ventas DEMO no fiscales durante Trial, elegibilidad reusable, autoridad server-side, idempotencia, auditoría, Fase 2 operativa y separación de evidencia fiscal; PR #172 integrado en `main @ 0df10d3` con `shifts` incorporado al plan SaaS genérico `mvp_comercial`; PR #174 integrado en `main @ f7ccf60` con ADR-SAAS-017 aceptado y P0-11/E3.4 incorporado a la planificación; PR #175 formaliza ADR-SAAS-018, cuya implementación de notificaciones queda para un PR posterior separado; PR #176 integrado en `main @ b9e969d` con recuperación segura de credenciales de administrador y operadores, activación temporal one-shot, revocación de sesiones, evidencia fuera de banda, auditoría e idempotencia; PR #178 integrado en `main @ 714aebd` con ADR-SAAS-019 aceptado y sus invariantes canónicas de cuentas; PR #179 integrado en `main @ ac0e0cd` con resolución financiera tenant-aware por `empresaId + claveOperativa`, rechazo de IDs físicos, aislamiento, idempotencia, auditoría y pruebas reutilizables; PR #181 integrado en `main @ d2571a1` con certificación reusable en Emulator del ciclo multi-tenant de turnos, venta DEMO, egreso, faltante, sobrante, relevo, cierre, replay y evidencia en CI; PR #182 integrado en `main @ c15adeb` con exportación/importación separadas de Firestore y Auth Emulator, fixtures de dos tenants, login restaurado, huella íntegra, aislamiento multi-tenant y evidencia de restauración en CI; PR #183 integrado en `main @ 55bc16e` con liquidación server-authoritative de cuentas por cobrar, idempotencia, auditoría, separación DEMO/FISCAL y reversión auditable; en producción, el plan, el Trial de 30 días y los ocho módulos aprobados están materializados; P0-01 está certificado, la ruta DEMO está validada localmente y su verificador automatizado, smoke local y evidencia manual están en PASS. P0-02 sigue condicionado a datos fiscales reales; P0-04/E2.3 está integrado y no requiere datos fiscales reales ni escrituras productivas para su alcance DEMO; P0-06/E2.4 y P0-10/E3.3 están completados. P0-07/E3.1 tiene el transporte técnico integrado y requiere hardware real y P0-08/E3.2 depende de la decisión de canal y P0-07, mientras P0-09 depende de P0-02 y la decisión fiscal. PR #184 integrado en `main @ 7ceffda` con transporte reutilizable de impresión para venta y reimpresión, fallback PWA, formatos 58/80 mm, reimpresión DEMO segura y escape HTML. El transporte técnico queda integrado; la certificación física de P0-07/E3.1 sigue requiriendo hardware real. PR #185 integrado en `main @ 360d9b4` con la sincronización del estado `BLOQUEADO` de E3.1 y su condición externa.
  PR #211 integrado en `main @ 3c27a13` tras auditoria `APROBADO PARA MERGE`, CI completamente verde y Vercel verde; E4.2-CI-001 convierte Operator Portal y R1-A Web/PWA en gates obligatorios, genera evidencia reusable y mantiene reservas/Wompi y los gates externos fuera de alcance.
  PR #212 integrado en `main @ 86221c6` tras auditoria `APROBADO PARA MERGE`, CI completamente verde y Vercel verde; B3-A amplía el inventario dry-run read-only de Eventos legacy con referencias y objetos Storage, evidencia determinista con hashes y sin tokens crudos, detección de assets compartidos y huérfanos, y verificación Emulator sin escrituras.
- **Estado:** COMPLETADO.
> **Reconciliación histórica (2026-08-12):** la mención anterior de P0-08/E3.2 como dependiente de canal o hardware queda supersedida por la decisión Web/PWA-only y PR #224; P0-08 no es trabajo ejecutable. B3-027 está cerrado y sus evidencias fueron reconciliadas por PR #238/#239.
> La fuente de verdad posterior a la decisión de producto es la clasificación vigente documentada al final de esta sección: la capacidad técnica del MVP Web/PWA está completa; la validación física de impresión es operativa y no bloqueante; fiscalidad/DIAN es tenant-specific y condicional; reservas/Wompi queda en backlog futuro.
  PR #209 integrado en `main @ 6f51ce5` tras auditoria `APROBADO PARA MERGE` y CI completamente verde; alinea el contrato y la evidencia de E4.2, cierra los seguimientos ya resueltos de Storage y del plan maestro, y mantiene como pendientes reales las superficies no cubiertas y los gates externos.
  PR #211 integrado en `main @ 3c27a13` con E4.2-CI-001; Operator Portal y R1-A Web/PWA quedan cubiertos por CI como release gates obligatorios, con evidencia reusable y sin escrituras productivas.
  E4.2 registra como completada la ejecución productiva controlada de B3-027: el preflight final confirmó `safeToExecute=true`, el recovery fue verificado antes de borrar y el journal registra exactamente cuatro targets `ELIMINADO`. La evidencia externa conserva plan, recovery, journal y hashes; el asset excluido permanece intacto.
  El release gate de E4.2 está cerrado para el MVP Web/PWA; Storage, el plan maestro y las suites de aislamiento siguen siendo barreras contra regresiones.
  PR #205 quedo integrado en `main @ 87bd651` tras auditoria `APROBADO PARA MERGE` y CI completamente verde. E4.2-SEC-002A actualiza `next` a 16.3.0 y deja las vulnerabilidades productivas criticas y altas en cero; permanecen siete moderadas de cadenas legacy de uuid/tooling, documentadas fuera de alcance por requerir cambios mayores incompatibles.
  PR #203 quedo integrado en `main @ e881d2b` tras auditoria `APROBADO PARA MERGE` y CI completamente verde. PR #205 completo la actualizacion de Next a 16.3.0. E4.2-SEC-002 queda mitigado mediante actualizaciones compatibles reproducibles en `package-lock.json`; permanecen documentados los riesgos residuales de cadenas legacy de tooling.
  PR #197 quedó integrado en `main @ b3098ce` con B2 de Eventos tenant-aware: resolución pública server-side `slug → empresaId`, lectura únicamente de eventos activos del tenant resuelto, exclusión de legacy sin `empresaId`, aislamiento multi-tenant, integración en landing, casos negativos y certificación Emulator/CI.
  PR #187 quedó integrado en `main @ fae007a` tras auditoría `APROBADO PARA MERGE` y CI completamente verde.
  PR #186 quedó integrado en `main @ 50c3866` con compras server-authoritative, snapshots comerciales, ledger, costo, inventario, efecto financiero, idempotencia, auditoría y CI completamente verde.
  PR #188 quedó integrado en `main @ 6298e81` con ADR-SAAS-022 aceptado para el catálogo tenant-aware de proveedores y sus invariantes de snapshots, estado enum y desactivación segura.
  PR #189 quedó integrado en `main @ 119e898` con el catálogo tenant-aware reusable de proveedores, estado enum, aislamiento Rules, resolución por `empresaId + proveedorId`, snapshots históricos, idempotencia de compras y desactivación segura sin mutación de históricos.
  PR #190 quedó integrado en `main @ 9e58ef4` con la certificación reusable de P1-02/E2.6: snapshot de receta y modificadores, consumo transaccional de insumos, ledger, auditoría, idempotencia y aislamiento multi-tenant en Emulator/CI; la corrección de orden transaccional no cambió la autoridad server-side ni las Rules.
  PR #191 quedó integrado en `main @ 09688c1` con P1-07: CI como release gate, lint ejecutable, preflight seguro de Auth/Firestore/Functions Emulator, suites operativas integradas y smoke E2E P0-01 con evidencia; ADR-SAAS-023 quedó aceptado.
  PR #192 quedó integrado en `main @ 86d97d1` con P1-04/E2.7: operaciones de salón y cocina server-authoritative, tenant-aware, idempotentes, transaccionales, auditadas y con máquina de estados sin regresiones; las escrituras directas del cliente permanecen denegadas por Rules.
  PR #193 quedó integrado en `main @ 67c873d` con E4.1: certificación integral reusable del núcleo SaaS/POS en Emulator/CI, evidencia JSON automática, aislamiento multi-plataforma de emuladores y registro explícito de gates externos pendientes.
  PR #194 quedó integrado en `main @ 91d9e5b` con E4.2: auditoría de release readiness, contrato y runner de evidencia solo lectura, CI conectado, decisión de release CONDICIONAL y registro de cinco seguimientos técnicos y seis gates externos pendientes. ADR-SAAS-024 fue aceptado con el modelo de Storage completamente tenant-aware; su ejecución queda separada en PR A / P2-03 (Storage) y PR B posterior (Eventos tenant-aware), sin mezclar fronteras ni modificar Firestore en PR A.
   PR #195 quedó integrado en `main @ f5200ab` con PR A / P2-03: contrato tenant-aware de Firebase Storage, `storage.rules` deny-by-default, aislamiento por `empresaId`, rutas nuevas para productos y assets públicos, Storage Emulator/CI, evidencia automática y cierre del seguimiento de Storage de E4.2. ADR-SAAS-025 fue aceptado y PR #196 quedó integrado en `main @ 6428f93` con B1: contrato Firestore tenant-aware de Eventos, aislamiento administrativo por tenant, consultas filtradas, servicio, UI administrativa, índice y pruebas multi-tenant. PR #197 quedó integrado en `main @ b3098ce` con B2: lectura pública contextualizada por slug, resolución server-side, aislamiento multi-tenant, exclusión de legacy, integración de landing y certificación Emulator/CI. PR #199 quedó integrado en `main @ 7af0c2b` con B3-A: inventario legacy read-only, manifiesto de mapeos explícitos, clasificación determinista, evidencia con hash y certificación Emulator/CI sin escrituras. PR #201 quedó integrado en `main @ 5ac0ec7` con B3-B: backfill idempotente y transaccional solo en Emulator, preservación de snapshots, replay no-op, aislamiento de conflictos y evidencia automática sin escrituras productivas. PR #207 quedó integrado en `main @ 4e3151a` con soporte de Application Default Credentials para ejecutar B3-A read-only contra un proyecto configurado, además de estabilización del smoke P0-01/E4.1; no se realizaron escrituras productivas. El cierre productivo de B3-027 se completó posteriormente mediante el operador autorizado y quedó documentado por PR #235; la preparación read-only de PR #207 se conserva como antecedente histórico.
 - **PR completados:** PR #147, PR #149, PR #151, PR #153, PR #155, PR #157, PR #159, PR #161, PR #163, PR #165, PR #167, PR #168, PR #170, PR #172, PR #174, PR #175, PR #176, PR #178, PR #179, PR #181, PR #182 y PR #183, PR #184, PR #193, PR #194, PR #195, PR #196, PR #197, PR #199, PR #201, PR #203, PR #204, PR #205 y PR #207, PR #224, PR #226, PR #229, PR #230, PR #231, PR #232, PR #233, PR #235 y PR #236 — incluye B3-B de Eventos tenant-aware con backfill Emulator-only, idempotencia, preservación de snapshots y evidencia sin escrituras productivas, además del cierre productivo B3-027 exacto y documentado. El cierre productivo de B3 queda cerrado; los gates externos restantes continúan explícitos.
  PR #186 actualizó el contrato de compras y quedó integrado en `main @ 50c3866`; PR #187 quedó integrado en `main @ fae007a` con la primitiva canónica reusable del ledger para venta, compra, ajustes y mermas, apertura lazy, secuencia, saldo, replay, aislamiento tenant-safe y certificación de Rules. PR #189 quedó integrado en `main @ 119e898` con el catálogo tenant-aware reusable de proveedores y la integración segura con compras.
  PR #188 quedó integrado en `main @ 6298e81` con ADR-SAAS-022 aceptado; el catálogo tenant-aware de proveedores y la integración de compras forman el alcance de P1-03.
  PR #189 quedó integrado en `main @ 119e898`; P1-03 y E2.5 quedan completados.
  PR #211 queda añadido a los PR completados: E4.2-CI-001 integra Operator Portal y R1-A Web/PWA como gates obligatorios, con evidencia automatica, aislamiento de emuladores y sin escrituras productivas.
  PR #212 queda añadido a los PR completados: B3-A integra el inventario read-only de assets Storage de Eventos, sin inferencia de tenant, sin migración y sin escrituras productivas; CI y Vercel quedaron completamente en verde.
  PR #224 queda añadido a los PR completados como unidad canónica de migración: integra los 14 golden tickets sintéticos de #216 y el retiro definitivo de Electron de #222; CI, E4.1, E4.2, Vercel y el gate post-merge de `main` quedaron en verde.
  PR #226 quedó añadido a los PR completados: ADR-SAAS-026 fue aceptado y el mecanismo de cierre controlado y recuperable de Eventos legacy quedó integrado y certificado en Emulator/CI, con allowlist estricta, journal, recovery, idempotencia y `productionWrites: false`. PR #229 quedó integrado con ADR-SAAS-027 aceptado y el operador productivo independiente B3-027, protegido por proyecto/bucket fijos, manifiesto externo exacto, recovery, journal, precondiciones por objetivo y confirmación interactiva fuera de CI. La ejecución autorizada del 2026-08-11 eliminó exactamente el Evento legacy y los tres assets del allowlist; la evidencia permanece fuera de Git. PR #235 quedó integrado en `main @ 73cacf4` con la corrección de validación JSON del recovery y el cierre técnico/documental de B3-027; PR #236 reconcilió este estado en la documentación y quedó integrado en `main @ 9c725b0`; ambas CI post-merge terminaron en verde. PR #230 quedó integrado como sincronización documental posterior; PR #231 reconcilió el estado de release del dry-run B3-026, PR #232 alineó el SHA vivo del Goal con `main` y PR #233 registró el estado posterior.
  - **Siguiente unidad recomendada:** no existe otra unidad funcional del Goal. Las validaciones físicas, la activación fiscal por tenant y reservas/Wompi son decisiones o actividades posteriores no bloqueantes; notificaciones y offline permanecen en backlog.
  - **Milestone activo:** ninguno; `M1`, `M2`, `M3` y `M4` están COMPLETADOS para el alcance del MVP Web/PWA.
    - **Epic activo:** ninguno. `E4.2 — Release readiness` está COMPLETADO: CI de `main`, Operator Portal, R1-A Web/PWA, E4.1 y el cierre B3-027 están verdes y documentados. `E3.1` está COMPLETADO técnicamente para impresión Web/PWA 58/80 mm; la prueba con hardware físico queda como validación operativa NO BLOQUEANTE. `E1.2/P0-02` y `P0-09` son capacidades fiscales CONDICIONADAS por tenant, y `P1-09` queda en BACKLOG.

 P0-07/E3.1 ya dispone del transporte Web/PWA y de layouts 58/80 mm. El navegador
 usa el diálogo estándar y el PC aporta el driver de la impresora; probar un equipo
 térmico concreto es una validación operativa posterior y NO bloquea el MVP.
P0-12 puede ejecutarse íntegramente con Emulator y conserva separadas las
certificaciones físicas y fiscales.

La provisión productiva aprobada, la verificación automatizada y la evidencia manual de login, resolución del tenant y visibilidad de UI/Rules completan P0-01/E1.1. La ruta DEMO permite evaluar el POS durante el Trial sin datos fiscales ficticios. P0-04/E2.3 quedó integrado sobre la autoridad server-side aprobada por ADR-SAAS-020, sin cambios en Rules, Bootstrap, migraciones ni producción. ADR-SAAS-021, P0-12/E2.5, P1-01 y P1-03 quedaron integrados; compras, proveedores, costos, snapshots e idempotencia están certificados de forma reusable. P0-07/E3.1 está completado técnicamente para Web/PWA 58/80 mm; la validación física de un equipo concreto es operativa y no bloqueante. P0-02/E1.2 y P0-09 quedan condicionados a que cada tenant decida activar fiscalidad.

La línea paralela E2.6/P1-02 quedó integrada sin modificar la autoridad de
ventas ni las Rules: certifica el contrato existente mediante una venta DEMO,
snapshot de receta y modificadores, consumo transaccional de insumos, ledger,
aislamiento tenant e idempotencia. P1-04/E2.7 quedó integrado sobre ADR-SAAS-023
con operaciones de salón/cocina server-authoritative, idempotencia, auditoría,
transacciones y máquina de estados sin regresiones. E4.2 quedó integrado sobre
su runner de readiness, con capacidades condicionales documentadas y sin bloqueos
para el MVP Web/PWA. PR A
/ P2-03 quedó integrado con el contrato seguro de Firebase Storage y su
certificación tenant-aware. B1, B2, B3-A y B3-B de Eventos tenant-aware quedaron integrados bajo ADR-SAAS-025; ADR-SAAS-026 y PR #226 integraron el mecanismo de cierre controlado y recuperable. B3-027 ejecutó después el cierre productivo autorizado de los cuatro targets exactos; el journal, recovery y evidencia externa quedaron verificados, y el asset excluido permanece intacto. PR #235 integró el cierre técnico/documental y la corrección del round-trip JSON del recovery en `main @ 73cacf4`, con CI post-merge verde.
> **Decisión vigente (2026-08-11, tras merge del PR #224):** el producto se distribuye únicamente como Web/PWA. Electron, su empaquetado y P0-08 quedan retirados; las referencias históricas se conservan como trazabilidad y no representan una superficie soportada.
