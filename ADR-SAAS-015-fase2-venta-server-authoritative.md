# ADR-SAAS-015 — Ejecución server-authoritative de la Fase 2 de ventas

## Estado

Aceptado (decisión técnica delegada por el usuario)

## Fecha

2026-08-03

## Goal, Milestone y Epic

- **Goal:** G-MVP-01 — MVP comercial de Café Atrato
- **Milestone:** M2 — Núcleo transaccional íntegro
- **Epic:** E2.1 — Venta server-authoritative
- **PR previsto:** P0-03 — traslado de la Fase 2 de ventas a backend

---

## 1. Contexto

`ADR-SAAS-010` definió la venta como una saga de dos fases:

1. `confirmarVentaFiscalCallable` confirma la venta fiscal, reserva el consecutivo,
   persiste el `snapshotFiscal` y deja `estadoOperativo = PENDIENTE_EFECTOS`.
2. Una transacción local del cliente aplica Ledger de inventario, tesorería y
   transición a `COMPLETO`.

La implementación actual conserva esa frontera en `lib/ventas-service.ts` y en
`lib/reconciliador-operativo-service.ts`. Sin embargo, las Rules ya niegan las
escrituras críticas de cuentas, transacciones financieras y movimientos de
inventario. Además, la lectura de un documento de movimiento inexistente para
comprobar idempotencia produce una evaluación nula en Rules. El resultado
observado es una venta fiscal válida en `PENDIENTE_EFECTOS`, sin efectos
operativos materializados.

El repositorio ya contiene la callable `aplicarEfectosVentaOperativaV1` y su
ejecutor interno `ejecutarAplicarEfectosVentaOperativaV1` en
`functions/src/finanzas/callables.ts`. Ese ejecutor usa Admin SDK, transacción,
recibo de comando, índice de idempotencia y auditoría. También existe un
reconciliador servidor que invoca el mismo ejecutor interno.

`R1-ARQUITECTURA-OPERACIONES-SERVER-AUTHORITATIVE.md` define esta dirección como
arquitectura propuesta para operaciones críticas, pero el mecanismo vigente de
`ADR-SAAS-010` todavía declara al cliente como ejecutor de la Fase 2. Se necesita
una decisión aceptada y acotada para resolver esa divergencia antes de modificar
el código.

## 2. Drivers de decisión

- La autoridad de stock, saldos, movimientos y estado operativo debe residir en
  el servidor.
- No se deben modificar, relajar ni excepcionar las Rules para conservar una
  ruta cliente crítica.
- La creación fiscal de Fase 1 y su `snapshotFiscal` deben permanecer sin cambios.
- La Fase 2 debe conservar idempotencia durable, auditoría y atomicidad.
- El retry después de una pérdida de respuesta no puede duplicar efectos.
- La solución debe reutilizar Firebase Functions y la callable existente.
- La capacidad canónica del MVP es `sell`; no se debe introducir `pos` como una
  capacidad adicional ni modificar el Plan `mvp_comercial`.

## 3. Alternativas consideradas

### Alternativa A — Mantener la Fase 2 en el cliente y ampliar Rules

**Rechazada.** Mantendría al cliente como autoridad de stock, saldo y transición
de venta. También exigiría autorizar lecturas de documentos inexistentes o
escrituras críticas que el modelo server-authoritative pretende impedir.

### Alternativa B — Añadir excepciones de Rules solo para el POS

**Rechazada.** Introduciría una segunda frontera de seguridad, permitiría que el
cliente ejecute efectos derivados y dejaría invariantes multi-documento fuera de
la autoridad del servidor.

### Alternativa C — Crear otro servicio o microservicio para la Fase 2

**Rechazada.** Duplicaría la autoridad ya implementada en Functions, aumentaría
la superficie operativa y no aporta valor para el MVP.

### Alternativa D — Reutilizar `aplicarEfectosVentaOperativaV1`

**Seleccionada.** La callable existente ya contiene el ejecutor transaccional,
las validaciones canónicas y el contrato de evidencia necesario. El cliente solo
emitirá una intención mínima identificada por `ventaId`.

## 4. Decisión

La Fase 2 crítica de ventas se ejecutará exclusivamente mediante
`aplicarEfectosVentaOperativaV1` o su ejecutor interno de reconciliación. El POS
no ejecutará una transacción local para aplicar Ledger, tesorería o
`estadoOperativo`.

### 4.1 Contrato de la intención cliente

Después de una Fase 1 confirmada, el cliente invocará la callable con un envelope
de comando:

```ts
{
  commandId: `efectos-venta:${ventaId}`,
  idempotencyKey: `efectos-venta:${ventaId}`,
  correlationId: `corr-efectos-venta:${ventaId}`,
  causationId: `cmd_sale_${ventaId}`,
  payload: { ventaId }
}
```

El payload no podrá transportar autoridad ni cálculos derivados. El servidor
leerá desde la venta fiscal:

- tenant y estado de la empresa;
- actor y membresía vigentes;
- estado `PENDIENTE_EFECTOS`;
- ítems, cantidades, pago y total;
- recetas, artículos, cuentas y turno aplicable.

La capacidad exigida para la operación será `sell`, que es la capacidad aprobada
por `mvp_comercial`. El uso histórico de `pos` en la guardia de la callable se
alineará a `sell`; no se agregará `pos` al Plan ni a las membresías.

### 4.2 Transacción server-authoritative

`aplicarEfectosVentaOperativaV1` mantendrá una única transacción Admin SDK que:

1. revalida empresa, membresía, rol y capacidad;
2. comprueba que la venta está exactamente en `PENDIENTE_EFECTOS`;
3. resuelve recetas, artículos y consumos desde Firestore;
4. valida las claves idempotentes de inventario y tesorería;
5. escribe movimientos financieros y de inventario;
6. actualiza saldo, stock y secuencia en la misma transacción;
7. transiciona la venta a `COMPLETO`;
8. escribe recibo, índice idempotente y auditoría operativa.

La semántica existente de cobro se conserva: cuando la venta está en estado
`pagada`, el servidor deriva y acredita sus piernas de pago; cuando la venta no
está pagada (por ejemplo, `cuenta_cobro`), no crea movimientos financieros ni
actualiza saldos, pero sí aplica los efectos de inventario y completa la venta,
igual que la Fase 2 anterior.

Cuando la venta provenga de un pedido activo, el mismo comando cerrará
`pedidos_activos` y las comandas asociadas dentro de la transacción server-side.
Así `cobrarPedido` no dejará una proyección de pedido abierta después de que la
venta ya haya quedado completa. En una venta directa no se modifica ninguna
proyección de pedido.

### 4.3 Reintentos y reconciliación

- Una respuesta perdida se reintentará con el mismo envelope derivado de
  `ventaId`.
- `executeConContexto` devolverá el recibo previo sin repetir efectos.
- Una venta que permanezca pendiente seguirá siendo procesada por
  `reconciliarVentasPendientesOperativas`, usando el mismo ejecutor interno y
  sin una ruta cliente alternativa.
- Un fallo no anulará automáticamente la venta fiscal ni consumirá efectos
  parciales fuera de la transacción.

### 4.4 Cambio en los consumidores cliente

El PR de implementación eliminará la ejecución local de Fase 2 en:

- `registrarVenta`;
- `cobrarPedido`;
- `reconciliador-operativo-service.ts`.

Los consumidores conservarán la UX, la consulta de estado y el manejo de
errores. No escribirán directamente `movimientos_inventario`,
`transacciones_financieras`, `cuentas_bancarias`, `productos`, `insumos` ni el
estado operativo crítico de `ventas` para completar una venta.

La anulación de ventas y otras operaciones críticas no forman parte de este ADR;
seguirán su alcance y decisión propios.

## 5. Garantías conservadas

- **Idempotencia:** una clave determinista por venta y por efecto; replays sin
  duplicación.
- **Auditoría:** recibo de comando, índice, actor, correlación, causación y
  ejecutor técnico persistidos por el contrato existente.
- **Transacción:** Ledger, tesorería, stock, secuencia, venta y cierre del pedido
  se confirman o rechazan juntos.
- **Autoridad del servidor:** tenant, actor, permisos, pago, stock, saldo y
  cálculos se derivan o revalidan en backend.
- **Aislamiento tenant:** la callable conserva la empresa derivada del token y
  verifica la membresía canónica dentro de la transacción.
- **Fiscalidad:** Fase 1, consecutivo y `snapshotFiscal` permanecen bajo
  `confirmarVentaFiscalCallable`.

## 6. Alcance del PR derivado

### Incluido

- Invocación de `aplicarEfectosVentaOperativaV1` desde los tres consumidores de
  Fase 2.
- Alineación de la capacidad `pos` histórica a `sell` para el MVP aprobado.
- Cierre server-side de pedido y comandas cuando corresponda.
- Pruebas unitarias de éxito, tenant, lifecycle, permiso, estado, replay,
  atomicidad y fallo parcial.
- Prueba local de venta con transferencia y verificación de stock, saldo,
  movimientos, estado, recibo y auditoría.

### Fuera de alcance

- Cualquier modificación de `firestore.rules`.
- Cambio del Plan `mvp_comercial`, sus capacidades o módulos.
- Cambios en Fase 1, numeración, `snapshotFiscal` o identidad fiscal.
- Rediseño de anulaciones, compras, turnos, producción o devoluciones.
- Nuevos proveedores, microservicios, colas o migraciones de datos.
- Escrituras o despliegues en producción.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Fase 1 confirmada y respuesta de Fase 2 perdida | Retry determinista y reconciliador servidor existente. |
| Cliente antiguo continúa usando la ruta local | La ruta local seguirá rechazada por Rules; el despliegue del cliente y Functions debe validarse como unidad. |
| Venta desde pedido deja pedido abierto | Cierre de pedido y comandas dentro de la transacción server-side. |
| Capacidad histórica `pos` no coincide con el Plan | Guardar `sell` como capacidad canónica y cubrirlo con pruebas de membresía. |
| Error en una venta pendiente | Mantener `PENDIENTE_EFECTOS`, registrar warning y reintentar; nunca autoanular. |

## 8. Rollback

La callable y el ejecutor interno son compatibles de forma aditiva y pueden
permanecer desplegados aunque el cliente se revierta. Revertir el cliente
restauraría una ruta que ya está bloqueada por Rules y dejaría ventas pendientes,
pero no reabriría escrituras críticas ni produciría datos parcialmente aplicados.
Las ventas pendientes se recuperan mediante el reconciliador server-side. No se
revierte ninguna escritura de producción desde este PR.

## 9. Criterios de aceptación arquitectónica

1. Ningún consumidor cliente ejecuta la transacción crítica de Fase 2.
2. La callable completa una venta válida en una única transacción Admin SDK.
3. Un retry con el mismo envelope no duplica movimientos, saldos, stock,
   recibos ni auditoría.
4. Una venta no operativa, una membresía revocada, una capacidad ausente o una
   venta no pendiente son rechazadas sin mutaciones.
5. Una venta directa y una venta proveniente de pedido terminan con sus
   proyecciones correctas.
6. Las Rules permanecen sin cambios.
7. La prueba local verifica `COMPLETO`, stock decrementado, cuenta acreditada,
   movimientos, recibo, auditoría y ausencia de duplicados.

## 10. Referencias

- `ADR-SAAS-010-integracion-fiscal-inventario.md`
- `R1-ARQUITECTURA-OPERACIONES-SERVER-AUTHORITATIVE.md`
- `MASTER-SECURITY-PLAN.md`
- `functions/src/finanzas/callables.ts`
- `functions/src/finanzas/reconciliador.ts`
- `lib/ventas-service.ts`
- `lib/reconciliador-operativo-service.ts`
