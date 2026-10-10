# ADR-SAAS-070 — Precio especial de productos en Bodega MVP-1

## Estado

**ACEPTADO — Opción 1, 2026-10-10.**

- **Fecha de propuesta:** 2026-10-10.
- **Última revisión:** 2026-10-10.
- **Fecha de aceptación:** 2026-10-10.
- **Decisión:** el responsable confirmó que `1.600.000 COP` corresponde
  únicamente a la oferta anual del software, no a precios de productos del POS.
- **Goal:** `G-SAAS-02` → `M2` → `E2.2`.
- **Decisor:** responsable del proyecto.
- **Relacionado:** ADR-SAAS-041, ADR-SAAS-042, ADR-SAAS-061 y ADR-SAAS-062.
- **Límite:** esta propuesta no cambia el modelo de precios, no importa el
  catálogo y no autoriza escrituras en staging, tenant real o producción.

## Contexto

El catálogo Bodega vigente almacena un único `precioCOP` por presentación
comercial en `presentaciones_producto`. La administración lo gestiona mediante
Functions; el POS vendedor recibe una proyección autorizada y las operaciones
de solicitud/venta vuelven a resolver el precio canónico en servidor. La venta
congela el precio en su snapshot.

ADR-SAAS-041 define ese único precio vigente por presentación como contrato de
MVP-1 y excluye listas por cliente y descuentos libres. ADR-SAAS-062 conserva el
precio resuelto por el servidor en la solicitud aprobada y la invalida si el
catálogo/precio cambia antes de confirmar la venta.

El responsable entregó una lista de 110 presentaciones y aclaró que sus valores
impresos son precios de venta al cliente. El 2026-10-10 confirmó que el precio
especial de `1.600.000 COP` es únicamente la oferta anual del software, ya
formalizada por separado bajo ADR-SAAS-061. No solicitó en esta decisión una
tarifa de producto diferente por comprador.

## Criterios de decisión

- Preservar el precio de venta impreso como precio base, sin convertirlo por
  inferencia en una tarifa alterna.
- Mantener el precio efectivo, sus snapshots y la revalidación bajo autoridad
  server-side, sin aceptar precio ni descuento autoritativo del vendedor.
- Evitar una nueva entidad o migración si el requerimiento no necesita precios
  distintos por comprador.
- Si se requieren tarifas diferenciadas, definir el fallback y la regla
  aprobada antes de cargar valores reales.

## Invariantes y restricciones

- El precio de suscripción del tenant y el precio de venta de una presentación
  son conceptos separados.
- El precio efectivo de una venta siempre se resuelve server-side; un vendedor
  no puede enviar ni sobrescribir precio, descuento, subtotal o total.
- La solicitud aprobada y la venta deben conservar el mismo snapshot comercial
  o invalidarse si el precio canónico cambió, de acuerdo con ADR-SAAS-062.
- Los valores impresos no se convierten por inferencia en una tarifa alterna.
- No se altera stock, costo, ledger ni el contrato financiero de la venta por
  elegir un modelo de precios.

## Opciones

### Opción 1 — Un precio tenant-específico por presentación

Usar `presentaciones_producto.precioCOP` como precio vigente para todos los
clientes compradores de ese tenant. Los 110 valores impresos serían la fuente
de esos precios una vez que la administradora valide nombres, empaques y
valores. La oferta anual de software continúa separada bajo ADR-SAAS-061.

- **A favor:** coincide con ADR-SAAS-041 y con el modelo existente; no agrega
  otra autoridad ni migración.
- **En contra:** no permite cobrar valores distintos a compradores diferentes
  por una misma presentación.

### Opción 2 — Precio alterno por cliente comprador y presentación

Conservar el precio actual como precio base y agregar una sobreescritura
tenant-aware indexada por `(empresaId, clienteId, presentacionId)`. El catálogo
vendedor tendría que resolverse después de seleccionar un cliente; solicitud,
aprobación y venta usarían el mismo resolvedor server-side. La ausencia de una
sobreescritura usaría el precio base.

- **A favor:** satisface tarifas negociadas con compradores específicos sin
  aceptar precios enviados por el vendedor.
- **En contra:** agrega un modelo, comandos administrativos, reglas de lectura,
  consultas, snapshots, expiración/actualización y pruebas de aislamiento. Es
  una ampliación de alcance que supersede parcialmente la exclusión de listas
  por cliente de ADR-SAAS-041 y requiere revalidar Gate F, G y H.

### Opción 3 — Listas de precio asignables a clientes

Crear listas versionadas con varias tarifas y asignarlas a clientes o grupos.

- **A favor:** soporta segmentos y cambios coordinados de tarifa.
- **En contra:** es más general que el requisito conocido, añade ciclo de vida
  y operación comercial, y no está justificada para el MVP-1 documentado.

## Decisión aceptada

El responsable aprobó la **Opción 1**. Se conserva un único precio vigente por
presentación para todos los compradores del tenant; `1.600.000 COP` queda
exclusivamente como oferta anual del software bajo ADR-SAAS-061. No se agrega
una lista ni sobreescritura por cliente comprador. Un cambio futuro a precios
por comprador requerirá un nuevo alcance y decisión explícitos.

## Consecuencias y límites de la decisión

- ADR-SAAS-041 continúa siendo el contrato de precio operativo: `precioCOP`
  único por presentación, resuelto y congelado server-side.
- La oferta anual del software continúa separada bajo ADR-SAAS-061.
- La transcripción de 110 referencias sigue siendo un borrador hasta que Diana
  valide nombres, empaques y valores; esta decisión no autoriza su importación
  ni la carga de catálogo en un tenant real.

## Rollback

No hay cambios de runtime ni datos por esta aceptación. Un cambio futuro a
tarifas diferenciadas requeriría una nueva decisión/ADR y no debe borrar
snapshots de ventas confirmadas ni editar su ledger.

## Referencias

- `ADR-SAAS-041-bodega-mvp1-contado-presentaciones.md` — precio y exclusiones
  vigentes de Bodega MVP-1.
- `ADR-SAAS-042-bodega-u3-confirmacion-atomica-venta.md` — resolución
  server-authoritative y snapshot de precio.
- `ADR-SAAS-061-oferta-comercial-tenant-especifica.md` — precio excepcional
  anual de la suscripción.
- `ADR-SAAS-062-aprobacion-previa-ventas-bodega.md` — snapshot e invalidación
  de solicitudes cuando cambia el precio.
- `docs/goals/evidence/G-SAAS-02-E2-2-GATE-I-PREFLIGHT-RECONCILIATION-2026-10-10.md`.
