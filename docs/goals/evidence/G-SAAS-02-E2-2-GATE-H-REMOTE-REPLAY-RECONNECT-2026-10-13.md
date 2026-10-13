# G-SAAS-02 / M2 / E2.2 — Gate H: replay y reconexión remotos (2026-10-13)

## Dictamen

`GATE_H_REMOTE_REPLAY_AND_RECONNECT = PASS` para los escenarios remotos de
idempotencia y reconexión del fixture Bodega en staging. La evidencia combina
la observación del navegador del operador con una conciliación posterior
read-only de Firestore. No certifica producción, el tenant real, el Trial ni el
Goal completo. Gate F sigue pendiente y Gate I sigue bloqueado.

## Identidad y alcance

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2 — Provisioning y onboarding` /
  `E2.2 — Configuración inicial`.
- **Proyecto Firebase:** `micafe-pos-staging`.
- **Tenant:** `E2_2-BODEGA-STAGING-FIXTURE` (sintético).
- **Preview observado:**
  `https://cafeatrato-git-codex-e2-2-gate-g-rev-3e1c86-glemynarts-projects.vercel.app/`.
  El host y SHA exacto del artefacto web no se verificaron de forma independiente;
  el Network del navegador apuntó a las callables del proyecto de staging.
- **Sesiones:** vendedor sintético en navegador integrado y admin sintético en
  Edge.
- **ADR aplicables:** ADR-SAAS-062 (aprobación de solicitud), ADR-SAAS-069
  (relectura al reconectar) y ADR-SAAS-076 (namespace de once callables Bodega).
- **Entornos excluidos:** producción y el tenant real no se consultaron ni
  modificaron.

## Matriz remota

| Escenario | Resultado | Evidencia y límite |
|---|---|---|
| Pérdida simulada de la respuesta después del commit | PASS | El wrapper de Gate H dejó completar la primera llamada al servidor y luego ocultó su respuesta al cliente. `window.__gateHReplay.state` devolvió `replay_ok`, `firstStatus: 200`, `retryStatus: 200` y `sameBody: true`. La recuperación reenvió el mismo comando con el mismo cuerpo; no se volvió a confirmar la venta desde la UI. |
| Reconexión del catálogo del vendedor | PASS — reporte del operador | Tras alternar la conexión de la pestaña del vendedor de `Sin conexión` a `Sin limitaciones`, se observó `consultarCatalogoPresentacionesVendedorBodegaV1`; el operador confirmó HTTP `200`. No se solicitó recargar la página. La captura de la lista de Red muestra el endpoint, pero no deja legible la columna de estado. |
| Reconexión de solicitudes de administración | PASS — reporte del operador | En Edge se observó `consultarSolicitudesVentaBodegaV1`; el operador confirmó HTTP `200`. La captura muestra el endpoint; el código de estado se basa en la confirmación del operador y no en una captura legible del panel de detalles. |
| Efectos únicos de la venta recuperada | PASS | La conciliación read-only posterior encontró una solicitud asociada `EJECUTADA`, una venta pagada por transferencia de `$5.000 COP`, un recibo `CONFIRMADO`, una clave/registro de idempotencia, una auditoría `CONFIRMADO`, un movimiento de inventario de `-2` unidades base y un movimiento financiero de `$5.000 COP`. No se observó una segunda aplicación de los efectos. |
| Saldo de inventario y ledger | PASS | El producto quedó con 2 unidades físicas, 2 reservadas por la agenda de Gate F y 0 disponibles. Los 35 movimientos del ledger suman 2 unidades, igual al stock físico. La venta recuperada consumió las 2 unidades no reservadas; la reserva no se alteró. |

La lectura de la venta ocurrió el `2026-10-13T18:19:25Z` (`13:19:25`, hora de
Bogotá). Los códigos `200` de reconexión son una confirmación del operador;
no se midieron latencias ni se establece un SLA.

## Escrituras y límites

- La única escritura de negocio atribuida a esta revalidación fue la venta
  sintética que originó el ensayo de pérdida de respuesta. Su repetición
  idempotente recuperó el resultado ya confirmado sin duplicar efectos.
- Las pruebas de reconexión fueron lecturas; no generaron ventas ni movimientos
  adicionales.
- No se alteró el stock para esta revalidación, la agenda, Rules, Functions,
  IAM, Secrets, membresías, configuración de tenant, tenant real o producción.
- Esta evidencia revalida Gate H con el namespace aprobado en ADR-SAAS-076; no
  se reutilizan como prueba las sesiones ni los resultados del preview anterior.
- Gate F requiere todavía observar el vencimiento automático de la agenda y la
  liberación de sus unidades reservadas. Gate I conserva sus bloqueos
  independientes de producción.

## Validaciones

- Conciliación Firestore: read-only, limitada a `micafe-pos-staging` y al
  fixture sintético.
- Navegador: respuestas de replay y reconexión observadas/reportadas en las
  sesiones sintéticas descritas arriba.
- No aplican pruebas de código: este cambio solo registra evidencia existente.

---
