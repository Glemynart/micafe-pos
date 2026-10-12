# G-SAAS-02 / M2 / E2.2 — Gate H: reconexión y replay (2026-10-12, Bogotá)

## Dictamen

`GATE_H_REVALIDATION = CERTIFIED` para el alcance reusable de E2.2 en staging.
Esta evidencia cierra los dos huecos que dejó `PARTIAL / NOT CLOSED` la matriz
del 2026-10-11: reconexión automática conforme a ADR-SAAS-069 y replay remoto
de una venta después de perder la respuesta post-commit. No certifica latencia
comercial, producción, el tenant real, el Trial ni el Goal completo. Gate I no
se inicia con esta evidencia.

## Identidad y base

- **Goal / Milestone / Epic:** `G-SAAS-02` / `M2` / `E2.2`.
- **Proyecto:** `micafe-pos-staging`.
- **Tenant:** `E2_2-BODEGA-STAGING-FIXTURE` (sintético).
- **Código probado:** preview de PR #558, SHA `047ae76e5644c5b0de7a9376fd2a286d3fff8c04`.
- **Integración:** PR #558 quedó fusionado en `main` mediante
  `54566fc26c0f555baa4b1775c2a1ba5eff716c1c` el `2026-10-12T05:38:50Z`.
- **Post-merge CI:** run `38208848199`; seguía `in_progress` al preparar esta
  evidencia. La CI del PR, Vercel Preview y Vercel Preview Comments terminaron
  `success` antes del merge.
- **Sesiones:** vendedor sintético en el navegador integrado y administrador
  sintético en Edge; ambas pestañas correspondían al mismo preview vigente.
- **Entornos excluidos:** producción y el tenant real no se consultaron ni
  modificaron. `vercel.json` mantiene los despliegues Git automáticos de `main`
  deshabilitados.

## Matriz de revalidación

| Escenario | Estado | Evidencia |
|---|---|---|
| Reconexión del catálogo del vendedor | PASS | Se forzó `offline` y luego `online` en la pestaña autenticada. `navigator.onLine` pasó a `false` y después a `true`; sin pulsar «Actualizar», el preview llamó `consultarCatalogoPresentacionesVendedorV1` y recibió HTTP `200`. La vista continuó autenticada y mostró disponibilidad vigente: `0` presentaciones completas. |
| Reconexión de la bandeja administrativa | PASS | En la bandeja autenticada de solicitudes se repitió el ciclo `offline` → `online`. Sin actualización manual, `consultarSolicitudesVentaBodegaV1` respondió HTTP `200`; la bandeja mostró su estado canónico vacío y la sesión siguió activa. |
| Latencia observada en staging | PASS — observación, no SLA | En una muestra por rol, la primera solicitud canónica comenzó dentro de `1 ms` del evento `online`. La respuesta fue `200` en `370 ms` para vendedor y `1.155 ms` para administración. No se establece ni infiere un SLA. |
| Lecturas posteriores a la reconexión | OBSERVACIÓN | Se observaron dos lecturas canónicas HTTP `200` por rol: la relectura directa al evento `online` y otra tras el primer snapshot de señal reconectado. No hubo escrituras de negocio ni divergencia; es una lectura adicional acotada, no una segunda operación. |
| Replay remoto después de perder la respuesta | PASS | Para la solicitud sintética `…MYMNKIL0`, el servidor completó la confirmación canónica y respondió HTTP `200`; se interrumpió la respuesta antes de que el vendedor la recibiera. «Recuperar confirmación» reenvió el mismo comando/idempotency key con el mismo cuerpo serializado (978 bytes, igualdad byte a byte). La interfaz recuperó la confirmación; el historial del vendedor y Reportes de administración muestran una sola venta de `$5.000 COP`. |
| Conciliación de venta y stock | PASS | Venta en efectivo de una presentación (2 unidades base), recibido `$5.000 COP`, cambio `$0`, sin turno. El inventario final leído por administración fue 1 unidad base física, 0 reservadas y 1 disponible; como la presentación requiere 2 unidades, el vendedor mostró 0 presentaciones vendibles. No se registró una venta duplicada ni se agregó stock durante esta revalidación. |

## Alcance y mutaciones

- La única escritura de negocio de este ensayo fue la venta sintética autorizada
  del comando `…MYMNKIL0` en staging y su descuento canónico de 2 unidades
  base. No se ejecutó otra venta ni se alteró una reserva.
- El evento `online`, las lecturas de callables y la repetición idempotente no
  generaron efectos duplicados. El replay recuperó el mismo resultado de la
  venta ya confirmada.
- No se modificaron Rules, Functions, IAM, Secrets, membresías, tenant real ni
  producción. No se desplegó código a producción.
- La certificación se limita a las revalidaciones de esta matriz más las filas
  `PASS` heredadas de
  [Gate H — compra y efectivo sin turno (2026-10-11)](G-SAAS-02-E2-2-GATE-H-POST-PURCHASE-REVALIDATION-2026-10-11.md)
  y de la certificación integral de
  [Gate H (2026-10-10)](G-SAAS-02-E2-2-GATE-H-CERTIFICATION-2026-10-10.md).

## Resultado

Gate H queda certificado para E2.2 reusable en staging. Gate I sigue separado:
esta prueba no crea ni configura el tenant real, no publica una oferta, no inicia
un Trial y no autoriza escrituras productivas. La decisión de iniciar Gate I
debe usar el preflight reconciliado vigente y sus controles propios.

**Fecha de la revalidación:** 2026-10-12, 00:34–00:42 (America/Bogota).
