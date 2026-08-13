# G-SAAS-02 — Auditoría global del POS — 2026-08-13

## Resultado

La auditoría se ejecutó sobre `origin/main` en `54c1d0c4287f8234c16a29d7bbd51fa900d17f74`, en un worktree limpio separado del checkout histórico. El resultado es:

> **NO CERTIFICA todavía el Trial anual ni el cierre de G-SAAS-02.**

El código y la CI cubren técnicamente la mayor parte del POS. Los bloqueos actuales son de preparación productiva y una frontera de autoridad de inventario que requiere decisión arquitectónica explícita; no se justifica esperar sin hacer desarrollo.

## Evidencia consultada

- Goal vivo: `docs/goals/GOAL-MVP-COMERCIAL.md`.
- Runbook contractual: `docs/goals/G-SAAS-02-TRIAL-OPERATIONS.md`.
- ADR vigentes: `ADR-SAAS-028` y `ADR-SAAS-029`.
- Arquitectura: `MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md`, `R1-ARQUITECTURA-OPERACIONES-SERVER-AUTHORITATIVE.md`, `R1-B-DISENO-FUNCIONAL-TECNICO-CAJA-LEDGER.md`.
- Seguridad y backlog: `MASTER-SECURITY-PLAN.md`, `BACKLOG-EJECUTABLE-MVP-CAFE-ATRATO.md`.
- CI post-merge: run `31723759098`, `main`, `54c1d0c`, resultado `success`.
- Producción read-only en `micafe-pos`, tenant `1ae0rD9H8t3ZFSBKrrHR`, observada el `2026-08-13T17:30:18Z`.

No se ejecutaron comandos comerciales ni escrituras productivas durante esta auditoría.

## Estado productivo observado

| Recurso | Estado |
|---|---|
| Empresa | `Cafe Atrato`, `activa`, `CO`, revisión 2 |
| Suscripción raíz | `trialing`, `mvp_comercial` v1, Trial `2026-08-03`–`2026-09-02`, sin snapshot contractual |
| Plan anual | v2 `PUBLICADA`, `ANUAL`, `1.800.000 COP`, exactamente 9 capacidades |
| Configuración efectiva | revisión 3, solo 7 módulos históricos; faltan `shifts` y `cuentas_cobro` |
| Relación anual | 0 documentos; no existe relación contractual materializada |
| Espacios | 6 activos históricos: Alquiler, Artesanías, Cafetería, Consignación, Fotocopias y Librería |
| Membresías | 8 registros; administrador activo y operadores activos/inactivos existentes |
| Functions | 74 activas; callables críticas en Node.js 22, `us-central1`; hash principal desplegado `ce73f42...` |

Esto es consistente con la regla de no reiniciar el Trial: la materialización anual solo puede ocurrir después del cierre canónico del Trial mensual, con el comando de `ADR-SAAS-029`.

## Clasificación funcional

| Superficie | Estado | Hallazgo y alcance |
|---|---|---|
| Provisioning y onboarding | FUNCIONAL | Bootstrap, readiness, configuración B1 y pruebas existen. La Empresa existente requiere la transición contractual posterior, no un nuevo Bootstrap. |
| Planes, suscripciones y lifecycle SaaS | FUNCIONAL | Plan anual, snapshot, relación append-only, vencimiento y pago manual están implementados y probados; falta ejecutar la operación productiva en la ventana válida. |
| Usuarios, membresías y operadores | FUNCIONAL | Autoridad server-side, claims, recuperación y portal de operador cubiertos por tests/CI. |
| Configuración | FUNCIONAL en código / PARCIAL en producción | El resolver admite 9 capacidades, pero la configuración observada conserva 7 hasta la transición anual. |
| Ventas DEMO/FISCAL | COMPLETADO técnico | Checkout y efectos críticos usan callables; FISCAL permanece condicional a datos aprobados del tenant. |
| Inventario y catálogo | PARCIAL | Ventas y compras usan ledger server-side, pero edición de stock de productos/insumos conserva transacciones cliente. Requiere `ADR-SAAS-030` antes de cambiar autoridad y Rules. |
| Compras y proveedores | FUNCIONAL | Alta operativa server-side, snapshots, costos e idempotencia. La reversión compensatoria aún no existe; no se presenta una acción destructiva en la UI. |
| Clientes, crédito e historial | FUNCIONAL | CRUD tenant-aware y liquidación de cuentas de cobro server-side; reportes tienen consultas acotadas por tenant/fecha. |
| Finanzas, caja y turnos | FUNCIONAL | Callables de movimientos, egresos, traslados, cierre y relevo; pruebas de ciclo e idempotencia. |
| Egresos | FUNCIONAL y endurecido | El servicio ya era callable-only; esta iniciativa cierra también `create/update/delete` directo en Rules. |
| Cuentas de cobro | FUNCIONAL | Liquidación y reversión auditables server-side, con tests. |
| Mesas, salón, comandas y cocina | FUNCIONAL | Operaciones server-authoritative, tenant-aware, idempotentes y con E2E de Emulator. |
| Reservas internas | PARCIAL | El flujo POS conserva escrituras cliente autenticadas; requiere revisión de autoridad si se incorpora a operaciones críticas. |
| Reservas públicas y Wompi | SEPARADOS / FUERA DE ALCANCE | Rutas públicas usan Admin SDK y aislamiento por slug/tenant; no se mezclan con el checkout Wompi ni con billing SaaS. |
| Merma y waste | PARCIAL | La UI aplica ledger desde cliente y Rules permiten create administrativo. El cutover completo queda bloqueado por `ADR-SAAS-030`. |
| Reportes | FUNCIONAL con deuda P2 | Resultados tenant-aware y acotados por fechas; paginación/límites históricos quedan para volumen real posterior. |
| Impresión y reimpresión | COMPLETADO técnico | Layouts 58/80 mm, Web/PWA, escape y golden tests; hardware/driver concreto es validación operativa condicional. |
| Fiscalidad | FUNCIONAL condicional | DEMO no requiere datos fiscales; el camino FISCAL existe, pero no se inventan NIT, resolución ni credenciales. |
| Eventos y Storage | COMPLETADO técnico | Aislamiento tenant-aware, rutas públicas y cierre legacy certificados en CI; no pertenecen al Trial POS salvo necesidad explícita. |
| Backoffice, soporte y auditoría | FUNCIONAL técnico / PENDIENTE productivo | Portal, lifecycle, soporte consentido y auditoría existen; faltan evidencia de smoke, recovery y operación sobre el release que abrirá el Trial. |
| Notificaciones y offline | NO IMPLEMENTADO | Fuera del contrato actual del Trial y del alcance aprobado; permanecen en backlog, sin promesa comercial. |
| MT-U10 y MT-U11 | EXCLUIDOS | No son necesarios para el primer cliente real; no se implementan límites, overages, multiempresa por identidad ni selector de tenants. |

## Prioridades resultantes

### P0

No se encontró un P0 técnico nuevo en `origin/main` después de la cobertura existente y la CI verde. El Goal sigue sin certificarse por gates productivos: cierre del Trial mensual, relación anual, configuración efectiva de 9 capacidades, smoke, recovery y operación real de 30 días.

### P1

1. **Rules de egresos:** corregido en esta iniciativa; la única escritura válida queda en `registrarEgresoOperativoV1`.
2. **Inventario/mermas:** deuda real de autoridad. Se redacta `ADR-SAAS-030`; no se cambia silenciosamente la frontera porque R1 sigue en estado `DISEÑO PROPUESTO` para estas operaciones.
3. **Release productivo:** reconciliar SHA de aplicación, hash de Functions, Rules/Storage desplegados, smoke y recuperación antes de iniciar el Trial anual.
4. **Tenant:** después del `2026-09-02`, ejecutar únicamente la secuencia canónica de `ADR-SAAS-029`; nunca editar directamente la raíz mensual ni reiniciar fechas.

### P2 / fuera del Trial

Paginación de reportes, contingencia offline completa, notificaciones completas, reservas públicas/Wompi como producto comercial, límites de consumo y MT-U11 quedan fuera del siguiente paso.

## Cambios técnicos incluidos

- Rules: `egresos` queda backend-only y append-only para clientes.
- Rules tests: se cubren create, update y delete denegados para clientes autenticados.
- UI de Compras: se elimina el diálogo muerto de “Eliminar Compra”, que describía una mutación no implementada y contraria al modelo append-only.
- `PROJECT_DISCOVERY.md` y `MASTER-SECURITY-PLAN.md` se alinean con el SHA actual y la frontera real de inventario.

## Veredicto de auditoría

**NO APROBADO PARA MERGE** hasta ejecutar las validaciones de esta iniciativa y corregir cualquier regresión. La auditoría no bloquea el desarrollo restante; sí impide declarar listo el Trial anual mientras falten los gates productivos y la decisión de arquitectura de inventario.
