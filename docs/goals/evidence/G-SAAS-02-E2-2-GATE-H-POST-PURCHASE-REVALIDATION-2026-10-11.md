# G-SAAS-02 / M2 / E2.2 — Gate H: actualización posterior a compra (2026-10-11)

## Dictamen

`GATE_H_REVALIDATION = PASS` para las superficies afectadas por la compra
canónica Bodega. La certificación integral previa de Gate H se conserva; esta
actualización vuelve a validar compra, disponibilidad, venta autorizada,
inventario y ledger después de integrar ADR-SAAS-071/072 y repetir Gate G.
Gate I continúa bloqueado por sus precondiciones de operación y por la
preparación del tenant real; esta matriz no autoriza producción ni escrituras
reales.

## Identidad y base comprobada

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **Proyecto remoto:** `micafe-pos-staging`.
- **Tenant:** `E2_2-BODEGA-STAGING-FIXTURE`, sintético.
- **Compra y venta:** preview autenticado de PR #551; su código quedó integrado
  en `main @ 89a2ab71486860d353ebf164cc7129a48747be5e`. CI post-merge de #551,
  run `38161620488`, terminó `success` sobre ese merge SHA.
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
| Solicitud, aprobación y confirmación canónica | PASS revalidado | Una solicitud sintética aprobada por admin fue confirmada por el vendedor mediante `confirmarVentaBodegaV1`. |
| Compras Bodega | PASS | Una compra autorizada de 1 unidad por `$1.000 COP` produjo recibo y auditoría `CONFIRMADO`, ledger `compra +1`, sin transacción financiera al no seleccionar cuenta de pago. Véase [Gate F — conciliación de compra](G-SAAS-02-E2-2-GATE-F-PURCHASE-RECONCILIATION-2026-10-11.md). |
| Disponibilidad antes de la venta | PASS | Después de la compra había 3 unidades base físicas, 0 reservadas y 3 disponibles. La presentación sintética consume 2 unidades base. |
| Venta, idempotencia, inventario y finanzas | PASS revalidado | Una venta por transferencia de `$5.000 COP`: un recibo canónico, índice de idempotencia, auditoría `CONFIRMADO`, movimiento de inventario `-2` y transacción de ingreso `+5.000 COP`; estado `pagada`/`COMPLETO`, `turnoId=null`. El stock final fue 1, reservado 0. No se repitió el comando tras confirmar el estado. Véase [Gate G — revalidación posterior a compra](G-SAAS-02-E2-2-GATE-G-POST-PURCHASE-REVALIDATION-2026-10-11.md). |
| Turno, arqueo y auditoría del recorrido previo | PASS heredado | La evidencia Gate G anterior conserva dos ventas en efectivo vinculadas a turno, cierre cuadrado por `$10.000 COP`, diferencia `$0` y recibo/auditoría confirmados. La nueva venta fue transferencia sin turno y no altera ese cierre. |
| Competencia de stock | PASS heredado | Se conserva la evidencia previa de staging: una venta aceptada y la competidora rechazada sin sobreventa. La nueva venta consumió únicamente las 2 unidades disponibles que quedaban tras la compra. |
| Agenda, reserva y vencimiento | PASS heredado | Se conserva la observación previa de reserva, consumo y liberación natural; la prueba actual no modificó agendas ni reservas. |
| Aviso push de solicitud | PASS limitado heredado | Se conserva la recepción sintética reportada por el responsable. Sonido y notificación nativa universal de Windows no son garantías. |
| Bandeja/stock sin refresco manual | NOT EXECUTED | La matriz previa no certificó convergencia viva en staging; es un requisito pre-I y requiere su Gate C/D y validación propios. |
| Efectivo sin turno | BLOCKED — implementación pendiente | ADR-SAAS-068 Opción 2 está aceptado, pero este ensayo pagó por transferencia y no demuestra el contrato de efectivo sin turno. No se abrió ni cerró turno en esta operación. |
| Tenant real, aceptación operativa y Trial | NOT EXECUTED — Gate I/J | Esta certificación solo usa el fixture sintético. No crea tenant, oferta, Trial, usuarios, catálogo ni inventario real. |

## Conciliación post-compra

La secuencia de inventario quedó consistente: compra `+1` → stock base `3`;
venta `-2` → stock base `1`; reserva final `0`. Como la única presentación de
prueba requiere 2 unidades base, el vendedor ve `0` presentaciones completas
disponibles. No se deben emitir nuevas ventas sintéticas de esa presentación
hasta reponer el fixture.

La confirmación creó una sola obligación de venta y un solo conjunto de efectos
canónicos. La lectura de Firestore fue de solo lectura y se filtró por proyecto,
tenant y `commandId`; el detalle de conteos e identificadores está en la
evidencia Gate G enlazada arriba. No hubo pérdida inducida de respuesta en esta
revalidación; no se presenta como ensayo de replay post-commit.

## Auditoría de alcance y mutaciones

- En staging quedó la compra sintética previamente autorizada y una venta
  sintética por transferencia confirmada con autorización explícita. Son
  registros persistentes de prueba, no operaciones comerciales reales.
- No se creó una segunda venta ni se reintentó la confirmación tras verla
  ejecutada.
- Producción/tenant real, Rules, Functions, IAM, Secrets, membresías y agenda:
  sin cambios durante la revalidación Gate G/H.
- Esta actualización es documental; no cambia código ni el Goal vivo.

## Referencias

- [Gate H — certificación integral anterior](G-SAAS-02-E2-2-GATE-H-CERTIFICATION-2026-10-10.md).
- [Gate F — conciliación de compra](G-SAAS-02-E2-2-GATE-F-PURCHASE-RECONCILIATION-2026-10-11.md).
- [Gate G — revalidación posterior a compra](G-SAAS-02-E2-2-GATE-G-POST-PURCHASE-REVALIDATION-2026-10-11.md).
- [Gate I — preflight reconciliado](G-SAAS-02-E2-2-GATE-I-PREFLIGHT-RECONCILIATION-2026-10-10.md).

**Fecha:** 2026-10-11 (Bogotá).
