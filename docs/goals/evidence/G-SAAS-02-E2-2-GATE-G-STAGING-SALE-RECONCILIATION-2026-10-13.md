# G-SAAS-02 / M2 / E2.2 — Gate G: conciliación de venta en staging (2026-10-13)

## Resultado

`GATE_G_CANONICAL_SALE = PASS` para el recorrido solicitud aprobada → venta
confirmada en el fixture Bodega de staging. La verificación posterior fue
read-only y encontró una única venta con su recibo, clave de idempotencia,
auditoría, movimiento de inventario e ingreso financiero canónicos. No se
repitió la venta, no se alteró la agenda y no se tocó producción.

Esta revalidación se ejecutó antes de cerrar Gate F por cambio de prioridad
aprobado por el responsable. No cierra Gate F ni certifica Gate H (replay remoto
tras pérdida de respuesta/reconexión).

## Contexto

- Goal / Milestone / Epic: `G-SAAS-02` / `M2 — Provisioning y onboarding` /
  `E2.2 — Configuración inicial`.
- Proyecto: `micafe-pos-staging`.
- Tenant: `E2_2-BODEGA-STAGING-FIXTURE`.
- Producto: fixture sintético Bodega, presentación de 2 unidades base.
- ADR aplicables: ADR-SAAS-062 (aprobación previa), ADR-SAAS-068 (forma de
  pago sin turno) y ADR-SAAS-076 (namespace vigente de callables Bodega).
- Ventana observada: 2026-10-13, aproximadamente 10:46 a. m. hora de Bogotá.
  El usuario confirmó la acción de venta y compartió la vista de ventas de
  administración; esa vista resumida no expone la conciliación completa.

## Conciliación posterior, solo lectura

| Control | Evidencia en staging | Resultado |
|---|---|---|
| Solicitud y aprobación | La solicitud asociada a la venta está `EJECUTADA`; existe su aprobación administrativa. | PASS |
| Venta | Una venta asociada, pagada por transferencia, por `$5.000 COP`, con estado operativo `COMPLETO`. | PASS |
| Recibo e idempotencia | Exactamente 1 recibo de operación `CONFIRMADO` y 1 registro de idempotencia para el comando de venta. | PASS |
| Auditoría | Exactamente 1 auditoría de confirmación con resultado `CONFIRMADO`. | PASS |
| Inventario | Exactamente 1 movimiento de venta por `-2` unidades base. El producto queda con 2 unidades físicas, 2 reservadas y 0 disponibles. | PASS |
| Ledger | Exactamente 1 ingreso financiero por `$5.000 COP`, asociado a la venta. | PASS |
| Vista de administración | El usuario reportó que la lista de ventas muestra el registro sin detalle; la captura presenta `$5.000`, transferencia y pagada. | PASS — presentación resumida |

Los valores de inventario explican el cero que muestran tanto administración
como vendedor: la interfaz indica disponibilidad, no existencia física. Las 2
unidades restantes continúan retenidas por la agenda sintética de Gate F; esta
venta consumió las otras 2. No se liberó ni canceló esa reserva.

## Alcance y límites

- Las lecturas se limitaron al proyecto y tenant de staging y a los documentos
  relacionados con esta venta. La comprobación de una consulta de grupo no fue
  necesaria: la relación se siguió por las referencias canónicas conocidas.
- Después de la venta, el agente no realizó escrituras remotas. No se pulsó
  reintentar ni se creó otra venta.
- No se verificó replay remoto después de perder la respuesta HTTP; eso sigue
  pendiente para Gate H. La prueba local de idempotencia no sustituye esa
  verificación remota.
- No se revalidaron vencimiento/liberación automática de agenda de Gate F,
  entrega de notificaciones, producción, Rules ni despliegues.
- La captura compartida no incluye una URL o SHA de preview verificable. La
  evidencia confirma los efectos canónicos en el proyecto/tenant indicado, no
  la identidad exacta del artefacto web servido.
