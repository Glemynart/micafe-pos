# G-SAAS-02 / M2 / E2.2 — Gate G rehearsal Bodega MVP-1 (2026-10-05)

## Resultado

`REHEARSAL = PASS` para el fixture sintético retenido
`E2_2-BODEGA-STAGING-FIXTURE` en `micafe-pos-staging`.

La ejecución reutilizó exclusivamente el tenant y las identidades sintéticas
existentes. No creó un tenant, fixture, producto, cliente ni operador
adicional; no modificó producción.

## Secuencia comprobada

| Paso | Evidencia | Resultado |
| --- | --- | --- |
| Incorporación, configuración y contexto tenant | Fixture activo y evidencias Gate F enlazadas abajo. | PASS |
| Catálogo e inventario disponibles al vendedor | La PWA mostró la presentación sintética disponible antes de la venta. | PASS |
| Vendedor autenticado y autorizado | Sesión del vendedor sintético del fixture con contexto tenant/rol efectivo; ver evidencia Gate F. | PASS |
| Apertura de turno | Turno `z7TbvKpmaOm86IGaJJXY`, abierto el `2026-10-05T22:06:28.293Z`, base `0`. | PASS |
| Venta y pago | Una venta pagada en efectivo de `5.000 COP` el `2026-10-05T22:13:40.573Z`; estado `pagada` / `COMPLETO`. | PASS |
| Stock | La venta consumió `2` unidades base; el saldo posterior del artículo fue `4`, consistente con el catálogo posterior. | PASS |
| Ledger financiero de venta | Un único ingreso `ventas` de `5.000 COP` a `caja-principal`, asociado al turno y a la venta. | PASS |
| Cierre y arqueo | Cierre definitivo a `2026-10-05T22:48:59.763Z`: esperado `5.000`, reportado `5.000`, diferencia `0`, depósito neto `5.000`. | PASS |
| Ledger de cierre | Exactamente dos movimientos `cierre_deposito`: egreso `5.000` de `caja-principal` e ingreso `5.000` a `caja-fuerte`. | PASS |
| Auditoría e idempotencia | Un recibo `CONFIRMADO` y un hecho de auditoría `CONFIRMADO` para `cerrarTurnoOperativoV1`; no quedó lock activo del turno. | PASS |

## Identificadores verificables

- Proyecto: `micafe-pos-staging`.
- Empresa: `E2_2-BODEGA-STAGING-FIXTURE` (`Bodega Atrato Demo`).
- Turno: `z7TbvKpmaOm86IGaJJXY`.
- Comando de cierre:
  `cierre-turno:z7TbvKpmaOm86IGaJJXY`.
- Recibo y hecho de auditoría: ambos `CONFIRMADO`, creados en
  `2026-10-05T22:48:59.763Z`.
- Cuentas posteriores observadas: `caja-principal` `5.000 COP` y
  `caja-fuerte` `15.000 COP`.

Los saldos absolutos de las cuentas incluyen historia previa del fixture; la
evidencia de este rehearsal es el par exacto de movimientos de depósito de
`5.000 COP`, más los importes almacenados en el turno y el recibo canónico.

## Evidencia previa incorporada

- [`G-SAAS-02-E2-2-GATE-F-CLAIMS-RESTORATION-2026-10-05.md`](G-SAAS-02-E2-2-GATE-F-CLAIMS-RESTORATION-2026-10-05.md): autenticación,
  contexto tenant/rol, replay de membresía/claims, autoridad e idempotencia.
- [`G-SAAS-02-E2-2-GATE-F-ISOLATION-RETRY-2026-10-05.md`](G-SAAS-02-E2-2-GATE-F-ISOLATION-RETRY-2026-10-05.md): aislamiento de
  configuración A/B y retry autenticado/idempotente.
- [`G-SAAS-02-E2-2-GATE-F-BACKOFFICE-UI-2026-10-05.md`](G-SAAS-02-E2-2-GATE-F-BACKOFFICE-UI-2026-10-05.md): Backoffice Bodega y
  política de operadores del fixture.

## Mutation audit

- Rehearsal remoto: una venta sintética de efectivo y un cierre definitivo del
  turno sintético descrito arriba.
- Firebase deploy, tráfico, Rules, IAM, Secrets, Bootstrap, Activation,
  fixture adicional y producción: `0`.
- No hubo limpieza destructiva.
- Esta evidencia no autoriza tenant real, aceptación operativa, producción ni
  el cierre de E2.2.

## Siguiente gate

`GATE H — CERTIFICACIÓN E2.2`: consolidar una matriz final que preserve los
escenarios no ejecutados como tales y determine si quedan bloqueos antes del
tenant real.
