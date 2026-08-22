# P1-09 — Diseño técnico de reservas públicas y Wompi

Estado: **APROBADO PARA IMPLEMENTACIÓN** por ADR-SAAS-036 aceptado el
2026-08-22. Base: `origin/main @ 9cdb25f0ad52eb1e3b4a44c6f6e924403a43f3b9`.

## Alcance y límites

Este corte elimina las rutas explotables de precio, webhook y tesorería, y
prepara el contrato seguro sin activar la capacidad. No configura secretos,
Wompi, Vercel WAF, tarifas de un tenant ni producción. No modifica reservas
internas de ADR-SAAS-033, identidad, debug, FCM, credenciales ni B3.

## Autoridades

| Dato/efecto | Autoridad |
|---|---|
| tenant y espacio | `mesas/{mesaId}` revalidada contra `empresas/{empresaId}` |
| tarifa, moneda y producto fiscal | `configuraciones/{empresaId}.reservasPublicas` |
| monto y referencia | servidor al crear `intenciones_pago_reserva/{reference}` |
| autenticidad del checkout | SHA-256 servidor con secreto de integridad Wompi |
| autenticidad del evento | checksum dinámico Wompi con secreto de eventos |
| autorización del pago | coincidencia exacta evento ↔ intención ↔ reserva ↔ tenant |
| venta y numeración | `confirmarVentaFiscal`, ADR-SAAS-008/010 |
| inventario y tesorería | fase 2 canónica, ADR-SAAS-015/R1 |
| cuenta de abono | `empresaId + claveOperativa`, ADR-SAAS-019 |
| volumen anónimo | Vercel WAF antes de `/api/reservas/hold` |

## Contrato de configuración

`reservasPublicas` es una sección opcional, cerrada y versionada de la
configuración tenant. Ausencia o `habilitadas: false` implica fallo cerrado.
Solo acepta COP, una revisión positiva, una clave operativa bancaria y un mapa
de salas por `mesaId`. Cada tarifa congela precio por bloque en centavos,
producto fiscal, impuesto y límites de duración.

No se añade un editor cliente en este PR. La configuración se materializará por
el comando administrativo canónico en una fase de activación separada.

## Hold e intención

`POST /api/reservas/hold` acepta como máximo 8 KiB y solo:

```json
{
  "slug": "tenant-publico",
  "mesaId": "mesa-1",
  "fechaLocal": "2026-08-23",
  "bloquesSolicitados": ["09", "10"],
  "cliente": { "nombre": "...", "email": "...", "telefono": "..." }
}
```

El servidor valida forma exacta, longitudes, fecha, horizonte, bloques únicos y
contiguos; resuelve mesa/empresa/configuración/producto/readiness; calcula el
monto; y crea atómicamente agenda, reserva e intención. La respuesta contiene
solo `reservaId` y los campos firmados necesarios para abrir el checkout. El
cliente no envía ni persiste monto, moneda, `empresaId`, `espacioId`, estados,
referencia ni timestamps autoritativos.

La intención es backend-only y usa estados monotónicos:
`CREADA → PAGO_RECLAMADO → VENTA_PENDIENTE_EFECTOS → COMPLETADA`; cualquier
inconsistencia posterior al pago termina en `REQUIERE_REVISION`. Referencia,
tenant, reserva, tarifa, monto, moneda y snapshots comerciales no mutan.

## Webhook y saga

La ruta Next legacy se retira como escritor. El webhook nuevo es una HTTPS
Function pública cuya única autenticación es el checksum Wompi validado en
tiempo constante. Exige cuerpo ≤32 KiB, `transaction.updated`, entorno
configurado, propiedades firmadas permitidas, `APPROVED`, `COP`, monto entero y
coincidencia exacta con la intención.

La Function reclama la intención transaccionalmente. Antes de pasar una
intención `CREADA` a `PAGO_RECLAMADO`, relee empresa, configuración habilitada,
mesa, agenda, propiedad de todos los bloques y vigencia del hold. Una
inconsistencia termina en `REQUIERE_REVISION` sin crear venta ni efectos. Luego
ejecuta:

1. `confirmarVentaFiscal` con actor `wompi:<transactionId>`, origen `SYSTEM` e
   IDs deterministas derivados de la referencia;
2. fase 2 canónica con un contexto interno `SYSTEM`, que relee el tenant
   operativo en la misma transacción, pero no inventa una membresía humana;
3. confirmación de agenda/reserva e intención completada.

El medio de pago es `transferencia`; por ello no requiere turno de efectivo.
La cuenta se obtiene únicamente por la clave operativa congelada en la
intención. El producto tarifario debe existir en el mismo tenant para que la
fase 2 pueda aplicar inventario; una falla deja la venta pendiente y recuperable.

El reconciliador existente puede reintentar porque el recibo fiscal conserva el
actor `SYSTEM`; la fase 2 reconoce ese recibo únicamente cuando la venta y la
intención Wompi coinciden. Deshabilitar la entrada pública impide nuevos claims,
pero no bloquea la recuperación idempotente de pagos ya reclamados. No existe
una ruta genérica de bypass para callables.

## Rate limiting y activación

La regla externa aprobada es 5 solicitudes por 10 minutos para
`POST /api/reservas/hold`, con IP + JA4 cuando la plataforma lo permita. Debe
validarse primero en Preview y registrar 429, falsos positivos y costo. Sin
evidencia WAF, secretos separados, URL de webhook, tenant configurado y suites
verdes, `RESERVAS_PUBLICAS_ENABLED` permanece distinto de `true` y ambos
endpoints fallan cerrados.

## Pruebas y auditoría

Se requieren unitarias de validación, precio, firma, evento, replay, mismatch de
monto/moneda/referencia, cross-tenant, cuenta tenant-aware, estados y fail-close;
Rules backend-only; typecheck; builds; suites fiscal/finanzas/reservas; build de
Functions; y diff scan de Codex Security. La prueba del WAF y secretos reales es
un gate de activación, no una condición para revisar el código.

## Rollback y riesgo residual

El rollback de código vuelve a deshabilitar endpoints y no elimina intenciones,
ventas, ledger ni auditoría. Un pago aprobado que no complete la saga requiere
reconciliación o revisión manual; nunca se compensa con una escritura directa.
El rate limit no prueba humanidad y puede afectar NAT compartido. Reembolsos,
contracargos, anticipos y conciliación contable externa siguen fuera de alcance.
