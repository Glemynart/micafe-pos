# ADR-SAAS-071 — Frontera de compras Bodega y señales de disponibilidad

## Estado

**PROPUESTO — Opción 1 recomendada; pendiente de aprobación explícita.**

- **Fecha:** 2026-10-11.
- **Última revisión:** 2026-10-11.
- **Goal:** `G-SAAS-02` → `M2` → `E2.2`.
- **Decisor:** responsable del proyecto. **Recomendación técnica:** Lead Engineer.
- **Relacionados:** ADR-SAAS-049, ADR-SAAS-054 y ADR-SAAS-069.
- **Límite:** esta propuesta no cambia código, Rules, Functions, tráfico ni datos.
  No autoriza deploy, tenant real, Bootstrap/Activation, IAM, Secrets ni
  producción. Solo al aceptarse autorizaría una PR de implementación separada.

## Contexto

ADR-SAAS-069 acepta señales tenant-aware y exige que cada transacción canónica
que cambie disponibilidad actualice su señal atómicamente. PR #537 integró esa
señal en `functions/src/finanzas/compras.ts`, además de los handlers Bodega de
inventario, ventas, solicitudes y agenda.

La ruta de compra existente, `registrarCompraOperativaV1`, se exporta desde
`functions/src/index.ts` y pertenece al codebase monolítico `saas-auth`. El
codebase aislado `saas-bodega-operations` descubre actualmente seis callables;
su cierre de compilación no incluye el módulo de compras. La lectura de staging
del 2026-10-11 encontró 43 Functions, pero ninguna del codebase `saas-auth` ni
una callable `registrarCompraOperativaV1`.

ADR-SAAS-049 y ADR-SAAS-054 prohíben ampliar o desplegar `saas-auth` como atajo:
su discovery incluye superficies ajenas, Secrets y no tiene una revisión
staging conocida para rollback. Por ello no se puede publicar de forma aislada
el cambio de compras de PR #537 dentro del boundary ya autorizado.

## Problema

La actualización de disponibilidad tras una compra debe mantener la autoridad
transaccional del servidor y la señal de ADR-SAAS-069, sin abrir `saas-auth`,
duplicar la lógica de compras ni colisionar con la callable legacy que conserva
ese nombre para otros verticales.

## Invariantes y restricciones

- Compra, movimiento de inventario, efectos financieros, idempotencia y señal
  permanecen dentro de la autoridad y transacción canónicas.
- La señal no contiene datos comerciales y se actualiza atómicamente con el
  movimiento de inventario.
- No se despliega `saas-auth` ni se amplía su discovery, Secrets o tráfico.
- El POS Bodega no escribe compras ni señales directamente en Firestore.
- El nombre público nuevo debe coexistir con `registrarCompraOperativaV1` sin
  reemplazarlo ni crear dos funciones con el mismo nombre.
- La aprobación de esta ADR no autoriza despliegue ni datos reales.

## Impulsores de decisión

- Mantener el aislamiento de Bodega aprobado por ADR-SAAS-049/054.
- Conservar una sola lógica canónica para compra, costos, inventario y ledger.
- Actualizar la disponibilidad en la misma transacción que agrega stock.
- Preservar la callable legacy para los verticales que todavía la utilizan.
- Mantener `saas-bodega-operations` libre de Secrets y de imports de
  `operational-auth.ts`.

## Opciones

### Opción 1 — Callable Bodega aislada para registrar compras (recomendada)

Agregar `registrarCompraBodegaV1` a `saas-bodega-operations`. Extraer de la
ruta actual un núcleo transaccional neutral y reutilizable, sin importar
`operational-auth.ts` ni declarar Secrets. El flujo Bodega invocaría el nuevo
nombre únicamente para `BODEGA_MVP1`; `registrarCompraOperativaV1` permanecería
intacta para los demás verticales.

- **Ventajas:** conserva aislamiento, permite actualizar señal/stock/ledger en
  una transacción y evita colisión con la ruta legacy.
- **Costes:** amplía de seis a siete callables el alcance de ADR-SAAS-054;
  requiere extraer/revisar el núcleo compartido, adaptar la ruta de UI y
  certificar ambos dispatches.

### Opción 2 — Desplegar `saas-auth` con el cambio de compras

Incluir el cambio de `functions/src/finanzas/compras.ts` en un deploy del
codebase monolítico.

- **Ventaja:** conserva el nombre y la ruta de compra actuales.
- **Costes:** contradice los límites de ADR-SAAS-049/054; discovery, Secrets,
  tráfico y rollback abarcan superficies ajenas a Bodega. No se recomienda ni
  queda autorizado por esta ADR.

### Opción 3 — Retirar de compras la señal de ADR-SAAS-069

Revertir o no publicar el cambio de señal en compras y aceptar que la vista de
disponibilidad no converja automáticamente tras una compra.

- **Ventaja:** mantiene el boundary de seis callables.
- **Costes:** debilita una decisión aceptada y deja obsoleta la disponibilidad
  después de la operación que agrega stock; requeriría una decisión explícita
  que modifique ADR-SAAS-069 y no satisface el objetivo de sincronización
  aprobado.

## Decisión propuesta y fundamento

Se recomienda la **Opción 1**: una callable Bodega con nombre distinto,
reutilizando un núcleo transaccional neutral y manteniendo la ruta legacy para
otros verticales. Es la opción que conserva el aislamiento ya aprobado sin
perder el comportamiento de disponibilidad acordado.

La Opción 2 amplía `saas-auth` y contradice los límites de las ADR vigentes. La
Opción 3 deja una vista obsoleta tras compras y debilita ADR-SAAS-069. Esta ADR
permanece `PROPUESTA`: hasta recibir aprobación explícita no se implementará la
nueva callable ni se cambiará la ruta de compras.

## Consecuencias si se acepta

### Positivas

- Las compras Bodega actualizarían su disponibilidad sin lectura directa de
  datos de negocio por el vendedor.
- Se conserva el ledger, la idempotencia y la autoridad transaccional existente.
- La frontera operativa sigue aislada de `saas-auth` y de sus Secrets.

### Costes

- `saas-bodega-operations` crece una callable y requiere un preflight/deploy
  nuevo, además de repetir las validaciones afectadas F/G/H.
- El núcleo común de compras requiere una extracción revisada para no importar
  el wrapper legacy ni duplicar comportamiento.

### Neutras

- La callable legacy se conserva para los verticales no Bodega; no se retira ni
  se redirige mediante esta ADR.

## Contrato mínimo de implementación si se acepta

- La callable Bodega deriva tenant, actor, rol y permisos en servidor.
- Reusa el cálculo, validaciones, ledger y mecanismo de idempotencia
  transaccionales de compra; no duplica reglas de negocio.
- Cuando la compra afecte productos Bodega, escribe compra, movimientos de
  inventario/finanzas y señal de disponibilidad en una única transacción.
- El cliente no aporta totales, costos derivados, identidad tenant ni señal.
- `saas-auth` conserva su export legacy y queda fuera de cualquier deploy de
  este cambio.
- Discovery esperado: siete callables Gen 2, `us-central1`, Node.js 22, cero
  Secrets para `saas-bodega-operations`.
- Pruebas: autoridad, tenant A/B, permisos `purchases`, validación de payload,
  costo/total server-side, idempotencia/replay, inventario/ledger, señal
  atómica, fallo/reintento y coexistencia del flujo no Bodega.
- Antes de deploy: preflight C dirigido, rollback por revisión conocida, sin
  deletes ni tráfico sobre `saas-auth`; Gate D separado y revalidación F/G/H.

## Rollback

Antes del deploy, revertir la PR de implementación. Después, restaurar la
revisión conocida de `saas-bodega-operations` y el cliente compatible mediante
el gate de rollback correspondiente. No se borran compras, movimientos,
inventario ni ledger para revertir código; cualquier corrección de hechos
requiere una operación compensatoria canónica.

## Decisión solicitada

**¿Apruebas la Opción 1** — callable `registrarCompraBodegaV1` en
`saas-bodega-operations`, núcleo transaccional reutilizable, dispatch Bodega
específico y `saas-auth` sin cambios? La aprobación autorizaría preparar la PR
de implementación; no autorizaría su deploy ni mutaciones de datos.

## Decisiones relacionadas

- [ADR-SAAS-049 — Aislamiento de codebase Bodega MVP-1 para staging](ADR-SAAS-049-aislamiento-codebase-bodega-staging.md)
- [ADR-SAAS-054 — Superficie operativa Bodega y alta controlada de operadores para staging](ADR-SAAS-054-superficie-operativa-bodega-staging.md)
- [ADR-SAAS-069 — Sincronización viva de disponibilidad y solicitudes Bodega](ADR-SAAS-069-bodega-sincronizacion-viva.md)
- [Gate C preflight ADR-069 del 2026-10-11](docs/goals/evidence/G-SAAS-02-E2-2-GATE-C-ADR069-PREFLIGHT-2026-10-11.md)
