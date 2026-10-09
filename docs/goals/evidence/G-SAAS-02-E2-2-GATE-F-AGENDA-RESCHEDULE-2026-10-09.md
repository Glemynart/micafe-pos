# G-SAAS-02 / M2 / E2.2 — Gate F: reprogramación de reserva sintética

**Estado:** reprogramada y conciliada en la UI de staging; vencimiento y liberación automática pendientes de observar. No cierra Gate F.

**Fecha de revisión:** 2026-10-09 (America/Bogota).

## Contexto y alcance

ADR-SAAS-064 establece que una reserva lógica aceptada vence al final del día
local programado, independientemente de la franja preferida. El worker debe
procesar vencimientos con una cadencia no mayor de cinco minutos. El objetivo
de este cambio de fixture fue sustituir la reserva sintética del 10 de octubre
por una agenda para hoy, 9 de octubre, de 14:00 a 15:00, sin adelantar una venta
ni manipular el reloj o el Scheduler.

El responsable autorizó expresamente cancelar/recrear la reserva de dos
unidades del fixture de staging. La operación se limitó al tenant sintético
existente `E2_2-BODEGA-STAGING-FIXTURE` en `micafe-pos-staging`.

## Resultado observado

- Por la UI autenticada del vendedor se conservó la agenda sintética para hoy,
  9 de octubre, de 14:00 a 15:00; por la UI canónica de administración quedó
  aceptada como `Stock reservado` por 2 unidades base.
- La UI muestra vencimiento `2026-10-10 00:00` en `America/Bogota`, equivalente
  a `2026-10-10T05:00:00Z`. Es el final del día local de la fecha programada,
  como establece ADR-SAAS-064; la franja 14:00–15:00 no cambia el TTL.
- La reserva anterior del 10 de octubre quedó `Cancelada`; la agenda extra sin
  franja para el 10 de octubre quedó `Cancelada` conforme a la autorización
  previa. La nueva agenda correcta permanece reservada.
- La vista administrativa de inventario mostró 4 unidades físicas, 2
  reservadas y 2 disponibles. En las sesiones autenticadas de vendedor y
  administrador, la agenda mostró las mismas 2 unidades retenidas y el mismo
  vencimiento.
- Una lectura posterior a las 15:00 mostró la agenda aún como `Stock reservado`
  después de acabar la franja preferida 14:00–15:00. Esto coincide con la regla
  de expiración al cierre del día local; no es una cita garantizada ni una venta.
- `/admin/ventas` conservó sus 12 filas observadas; esta reprogramación no creó
  una venta. No se confirmó ninguna solicitud ni se generó movimiento de
  inventario, ledger o caja.

## Qué no demuestra

La lectura confirma el nuevo vencimiento y la proyección del hold, no que el
Scheduler lo haya liberado. Al revisar a las 15:05 del 9 de octubre (Bogotá),
faltaban aproximadamente 8 h 55 min para la hora límite. La validación remota
pendiente debe observar la agenda/reserva y el stock después de las 00:00 del
10 de octubre; dado el SLA de cadencia del worker, se permite hasta cinco
minutos adicionales antes de clasificar una demora como fallo. No se forzará
el Scheduler ni se cambiará el reloj para fabricar el resultado.

Una lectura posterior confirmó que el job
`firebase-schedule-reconciliarAgendaPedidosBodegaV1-us-central1` está
`ENABLED`, con frecuencia `every 5 minutes` (configurada en UTC). Cloud Logging
registró HTTP `200` en sus cuatro últimas ejecuciones observadas: `19:53:09Z`,
`19:58:05Z`, `20:03:03Z` y `20:08:03Z` del 9 de octubre. Esto acredita
disponibilidad reciente del worker, pero como la reserva todavía no vencía no
demuestra su liberación automática.

Las notificaciones de esta agenda reprogramada no se revalidaron en este
cambio. La alerta de solicitudes nuevas, entrega visible/sonora, retry/replay
autenticado, concurrencia e aislamiento remoto, y conciliación integral
PWA/Backoffice siguen según la matriz de Gate F.

La vista del vendedor mostraba también el aviso genérico «No fue posible
completar la venta. Revisa los datos e inténtalo de nuevo». Esta inspección fue
read-only: no se reintentó la venta y el origen de ese aviso no quedó
determinado; por ello no se acredita la conversión de agenda a venta.

La inspección local confirma que el mismo mapper de errores se usa en la carga
inicial paralela, la actualización de agenda/solicitudes y las mutaciones; su
fallback de cualquier error no reconocido está redactado como si fuera una
venta. Una lectura read-only de Cloud Logging en staging para respuestas
HTTP `>= 400` del 9 de octubre encontró tres respuestas `401/403` y ninguna
`5xx`, pero no había un identificador de correlación que vinculara esos logs al
aviso visible. Por tanto, no se atribuye el mensaje a una venta concreta ni se
declara resuelta su causa.

## Auditoría de mutaciones

- Se usó la UI canónica de staging para cancelar la reserva antigua, aceptar
  la agenda sintética de hoy y cancelar la agenda duplicada autorizada.
- Escrituras directas de Firestore: `0`; invocación manual del Scheduler: `0`.
- Ventas, clientes, pagos, inventario físico, ledger y turnos: sin cambios por
  esta operación. La proyección `stockReservado` refleja solamente el hold
  activo autorizado.
- Producción, tenant real, Auth, membresías, Rules, Functions, IAM, Secrets y
  despliegues: cambios `0`.

Gate F permanece `EN CURSO`, no `PASS`.
