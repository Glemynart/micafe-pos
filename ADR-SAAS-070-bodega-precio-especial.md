# ADR-SAAS-070 — Precio especial de productos en Bodega MVP-1

## Estado

**PROPUESTO — pendiente de aprobación explícita del responsable.**

- **Fecha de propuesta:** 2026-10-10.
- **Última revisión:** 2026-10-10.
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
impresos son precios de venta al cliente. También confirmó que quiere manejar un
precio especial para el tenant de referencia, pero no se ha especificado si se
refiere únicamente a la oferta SaaS anual —formalizada por
separado bajo ADR-SAAS-061— o a precios diferentes para los clientes compradores
del tenant dentro del POS. No hay importes ni regla por producto para una
segunda tarifa. La aprobación de la necesidad comercial no define por sí sola
la autoridad, el modelo ni la resolución técnica.

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

## Recomendación propuesta

Mantener la **Opción 1** mientras no se confirme que un comprador del tenant
debe pagar un precio diferente por la misma presentación. La lista impresa ya
fue descrita como precio de venta al cliente y ADR-SAAS-061 cubre por separado
el precio anual especial de la suscripción. Si la solicitud se refiere a una
tarifa negociada para un cliente comprador, elegir explícitamente la Opción 2;
no se debe simularla cambiando el precio base ni inventar importes.

## Decisión requerida

La solicitud de manejar un precio especial está confirmada; sigue pendiente
definir su alcance. ADR-SAAS-070 permanece `PROPUESTO`. El responsable debe
confirmar cuál de estas reglas aplica a los precios de productos del POS:

1. **Opción 1:** los precios impresos son el único precio vigente por
   presentación para todos los clientes compradores del tenant; cualquier
   precio “especial” se refiere solo a la oferta SaaS anual de ADR-SAAS-061.
2. **Opción 2:** hay precios diferentes según cliente comprador; confirmar la
   regla (qué cliente, presentaciones afectadas, vigencia y fallback) y aprobar
   importes por presentación antes de cargarlos.

La Opción 3 no se recomienda para E2.2 sin un requisito adicional aprobado.
La aprobación de esta ADR no autoriza la carga: aún se requiere que la
administración valide el catálogo y que se mantenga fuera del sistema cualquier
precio cuyo valor o aplicación no esté confirmado.

## Consecuencias si se aprueba la Opción 2

- Crear un PR de implementación separado después de aceptar ADR-SAAS-070 y
  actualizar los documentos maestros afectados.
- Mantener como autoridad al backend y preservar el envelope cerrado de venta;
  no ampliar el payload con precio autoritativo.
- Probar consulta por cliente, fallback a precio base, aislamiento entre
  tenants/clientes, cambios de precio y snapshot idéntico entre solicitud,
  aprobación y venta, con idempotencia y replay.
- No cargar historial o precios reales hasta tener una matriz confirmada por
  cliente y presentación.

## Rollback

No hay cambios de runtime ni datos mientras la ADR permanezca propuesta. Si la
Opción 2 se implementa y luego se revierte, retirar la resolución/consulta de
sobreescrituras por un PR compatible; no borrar snapshots de ventas ya
confirmadas ni editar su ledger.

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
