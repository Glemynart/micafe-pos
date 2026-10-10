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

## Addendum — rehearsal posterior al cierre de Gate F (2026-10-10)

Se repitió el flujo en el fixture retenido, sin crear identidades, catálogo,
cliente ni fixture nuevos. La lectura de Firestore en `micafe-pos-staging`
concilió el cierre confirmado por el responsable:

| Paso | Evidencia observada | Resultado |
| --- | --- | --- |
| Solicitudes y aprobación | Dos solicitudes del cliente sintético quedaron `EJECUTADA`; cada una apunta a su venta canónica y comando correspondiente. | PASS |
| Venta y pago | Dos ventas únicas, ambas `pagada` / `COMPLETO` / `BODEGA_MVP1`, en efectivo por `5.000 COP` cada una. | PASS |
| Inventario | Dos movimientos `venta`, uno por venta, de `-2` unidades base cada uno. | PASS |
| Turno y arqueo | Turno `50I2wZft5cqyNIOWGdnJ`, estado `cerrado`, base `0`, efectivo vendido/esperado/reportado `10.000 COP`, diferencia `0`, depósito neto `10.000 COP`. | PASS |
| Ledger financiero | Dos ingresos `ventas` por `5.000 COP` y un par de movimientos de cierre (`ingreso`/`egreso`) por `10.000 COP`, vinculados al turno. | PASS |
| Auditoría e idempotencia | Un recibo de `cerrarTurnoOperativoV1` y un hecho de auditoría, ambos `CONFIRMADO`, con referencia al turno. | PASS |

El turno abrió a `2026-10-10T08:10:07.674Z` y cerró a
`2026-10-10T11:14:27.281Z` (hora de Bogotá: 03:10–06:14). Los comandos de
venta observados fueron
`bodega-venta:1f27bff6-df82-47c4-9997-85b6866c766c` y
`bodega-venta:b7c8b2f4-444a-4cab-84b9-90e2db8f5b5c`; el de cierre fue
`cierre-turno:50I2wZft5cqyNIOWGdnJ`. Los registros de solicitud vinculan cada
comando con su venta; no se usó `causationId` como evidencia.

### Hallazgo de revisión y corrección

En la vista administrativa, el renglón del historial ya mostraba el turno
cerrado y cuadrado, pero el modal conservaba la copia del turno seleccionada
antes de que llegara el snapshot nuevo. El resultado podía ser una etiqueta
“Turno en curso” con el arqueo anterior, aunque el backend ya había confirmado
el cierre. Se corrigió la selección para conservar el ID y resolver el detalle
contra el snapshot vigente; los listeners de ventas/egresos se mantienen ligados
al ID y no se reinician por cada actualización del historial.

La prueba de regresión se ejecutó antes del cambio y falló por el helper ausente
(RED); después pasó junto con la suite del historial: `npm run test:turnos-history`
(`9/9`). También pasaron `npx tsc --noEmit`, ESLint dirigido a los archivos
cambiados y `npm run build -- --webpack`. El build predeterminado
de Turbopack no pudo ejecutarse en este worktree porque sus dependencias se
montaron mediante un enlace fuera de su raíz; la CI del PR verificará el build
predeterminado en un checkout limpio.

Para verificar además el render y la suscripción de la vista real de Admin sin
depender de una sesión manual en un preview protegido, se agregó al E2E Bodega
un caso Playwright con admin sintético en Emulator: abre un turno, abre su
detalle, cambia el snapshot Firestore a cerrado y exige que el modal actualice
el estado, el cuadre y la diferencia sin recargar. Es una mutación aislada del
Emulator, no una operación canónica ni una escritura de staging. El intento de
ejecutar localmente el runner no llegó a iniciar porque este worktree no tiene
instaladas las dependencias `functions/node_modules`; la CI limpia debe validar
el caso nuevo.

El CI anterior del PR #526, run `38049053074`, pasó antes de añadir este caso;
la ejecución CI que incluye el nuevo E2E queda pendiente. El preview de esa
versión ya terminó su despliegue (`Vercel = pass`). Gate G permanece `EN CURSO`
hasta que el nuevo CI pase y el PR se integre. No se requiere otra sesión
manual, venta ni cierre para comprobar este defecto de snapshot. La lectura
remota posterior fue de solo lectura; no hubo deploy de Firebase, cambios de
Rules/IAM/Secrets, limpieza ni escrituras en producción.

## Siguiente gate

`GATE H — CERTIFICACIÓN E2.2`: después de cerrar G, actualizar y auditar la
matriz de certificación contra la evidencia vigente, conservando como
`NOT EXECUTED` los datos, tenant, aceptación y operación real que pertenecen a
Gate I/J/K/L.
