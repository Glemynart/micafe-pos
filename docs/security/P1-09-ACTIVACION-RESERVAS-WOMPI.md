# P1-09 — Runbook de activación de reservas públicas/Wompi

Estado: **NO AUTORIZADO PARA EJECUCIÓN PRODUCTIVA**. Este documento registra
los gates externos de ADR-SAAS-036; no constituye evidencia de que se hayan
ejecutado.

## Precondiciones

- PR P1-09 fusionado y SHA de Web/Functions identificado.
- Diff scan de Codex Security sin HIGH/MEDIUM abiertos dentro del corte.
- CI, Rules, build Web, build Functions y suites P1-09 verdes.
- Tenant en `trial` o `activa`, readiness fiscal completa, numeración POS
  vigente, producto tarifario y cuenta lógica tenant-aware existentes.
- `configuraciones/{empresaId}.reservasPublicas` validada, pero inicialmente
  con `habilitadas: false`.
- Recovery y responsable operativo identificados.

## Secretos y endpoints

1. Crear secretos distintos para integridad de checkout y eventos. No copiar
   valores en Git, tickets, logs o evidencia.
2. Configurar `WOMPI_INTEGRITY_SECRET` solo en el entorno servidor de Vercel.
3. Configurar `WOMPI_EVENTS_SECRET` con Firebase Secret Manager y asociarlo a
   `wompiReservasWebhookV1`.
4. Configurar `WOMPI_ENVIRONMENT` con el entorno exacto del proveedor.
5. Desplegar la Function y registrar su URL como webhook Wompi. No reutilizar
   `/api/webhooks/wompi`, que falla cerrado deliberadamente.

### Configuración de Functions y Web

- Functions: mantener `RESERVAS_PUBLICAS_ENABLED=false` y
  `WOMPI_ENVIRONMENT=<ambiente aprobado>` en el archivo de entorno de Functions
  específico del proyecto (`functions/.env.<alias-o-project-id>`), fuera de
  Git y con acceso restringido. `WOMPI_EVENTS_SECRET` se entrega únicamente
  por Secret Manager mediante `defineSecret`; no se copia al archivo de
  entorno.
- Web/Vercel: configurar `RESERVAS_PUBLICAS_ENABLED=false`,
  `WOMPI_ENVIRONMENT=<ambiente aprobado>`, la llave pública correspondiente y
  `WOMPI_INTEGRITY_SECRET` como variable cifrada de servidor. Nunca usar el
  prefijo `NEXT_PUBLIC_` para el secreto de integridad.
- Antes de cambiar cualquier flag, comprobar por nombre que cada consumidor
  recibe el entorno correcto y conservar la evidencia redactada sin valores.

### Procedimiento de deployment de la Function

Este procedimiento requiere autorización de deployment y no forma parte de la
CI de calidad:

```powershell
npm ci
npm --prefix functions ci
npm run build:functions
firebase deploy --only functions:wompiReservasWebhookV1 --project micafe-pos
firebase functions:list --project micafe-pos --json
```

El operador debe confirmar que el inventario contiene exactamente
`wompiReservasWebhookV1`, región `us-central1`, trigger HTTPS público y el
binding `WOMPI_EVENTS_SECRET`. No imprimir la salida de valores de secretos ni
usar `/api/webhooks/wompi` como sustituto. Si falta acceso o autorización,
registrar `BLOCKED — DEPLOYMENT AUTHORIZATION REQUIRED`.

## Vercel WAF en Preview

Crear una regla para método `POST` y path exacto `/api/reservas/hold`:

- acción de rate limit: máximo 5 solicitudes por ventana de 10 minutos;
- clave primaria: IP de origen;
- añadir JA4 cuando esté disponible en el plan/proyecto;
- no incluir otras rutas;
- probar primero en Preview.

Conservar evidencia redactada de 1–5 respuestas permitidas, sexta respuesta
429, ventana de recuperación, observación con NAT compartido y costo/cuota.
La validación no debe crear datos de un tenant productivo.

## Secuencia de habilitación

1. En test/Preview, configurar una tarifa y cuenta de prueba tenant-aware.
2. Activar primero `reservasPublicas.habilitadas`, ejecutar hold → checkout →
   webhook → venta → inventario → ledger y verificar replay/mismatch.
3. Confirmar que la venta usa la cuenta lógica configurada y que no existe
   acceso cross-tenant.
4. Solo con evidencia completa, cambiar `RESERVAS_PUBLICAS_ENABLED=true` en
   Web y Functions dentro de una ventana aprobada.
5. Ejecutar smoke, observar logs sin PII/secretos y registrar SHA/configuración.

El procedimiento detallado, datos requeridos, negativos, replay, cleanup y
criterios de PASS está en `docs/security/P1-09-SMOKE-CONTROLADO.md`.

## Rollback

Cambiar `RESERVAS_PUBLICAS_ENABLED=false` en Web y Functions, deshabilitar la
tarifa tenant y conservar intenciones, reservas, ventas, ledger y auditoría.
No borrar ni editar pagos aprobados. Cualquier intención en
`PAGO_RECLAMADO`, `VENTA_PENDIENTE_EFECTOS` o `REQUIERE_REVISION` se concilia
por la saga/reconciliador o se escala manualmente.
