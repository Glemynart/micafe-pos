# G-SAAS-02 / M2 / E2.2 — Gate F: replay remoto y conciliación de roles

**Resultado:** escenarios puntuales `PASS`; Gate F sigue `EN CURSO`.

## Alcance y entorno

Validación realizada el 2026-10-09, hora de Bogotá, contra el preview
`cafeatrato-iuqshyssh-glemynarts-projects.vercel.app`, cuyo código de aplicación
corresponde al candidato de PR #519 (`fb22cef`); PR #520 solo reconcilió
documentación. El backend consultado fue `micafe-pos-staging` y el único tenant
de negocio fue `E2_2-BODEGA-STAGING-FIXTURE`. Vendedor y administrador se
validaron en perfiles de navegador separados.

No se usó un cliente, vendedor, inventario ni pago real. No se alteraron
producción, otro tenant, Rules, Functions, IAM, Secrets ni despliegues.

## Resultados observados

| Escenario | Evidencia |
|---|---|
| Replay autenticado después de restaurar la membresía | Se invocó `confirmarVentaBodegaV1` una vez con el mismo comando de la venta sintética existente (prefijo `d60f5034`). La Function respondió HTTP `200` en `2026-10-10T01:32:07Z`. La lectura posterior, a `01:32:50Z`, confirmó solicitud `EJECUTADA`, venta pagada por `$5.000 COP`, recibo `CONFIRMADO`, una venta asociada al comando, respuesta coincidente con la venta persistida, un movimiento financiero y un movimiento de inventario. El stock permaneció en 2 unidades físicas, 2 reservadas y 0 disponibles. No se creó una venta ni un movimiento duplicado. |
| Límite del replay | Esto acredita que un replay autenticado devuelve el resultado persistido sin repetir efectos. No simula una desconexión de red ni demuestra por sí solo una pérdida real de la primera respuesta HTTP. |
| Sesión y rol vendedor | En `/pos`, el vendedor sintético autenticado vio disponibilidad `0` y el envío de una solicitud permaneció deshabilitado. Abrir `/admin/solicitudes` redirigió a `/admin/login?error=not_admin` e indicó que había una sesión de caja activa. No se intentó una operación administrativa desde esa sesión. |
| Rol administrador | En otra sesión de Edge, el administrador tenant autenticado cargó `/admin/solicitudes` y vio la solicitud sintética `YOTK3IL0` todavía `APROBADA`; no la aprobó ni confirmó otra venta. |
| Conciliación de inventario y agenda | `/admin/inventario` mostró 2 unidades físicas, 2 reservadas y 0 disponibles, coincidiendo con el POS del vendedor. `/admin/agenda` mostró una reserva activa de 2 unidades para el 9-oct, franja 14:00–15:00, con vencimiento a medianoche del 10-oct (Bogotá), junto con entradas anteriores `CANCELADA` y una `ATENDIDA`. No se canceló ni liberó la reserva activa. |
| Conciliación de reporte y turnos | `/admin/reportes` mostró para el 9-oct ventas de `$5.000`, costo `$2.000`, ganancia bruta `$3.000` y margen `60 %`, por transferencia. `/admin/turnos` cargó 1 turno abierto y 8 cerrados visibles. Ningún turno fue abierto, cerrado o ajustado. |
| Verificación de acceso al tenant | El indicador `Verificando acceso al tenant…` apareció brevemente durante la navegación; ambas sesiones terminaron cargando sus vistas sin recargar manualmente. El incidente de carga infinita no se reprodujo en esta ejecución. |

## Límites y pendientes

- Sigue pendiente observar la expiración natural del hold y confirmar su
  liberación automática. No se adelantó el reloj ni se ejecutó el Scheduler
  fuera de su cadencia.
- La carrera de dos vendedores está cubierta en Emulator por PR #519; la prueba
  remota de stock insuficiente fue secuencial, no una carrera simultánea.
- El intento de acceso admin desde vendedor valida una frontera de rol en UI,
  no la matriz remota completa de aislamiento A/B. No se creó otro tenant para
  esta comprobación.
- El replay remoto fue idempotente, pero no incluyó una caída de red controlada
  entre el commit y la respuesta. No se afirma ese subcaso como `PASS`.
- La entrega push fue confirmada previamente por el usuario. Sonido y
  actualización en tiempo real de la bandeja fueron diferidos por el usuario;
  esta verificación no los certifica.

No se declara Gate F cerrado con esta evidencia parcial. No se inicia Gate G/H,
Gate I, el tenant real ni producción.
