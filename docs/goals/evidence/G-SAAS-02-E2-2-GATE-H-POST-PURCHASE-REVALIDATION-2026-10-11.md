# G-SAAS-02 / M2 / E2.2 — Gate H: compra y efectivo sin turno (2026-10-11, Bogotá)

## Dictamen

`GATE_H_REVALIDATION = PARTIAL / NOT CLOSED`. La compra, las ventas y sus
efectos canónicos de staging quedaron conciliados, pero la comprobación más
reciente encontró que **Mis ventas** muestra `NaN` para efectivo recibido y
cambio en ventas en efectivo. Ese defecto visible debe reconciliarse antes de
declarar cerrado el recorrido end-to-end. Además, la convergencia viva
ADR-SAAS-069 sigue `NOT EXECUTED` en staging. Gate I continúa bloqueado; esta
matriz no autoriza producción ni escrituras reales.

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
| Bandeja/stock sin refresco manual | NOT EXECUTED | La matriz previa no certificó convergencia viva en staging; es un requisito pre-I y requiere su Gate C/D y validación propios. |
| Efectivo sin turno (ADR-SAAS-068) | PASS — escenario staging observado | El 11-oct 21:37 Bogotá, la venta aprobada quedó `pagada` por `$5.000 COP`, recibió `$10.000`, calculó `$5.000` de cambio y guardó `turnoId=null`. La auditoría, un ingreso de ledger por el total y un movimiento `venta -2` quedaron asociados a esa venta; el saldo fue de 3 a 1 tras un ajuste sintético `+2` autorizado para preparar el escenario. Administración la muestra como `efectivo sin turno`, fuera del arqueo de turnos. Véase el anexo en [Gate G](G-SAAS-02-E2-2-GATE-G-POST-PURCHASE-REVALIDATION-2026-10-11.md). |
| Historial vendedor — recibido/cambio en efectivo | FAIL / pendiente de corrección | En el preview `cafeatrato-breh9pzs3`, **Mis ventas** lista la venta `a6093d14-5825-4386-8097-d0caaa3d17ef` por `$5.000 COP`, pero renderiza `Recibido $ NaN · cambio $ NaN`. La conciliación canónica del servidor conserva los valores correctos; la causa del desfase entre respuesta/DTO y UI no está confirmada. No se repitió la venta. |
| Replay remoto después de pérdida de respuesta | NOT EXECUTED | La confirmación de efectivo fue observada una sola vez. No se simuló una respuesta perdida ni se reenvió el mismo `commandId`; la idempotencia sigue sustentada por pruebas locales, no por este ensayo remoto. |
| Tenant real, aceptación operativa y Trial | NOT EXECUTED — Gate I/J | Esta certificación solo usa el fixture sintético. No crea tenant, oferta, Trial, usuarios, catálogo ni inventario real. |

## Conciliación post-compra

La secuencia de inventario quedó consistente: compra `+1` → stock base `3`;
venta `-2` → stock base `1`; reserva final `0`. Como la única presentación de
prueba requiere 2 unidades base, el vendedor ve `0` presentaciones completas
disponibles. No se deben emitir nuevas ventas sintéticas de esa presentación
hasta reponer el fixture.

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

- En staging quedaron la compra sintética, el ensayo de transferencia y el
  escenario de efectivo sin turno con el ajuste de stock `+2` documentado. Son
  registros persistentes de prueba, no operaciones comerciales reales.
- No se creó un duplicado de la solicitud de efectivo ni se reintentó su
  confirmación tras verla ejecutada.
- La pantalla **Mis ventas** presenta `NaN` para el efectivo recibido y el
  cambio de la venta confirmada. Es un defecto funcional visible, no una
  inconsistencia demostrada del ledger; se conserva como pendiente y no se
  declara cerrado el recorrido end-to-end de Gate G/H.
- Producción/tenant real, Rules, Functions, IAM, Secrets, membresías y agenda:
  sin cambios durante la revalidación; solo se escribieron los registros de
  staging expresamente descritos arriba.
- Esta actualización es documental; no cambia código ni el Goal vivo.

## Referencias

- [Gate H — certificación integral anterior](G-SAAS-02-E2-2-GATE-H-CERTIFICATION-2026-10-10.md).
- [Gate F — conciliación de compra](G-SAAS-02-E2-2-GATE-F-PURCHASE-RECONCILIATION-2026-10-11.md).
- [Gate G — revalidación posterior a compra](G-SAAS-02-E2-2-GATE-G-POST-PURCHASE-REVALIDATION-2026-10-11.md).
- [Gate I — preflight reconciliado](G-SAAS-02-E2-2-GATE-I-PREFLIGHT-RECONCILIATION-2026-10-10.md).

**Fecha:** 2026-10-11 (Bogotá).
