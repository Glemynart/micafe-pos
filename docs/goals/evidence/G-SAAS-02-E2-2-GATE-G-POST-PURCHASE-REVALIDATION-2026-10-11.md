# G-SAAS-02 / M2 / E2.2 — Gate G: revalidación posterior a compra (2026-10-11)

## Resultado

`POST_PURCHASE_REHEARSAL = PASS` para el fixture sintético Bodega. La venta
posterior a la compra quedó conciliada entre solicitud, venta, recibo canónico,
idempotencia, auditoría, movimiento de inventario y movimiento financiero.
Esta ejecución revalida el recorrido de Gate G después de Gate F; no crea ni
configura el tenant real y no modifica producción.

## Contexto y alcance

La conciliación de compra Gate F registró 1 unidad del producto fixture y dejó
3 unidades base disponibles, sin reserva ni movimiento financiero. Gate G se
repitió para comprobar que el flujo aprobado de venta consume correctamente ese
stock aumentado.

- Proyecto: `micafe-pos-staging`.
- Tenant: `E2_2-BODEGA-STAGING-FIXTURE` (`Bodega Atrato Demo`).
- Preview #551: `cafeatrato-git-codex-e2-2-gate-f-pur-259d65-glemynarts-projects.vercel.app`.
- Identidades: vendedor y administrador sintéticos existentes del fixture.
- ADR aplicables: ADR-SAAS-062 (aprobación previa) y ADR-SAAS-071 (compra
  Bodega canónica).

## Recorrido y conciliación

| Paso | Evidencia observada | Resultado |
|---|---|---|
| Disponibilidad previa | Tras la compra Gate F: 3 unidades base, 0 reservadas, 3 disponibles. | PASS |
| Solicitud y aprobación | Solicitud sintética `…IYWNKIL0`, 1 presentación de 2 unidades base, total servidor `$5.000 COP`; aprobada por administración. | PASS |
| Confirmación de venta | Un comando `confirmarVentaBodegaV1`, método `transferencia`, `estado=pagada`, `estadoOperativo=COMPLETO`, `turnoId=null`. | PASS |
| Unicidad/idempotencia | 19 ventas del tenant al leer Firestore; exactamente 1 coincide con el comando `bodega-venta:5156922d-23bf-44d7-b379-43586e0ef1e0`. Se observó 1 recibo `CONFIRMADO`, 1 índice de idempotencia y 1 auditoría `CONFIRMADO` para ese comando. | PASS |
| Inventario | 1 movimiento `venta` por `-2` unidades base, ligado a la venta; stock final `1`, reservado `0`. El vendedor vio `Disponibles: 0` para la presentación de 2 unidades tras actualizar. | PASS |
| Pago | 1 transacción financiera de ingreso `ventas` por `$5.000 COP`, asociada a la cuenta operacional `bancolombia`; sin turno y sin efectivo. | PASS |
| Estado visible | El vendedor mostró la solicitud `EJECUTADA` y “Venta confirmada”; administración mostró la venta `pagada` por transferencia y el inventario final. | PASS |

La lectura Firestore fue de solo lectura y se limitó al proyecto y tenant
indicados. Los IDs documentales internos usan referencias compuestas `r1a-`;
la conciliación se hizo por `commandId` y relaciones canónicas, no por el texto
largo de referencia presentado al usuario.

## Límites y auditoría de mutaciones

- Se registró exactamente una venta sintética autorizada; no se repitió el
  comando después de observar el estado `EJECUTADA`.
- La venta consumió 2 de las 3 unidades base disponibles después de la compra
  Gate F; quedó 1 unidad base física y ninguna reservada.
- No se abrió ni cerró un turno, no se emitió una factura, no se registró dinero
  real y no se cambió agenda, Rules, Functions, IAM, Secrets, membresías, otro
  tenant o producción.
- Esta evidencia no pretende demostrar replay tras pérdida de respuesta,
  efectivo sin turno, entrega push ni expiración automática; esos casos siguen
  sujetos a sus propias evidencias.

## Referencias

- [Conciliación de compra Gate F](G-SAAS-02-E2-2-GATE-F-PURCHASE-RECONCILIATION-2026-10-11.md).
- [Rehearsal Gate G anterior](G-SAAS-02-E2-2-GATE-G-REHEARSAL-2026-10-05.md).

**Fecha de revisión:** 2026-10-11.
