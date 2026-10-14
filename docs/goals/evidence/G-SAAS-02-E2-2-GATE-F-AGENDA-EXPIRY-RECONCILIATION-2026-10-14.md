# G-SAAS-02 / M2 / E2.2 — Gate F: vencimiento natural de agenda (2026-10-14)

## Resultado

`GATE_F_AGENDA_EXPIRY = PASS` para la agenda sintética retenida en staging.
La lectura posterior a la medianoche de Bogotá encontró tanto la agenda como
su reserva en `VENCIDA`; el hold de dos unidades se liberó y el stock físico no
cambió. La observación completa el único escenario que el estado vigente del
Goal mantenía pendiente para Gate F. Al integrarse esta conciliación, Gate F
queda `PASS` para el alcance aprobado.

## Identidad y alcance

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2 — Provisioning y onboarding` /
  `E2.2 — Configuración inicial`.
- **Proyecto Firebase:** `micafe-pos-staging`.
- **Tenant:** `E2_2-BODEGA-STAGING-FIXTURE` (sintético).
- **Producto:** fixture sintético Bodega, en unidades base.
- **Ventana de observación:** 2026-10-14, 00:00–00:05, `America/Bogota`.
- **ADR aplicables:** ADR-SAAS-064 (agenda, reserva y vencimiento), ADR-SAAS-062
  (flujo de solicitud/venta) y ADR-SAAS-076 (namespace vigente de callables
  Bodega).
- **Entornos excluidos:** producción y el tenant real.

## Conciliación read-only

El vencimiento esperado era `2026-10-14T05:00:00Z` (00:00 Bogotá). Una consulta
de solo lectura a los documentos existentes de agenda, reserva e inventario
encontró:

| Control | Resultado observado |
|---|---|
| Agenda sintética del 13-oct, franja 14:00–15:00 | `VENCIDA` |
| Reserva asociada por 2 unidades base | `VENCIDA`; `vencidaEn = 2026-10-14T05:00:02.679Z` |
| Scheduler `firebase-schedule-reconciliarAgendaPedidosBodegaV1-us-central1` | `ENABLED`, frecuencia `every 5 minutes`; último intento observado `2026-10-14T05:00:02.293609Z` |
| Producto fixture | stock físico `2`, reservado `0`, disponible `2` |

La transición ocurrió aproximadamente 2,7 segundos después del vencimiento
local esperado, dentro de la cadencia configurada del Scheduler. El estado
persistido de agenda y reserva, junto con el decremento de `stockReservado` de
2 a 0 y el stock físico sin cambio, concuerda con la reconciliación automática
definida por ADR-SAAS-064. No se adelantó el reloj ni se invocó manualmente el
Scheduler.

## Escrituras y límites

- La verificación de Codex fue de solo lectura sobre el fixture existente en
  `micafe-pos-staging`.
- Ventas, solicitudes, movimientos de inventario, ledger, turnos, membresías y
  Auth: escrituras adicionales de Codex `0`.
- No se modificaron agenda, reserva ni stock manualmente; el hold ya figuraba
  vencido al consultar.
- Rules, Functions, IAM, Secrets, despliegues, otros tenants y producción:
  cambios `0`.
- Esto acredita el vencimiento y liberación de esta agenda, no un SLA de
  actualización en tiempo real ni la recepción de notificaciones del sistema
  operativo.

## Validación

- Firestore REST en `micafe-pos-staging`: GET/read-only, limitado al tenant y
  documentos del fixture indicados.
- Cloud Scheduler de staging: metadatos read-only del job indicado.
- No aplican suites de código: esta conciliación solo agrega evidencia
  documental sobre comportamiento remoto ya ejecutado.
