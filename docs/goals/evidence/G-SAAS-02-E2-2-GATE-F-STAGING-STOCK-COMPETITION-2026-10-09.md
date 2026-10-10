# G-SAAS-02 / M2 / E2.2 — Gate F: venta y competencia de stock en staging

**Estado:** escenario puntual `PASS`; Gate F permanece `EN CURSO`.

## Alcance y entorno

El 2026-10-09 (Bogotá), en el fixture sintético
`E2_2-BODEGA-STAGING-FIXTURE` de `micafe-pos-staging`, se observó el POS del
vendedor autenticado y se usó el flujo normal de confirmación de una solicitud
aprobada. El cambio se limitó a una venta sintética por transferencia. No hubo
dinero, producto ni cliente real involucrado.

## Resultado

Antes de confirmar había dos solicitudes aprobadas de `$5.000 COP`, cada una por
una presentación (2 unidades base). El inventario del producto tenía 4 unidades
físicas, 2 retenidas por la agenda activa y 2 disponibles.

| Escenario | Resultado observado |
|---|---|
| Confirmar la solicitud sintética terminada en `4NJMXIL0` por transferencia | La UI mostró `Venta confirmada`; la solicitud pasó a `EJECUTADA`. Firestore confirmó una venta `pagada` por `$5.000 COP`, método `transferencia`, sin turno asociado. |
| Inventario tras la venta | 2 unidades físicas, 2 retenidas por la agenda y 0 disponibles. El stock reservado no se consumió ni liberó. |
| Confirmar la segunda solicitud, terminada en `YOTK3IL0` | El servidor respondió «No hay existencias suficientes para completar la venta». La solicitud permaneció `APROBADA`; no se creó una segunda venta. |
| Conciliación del fixture | Firestore mostró 13 ventas sintéticas por `$65.000 COP` en total, un incremento de `$5.000` frente a la lectura previa de 12 ventas / `$60.000`. |
| Actualización de la vista del vendedor | La vista reflejó `EJECUTADA` y mantuvo la segunda solicitud como `APROBADA`; anuncia actualización automática mientras permanece abierta. |

La segunda confirmación se hizo después de la primera, no en paralelo: es una
prueba remota de disponibilidad agotada, no certifica una carrera concurrente.
La carrera de dos vendedores sí quedó cubierta en Emulator por las pruebas
integradas con PR #519.

## Hallazgos y límites

- Al seleccionar efectivo, el POS deshabilita `Confirmar venta` y ofrece
  `Abrir turno para efectivo`. No se abrió ni alteró un turno. La venta se
  registró por transferencia para preservar la caja; el comportamiento de
  efectivo sin turno solicitado por el responsable queda diferido para después
  de Gate F y antes de Gate I.
- La sesión admin de Edge expiró durante la comprobación; no se afirma una
  conciliación visual posterior en Backoffice. La venta, el método, el total,
  el stock y la reserva se verificaron mediante lectura de Firestore en el
  proyecto de staging.
- La agenda conserva una reserva activa de 2 unidades con vencimiento a
  medianoche de Bogotá (`2026-10-10T05:00:00Z`). El vencimiento natural aún no
  se había observado. No se forzó el Scheduler ni se manipuló el reloj.
- No se probó aquí replay tras pérdida de respuesta ni aislamiento remoto
  tenant/roles o revocación/restauración de membresía.

## Auditoría de mutaciones

Una solicitud de prueba se convirtió en venta y produjo sus movimientos
canónicos de pago e inventario en el fixture. La segunda solicitud no produjo
efectos. No se cancelaron solicitudes, no se cambió la reserva ni se alteraron
turnos, usuarios, membresías, Auth, Rules, Functions, IAM, Secrets, despliegues,
otros tenants o producción.

Gate F continúa `EN CURSO`, no `PASS`. Esta evidencia no autoriza iniciar Gate
G/H ni crear o configurar el tenant real.
