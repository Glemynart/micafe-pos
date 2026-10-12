# G-SAAS-02 / M2 / E2.2 — Gate H: compra y efectivo sin turno (2026-10-11, Bogotá)

## Dictamen

`GATE_H_REVALIDATION = PARTIAL / NOT CLOSED`. La compra, las ventas y sus
efectos canónicos de staging quedaron conciliados. La discrepancia `NaN` de
**Mis ventas** se corrigió en staging al actualizar únicamente la callable de
consulta; la misma venta ahora presenta los valores de recibido/cambio
correctamente. Gate H continúa parcial porque la convergencia viva ADR-SAAS-069
quedó observada para disponibilidad del vendedor, pero no para la bandeja admin;
el replay remoto tras pérdida de respuesta sigue `NOT EXECUTED`. Gate I continúa
bloqueado; esta matriz no autoriza producción ni escrituras reales.

## Identidad y base comprobada

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **Proyecto remoto:** `micafe-pos-staging`.
- **Tenant:** `E2_2-BODEGA-STAGING-FIXTURE`, sintético.
- **Compra y venta por transferencia:** preview autenticado de PR #551; su código
  quedó integrado
  en `main @ 89a2ab71486860d353ebf164cc7129a48747be5e`. CI post-merge de #551,
  run `38161620488`, terminó `success` sobre ese merge SHA.
- **Efectivo sin turno:** PR #554 integró ADR-SAAS-068 en
  `main @ aa9edd011c506402166012145b9e4c14ce159144`; Gate D desplegó las 17
  Functions de `saas-bodega` en staging con el candidato `main @ 6abf832`.
  PR #557 documentó ese deploy y se integró después como documentación en
  `main @ b736bd87d036748eac2ce218ccb29e77f6f64b4e`; no modificó código.
- **Documentación posterior:** PR #552 integró la evidencia de compra en
  `main @ eac24593a3e2b2bca069338081e8896435383ec0`; al registrar esta
  actualización, su CI post-merge seguía en curso. #552 no contiene cambios de
  aplicación; la evidencia funcional de abajo corresponde al código de #551.
- **Certificación integral anterior:**
  [`Gate H 2026-10-10`](G-SAAS-02-E2-2-GATE-H-CERTIFICATION-2026-10-10.md),
  sobre `main @ 8293e10cbee51d66fa5f7e13166f704b078797d1`.
- **Entornos excluidos:** producción y tenant real no se consultaron ni
  modificaron.

## Matriz actualizada

| Superficie | Estado vigente | Evidencia / límite |
|---|---|---|
| Aislamiento tenant, roles y payloads | PASS heredado | La matriz anterior mantiene sus pruebas Emulator A/B y lecturas autenticadas del fixture; esta repetición no amplió accesos ni tenants. |
| Solicitud, aprobación y confirmación canónica | PASS revalidado | Las solicitudes sintéticas aprobadas por admin fueron confirmadas por el vendedor mediante `confirmarVentaBodegaV1`; transferencia y efectivo sin turno se reportan por separado. |
| Compras Bodega | PASS | Una compra autorizada de 1 unidad por `$1.000 COP` produjo recibo y auditoría `CONFIRMADO`, ledger `compra +1`, sin transacción financiera al no seleccionar cuenta de pago. Véase [Gate F — conciliación de compra](G-SAAS-02-E2-2-GATE-F-PURCHASE-RECONCILIATION-2026-10-11.md). |
| Disponibilidad antes de la venta por transferencia | PASS | En el escenario de transferencia, después de la compra había 3 unidades base físicas, 0 reservadas y 3 disponibles. La presentación sintética consume 2 unidades base. |
| Venta por transferencia, inventario y finanzas | PASS revalidado | Una venta por transferencia de `$5.000 COP`: un recibo canónico, índice de idempotencia, auditoría `CONFIRMADO`, movimiento de inventario `-2` y transacción de ingreso `+5.000 COP`; estado `pagada`/`COMPLETO`, `turnoId=null`. El stock bajó de 3 a 1, reservado 0. No se repitió el comando tras confirmar el estado. Véase [Gate G — revalidación posterior a compra](G-SAAS-02-E2-2-GATE-G-POST-PURCHASE-REVALIDATION-2026-10-11.md). |
| Turno, arqueo y auditoría del recorrido previo | PASS heredado | La evidencia Gate G anterior conserva dos ventas en efectivo vinculadas a turno, cierre cuadrado por `$10.000 COP`, diferencia `$0` y recibo/auditoría confirmados. Ni la venta de transferencia ni la de efectivo sin turno se atribuyeron a ese cierre. |
| Competencia de stock | PASS heredado | Se conserva la evidencia previa de staging: una venta aceptada y la competidora rechazada sin sobreventa. La venta por transferencia consumió las 2 unidades disponibles restantes tras la compra; el escenario de efectivo se preparó después con un ajuste positivo separado. |
| Agenda, reserva y vencimiento | PASS heredado | Se conserva la observación previa de reserva, consumo y liberación natural; la prueba actual no modificó agendas ni reservas. |
| Aviso push de solicitud | PASS limitado heredado | Se conserva la recepción sintética reportada por el responsable. Sonido y notificación nativa universal de Windows no son garantías. |
| Bandeja/stock sin refresco manual | PARTIAL | La disponibilidad de la presentación del vendedor convergió `0` → `1` sin refrescar tras un ajuste administrativo `+2` en el mismo preview/tenant. La bandeja de solicitudes del admin no se probó en vivo. Véase el anexo ADR-SAAS-069 en [Gate G](G-SAAS-02-E2-2-GATE-G-POST-PURCHASE-REVALIDATION-2026-10-11.md). |
| Efectivo sin turno (ADR-SAAS-068) | PASS — escenario staging observado | El 11-oct 21:37 Bogotá, la venta aprobada quedó `pagada` por `$5.000 COP`, recibió `$10.000`, calculó `$5.000` de cambio y guardó `turnoId=null`. La auditoría, un ingreso de ledger por el total y un movimiento `venta -2` quedaron asociados a esa venta; el saldo fue de 3 a 1 tras un ajuste sintético `+2` autorizado para preparar el escenario. Administración la muestra como `efectivo sin turno`, fuera del arqueo de turnos. Véase el anexo en [Gate G](G-SAAS-02-E2-2-GATE-G-POST-PURCHASE-REVALIDATION-2026-10-11.md). |
| Historial vendedor — recibido/cambio en efectivo | PASS tras corrección en staging | La revisión previa `consultarmisventasvendedorv1-00002-tam` mostraba `NaN` para la venta `a6093d14-5825-4386-8097-d0caaa3d17ef`. Después del deploy dirigido de esa callable, `consultarmisventasvendedorv1-00003-kod` quedó `Ready` y con 100 % de tráfico; al abrir una pestaña nueva, la misma venta mostró recibido `$10.000 COP`, cambio `$5.000 COP` y `efectivo sin turno`. El registro no se modificó ni se repitió. La causa demostrada fue la callable de lectura desplegada desde un DTO anterior, sin esos campos. |
| Replay remoto después de pérdida de respuesta | NOT EXECUTED | La confirmación de efectivo fue observada una sola vez. No se simuló una respuesta perdida ni se reenvió el mismo `commandId`; la idempotencia sigue sustentada por pruebas locales, no por este ensayo remoto. |
| Tenant real, aceptación operativa y Trial | NOT EXECUTED — Gate I/J | Esta certificación solo usa el fixture sintético. No crea tenant, oferta, Trial, usuarios, catálogo ni inventario real. |

## Conciliación post-compra

La secuencia inicial de Gate G quedó consistente: compra `+1` → stock base `3`;
venta por transferencia `-2` → stock base `1`; reserva final `0`. La venta de
efectivo sin turno se preparó después con un ajuste sintético `+2` (`1` → `3`)
y consumió `-2`, dejando saldo `1`. En la revalidación ADR-SAAS-069 se añadió
otro ajuste autorizado `+2` (`1` → `3`); el stock observado al cierre de esta
lectura es `3`, reserva `0`. La presentación requiere 2 unidades base y el
vendedor ve `1` presentación disponible. No se emitió otra venta durante la
prueba de convergencia.

La venta de efectivo sin turno fue un escenario posterior e independiente: el
historial registra un ajuste de stock `+2` (saldo `1` → `3`) antes de esa prueba,
autorizado para contar con inventario sintético suficiente; la venta consumió
`-2` y dejó saldo `1`. No se presenta la venta por transferencia y la de efectivo
como una sola secuencia sin ese ajuste intermedio.

Para el `commandId` de efectivo, la lectura read-only encontró una venta y un
conjunto de efectos canónicos: un ingreso, un movimiento de inventario y una
auditoría. La consulta se filtró por proyecto, tenant y referencia; el detalle
está en el anexo Gate G enlazado arriba. No hubo pérdida inducida de respuesta
ni replay post-commit en esta revalidación.

## Auditoría de alcance y mutaciones

- En staging quedaron la compra sintética, el ensayo de transferencia, el
  escenario de efectivo sin turno y dos ajustes de stock `+2` documentados
  (uno para preparar la venta en efectivo y otro para ADR-SAAS-069). Son
  registros persistentes de prueba, no operaciones comerciales reales.
- No se creó un duplicado de la solicitud de efectivo ni se reintentó su
  confirmación tras verla ejecutada.
- Una pestaña ya abierta de **Mis ventas** conservó valores `NaN` tras el
  despliegue de la callable corregida; al recargarla y abrir de nuevo el
  historial, la misma venta mostró recibido `$10.000 COP` y cambio `$5.000 COP`.
  No se alteró ni repitió la venta. La observación actual en el preview vuelve a
  mostrar correctamente esos importes; el desfase fue de una pestaña obsoleta,
  no una inconsistencia demostrada del ledger.
- Durante la revalidación original no se cambiaron Rules, Functions, IAM,
  Secrets ni membresías. Como seguimiento de solo código, el 2026-10-12
  `03:46Z` se desplegó únicamente la callable de lectura
  `saas-bodega-operations:consultarMisVentasVendedorV1` con
  `firebase deploy --only functions:saas-bodega-operations:consultarMisVentasVendedorV1`.
  El paquete preparado localmente medía `134.682` bytes y su Firebase CLI
  `sourceHash` era `fc301665d35d589a446744813044416a78a82280`. Se verificó la
  revisión `-00003-kod` `Ready`/100 % y se conservó sin cambios la política
  existente `roles/run.invoker` → `allUsers`. Los logs de auditoría de
  `03:40Z`–`03:50Z` muestran la actualización de esa Function, revisiones
  internas de Cloud Run y comprobaciones `iam.serviceAccounts.actAs`; no muestran
  `SetIamPolicy`, `EnableService` ni creación de cuentas de servicio. La lectura
  IAM posterior conserva únicamente los roles ya aprobados para Functions,
  Eventarc y Pub/Sub, además del binding preexistente registrado antes. No hubo
  escrituras de datos por esa actualización.
- Producción/tenant real, Rules, otras Functions, IAM de proyecto, Secrets,
  membresías y agenda permanecen sin cambios; los únicos registros persistentes
  de staging son los escenarios sintéticos ya descritos arriba.
- Esta actualización es documental; no cambia código ni el Goal vivo.

## Referencias

- [Gate H — certificación integral anterior](G-SAAS-02-E2-2-GATE-H-CERTIFICATION-2026-10-10.md).
- [Gate F — conciliación de compra](G-SAAS-02-E2-2-GATE-F-PURCHASE-RECONCILIATION-2026-10-11.md).
- [Gate G — revalidación posterior a compra](G-SAAS-02-E2-2-GATE-G-POST-PURCHASE-REVALIDATION-2026-10-11.md).
- [Gate I — preflight reconciliado](G-SAAS-02-E2-2-GATE-I-PREFLIGHT-RECONCILIATION-2026-10-10.md).

**Fecha:** 2026-10-11 (Bogotá).
