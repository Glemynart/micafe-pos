# P1-09 — Smoke controlado de reservas públicas/Wompi

Estado: **PREPARADO / NO EJECUTADO**.

Este documento prepara la ejecución posterior a todos los gates técnicos y
externos. No contiene un tenant, secretos, datos fiscales ni credenciales
reales. La ejecución exige una `AUTHORIZED PRODUCTIVE WINDOW` y un tenant que
haya sido autorizado explícitamente para reservas públicas pagadas.

## Precondiciones obligatorias

1. `origin/main` y Web/Functions están alineados en el SHA certificado.
2. `wompiReservasWebhookV1` está desplegada en `us-central1` y su URL está
   registrada como endpoint de eventos en Wompi.
3. `WOMPI_EVENTS_SECRET` está creado en Firebase Secret Manager y enlazado a la
   Function. `WOMPI_INTEGRITY_SECRET` existe únicamente como secreto de
   servidor en Vercel. Ambos valores son distintos.
4. `WOMPI_ENVIRONMENT` coincide con el ambiente del proveedor y la llave
   pública corresponde al mismo ambiente.
5. El WAF de Vercel está en modo bloqueante y existe evidencia de 1–5
   solicitudes permitidas, sexta solicitud `429`, recuperación de ventana y
   observación de NAT compartido.
6. El tenant autorizado está en `trial` o `activa`, tiene readiness fiscal
   completa, numeración POS vigente, producto tarifario activo y exactamente
   una cuenta lógica para la `cuentaClaveOperativa` configurada.
7. `reservasPublicas.habilitadas` sigue en `false` hasta iniciar la ventana.
8. Existe responsable operativo, referencia de cambio, canal de observación y
   procedimiento de rollback confirmado.

## Datos de prueba

Los siguientes valores deben ser suministrados por el operador autorizado y no
se deben inventar ni registrar en Git:

| Dato | Requisito |
|---|---|
| Tenant | `empresaId` autorizado; no seleccionar uno por conveniencia |
| Mesa | `mesaId` del tenant con tarifa pública y agenda de prueba |
| Fecha/bloques | fecha futura dentro del horizonte y bloques contiguos libres |
| Cliente | identidad de prueba aprobada; no usar PII innecesaria |
| Wompi | ambiente de prueba/producción y medio de prueba entregado por Wompi |
| Referencia | generada por el servidor; nunca fabricada por el cliente |

## Secuencia y resultados esperados

### A. Preflight sin escrituras

- Confirmar SHA, URL de Function, ambiente Wompi, bindings por nombre y flag
  efectiva.
- Confirmar que la consulta read-only de configuración identifica el mismo
  tenant en empresa, mesa, producto, configuración, numeración y cuenta.
- Registrar solo nombres, estados, IDs mínimos y timestamps; no registrar
  secretos, tokens, datos de tarjeta ni PII completa.

### B. Hold y checkout

1. En la ventana, habilitar la configuración pública únicamente para el tenant
   autorizado y mantener la flag global en el estado aprobado para la prueba.
2. Enviar `POST /api/reservas/hold` con `slug`, `mesaId`, `fechaLocal`,
   `bloquesSolicitados` y `cliente`. No enviar `montoTotal`, `empresaId`,
   `espacioId`, `referencia`, estados ni timestamps.
3. Esperar `200` con `reservaId` y checkout firmado. Verificar que monto,
   moneda, referencia y firma provienen del servidor.
4. Verificar en modo autorizado que la transacción creó exactamente una
   reserva, una intención `CREADA` y el documento de agenda correspondiente,
   todos con el mismo tenant.

### C. Pago, webhook y efectos

1. Abrir el checkout con la respuesta del hold usando la prueba aprobada por
   Wompi.
2. Recibir el evento firmado en `wompiReservasWebhookV1`.
3. Esperar HTTP `200` con resultado `COMPLETED`.
4. Verificar la transición de intención a `COMPLETADA`, reserva pagada y
   agenda confirmada.
5. Verificar una venta fiscal canónica con `origenReserva`, referencia de
   intención y transaction ID de Wompi; validar snapshot fiscal, inventario,
   ledger, cuenta y `empresaId`.
6. Reenviar exactamente el mismo evento. Esperar respuesta idempotente y cero
   venta, numeración, movimiento o consumo adicional.

### D. Pruebas negativas controladas

Con una nueva intención de prueba o un fixture aislado, sin efectuar pagos
adicionales:

- modificar monto firmado: debe terminar en `REQUIERE_REVISION`, sin venta ni
  tesorería;
- modificar moneda, ambiente o referencia: debe ser rechazado por firma o
  coincidencia de intención;
- retirar una propiedad firmada obligatoria: debe ser rechazado;
- enviar evento con hold expirado, agenda reasignada o tenant inconsistente:
  debe terminar en revisión, sin efectos;
- repetir el evento con un transaction ID distinto sobre la misma intención:
  debe ser conflicto, no un segundo pago.

### E. Cancelación y recuperación

- Crear un hold de prueba que no se pague y cancelarlo por su endpoint público;
  debe liberar únicamente sus bloques y dejar la intención `CREADA` sin
  efectos financieros.
- Ejecutar el escenario de caída/reintento solo con un evento de prueba
  autorizado. La saga debe reanudar desde la intención durable y no duplicar
  venta, inventario ni tesorería.
- No borrar pagos aprobados ni editar ventas, ledger o numeración como parte de
  la limpieza.

## Cleanup y rollback

1. Cancelar únicamente holds pendientes de prueba mediante la ruta canónica.
2. Conservar intenciones, ventas, ledger y auditoría aprobados como evidencia
   append-only.
3. Si cualquier verificación falla, cambiar inmediatamente
   `RESERVAS_PUBLICAS_ENABLED=false` en Web y Functions y deshabilitar la
   tarifa pública del tenant.
4. Confirmar que un nuevo hold responde `503` y que el webhook responde `503`
   con `CAPABILITY_DISABLED`, sin reclamar nuevas intenciones.
5. No borrar ni modificar hechos financieros; dejar los estados pendientes en
   reconciliación o revisión manual según el runbook.
6. Registrar incidente, SHA, timestamps, referencias, respuesta del rollback y
   decisión sobre reintento. No registrar secretos ni PII.

## Criterio de PASS

El smoke solo es `PASS` si todos los pasos A–E tienen evidencia, no existe
cross-tenant access, los efectos fiscales/inventario/tesorería corresponden al
tenant y cuenta autorizados, el replay es idempotente, los negativos no generan
efectos y el rollback responde fail-closed.

Sin una ventana y un tenant autorizados, el estado correcto es:

`BLOCKED — PRODUCTIVE WINDOW REQUIRED`
