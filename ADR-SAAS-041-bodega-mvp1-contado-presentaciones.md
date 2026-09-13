# ADR-SAAS-041 — Bodega MVP-1: venta de contado con presentaciones comerciales

## Estado

**Aceptado.**

- **Goal rector:** \`G-SAAS-02\` — primer cliente real operando un Trial de 30 días.
- **Milestone:** \`M2 — Provisioning y onboarding\`.
- **Epic:** \`E2.2 — Configuración inicial\`.

La aceptación autoriza únicamente el corte técnico reusable de Bodega MVP-1
dentro de E2.2. No autoriza crear el tenant real, usar datos o secretos reales,
desplegar, operar en producción, activar Wompi ni realizar operación fiscal.

## 1. Contexto

El SaaS POS ya certifica configuración por empresa, membresías, productos, proveedores, compras, inventario/ledger, venta, tesorería, turnos, anulaciones y PWA. Una bodega pequeña de Carepa necesita operar pronto desde una sola ubicación con vendedores móviles y ventas mayoritariamente de contado.

## 2. Problema

El catálogo actual tiene un producto con precio y stock únicos. No representa unidad, paca y caja como equivalencias del mismo inventario. Tampoco contiene un rol vendedor ni el perfil comercial mínimo de un cliente B2B. Reutilizar salón, comandas o cocina como pedido de distribución mezclaría dominios; crear un POS paralelo perdería las garantías existentes.

## 3. Objetivo

Entregar posteriormente un **Bodega MVP-1** tenant-aware en el que un vendedor autorizado pueda, desde Web/PWA, seleccionar un cliente, una presentación y una cantidad, registrar una venta de contado y obtener confirmación, mientras la administración conserva control de catálogo, precios, compras, inventario, caja y reportes básicos.

## 4. Alcance Bodega MVP-1

Incluye configuración aislada de un tenant, clientes empresariales mínimos, vendedor con permisos explícitos, catálogo con presentaciones y precio por presentación, compras e inventario reutilizados, venta directa de contado, caja/comprobante y reportes básicos. Es una única bodega y un único espacio operativo; \`espacioId\` no se redefine como una arquitectura multi-sede.

## 5. Fuera de alcance

Quedan fuera crédito, cartera, abonos, vencimientos, límites, pedidos persistentes, reserva, preparación, despacho, entregas parciales, rutas, comisiones, listas por cliente, promociones, descuentos libres, offline, app nativa, multi-sede, cuentas por pagar, remisión y fiscalidad no certificada.

## 6. Arquitectura propuesta

Se extiende el monolito serverless vigente; no se introducen microservicios, colas ni un segundo POS. La configuración tenant incorpora el campo canónico y versionado \`vertical: BODEGA_MVP1\`; no se infiere el vertical desde combinaciones de módulos y el campo no concede autorización. Las capabilities siguen siendo la autoridad para habilitar módulos. Las nuevas colecciones planas, si se aprueban, contendrán \`empresaId\`; las Functions derivarán tenant y actor desde Auth y membresía, no desde IDs enviados por el cliente. Ventas, compra, inventario y tesorería siguen utilizando sus Commands, transacciones, idempotencia, snapshots y auditoría existentes.

Se descartan duplicar un producto por cada empaque (fragmenta stock), reutilizar \`pedidos_activos\`/comandas (son de salón/cocina), crear pedido/despacho en MVP-1 (añade autoridad innecesaria) y confiar en UI para precios o permisos.

## 7. Presentaciones

Cada \`ProductoBase\` conserva una **unidad base** explícita y es el único artículo inventariable. Una presentación comercial pertenece a un producto y contiene como mínimo:

\`\`\`text
empresaId, productoId, nombre, factorUnidadBase (> 0 entero),
precioCOP (entero >= 1), estado (ACTIVA | INACTIVA),
creadaEn, actualizadaEn
\`\`\`

Ejemplo: \`unidad=1\`, \`paca=6\`, \`caja=24\`. Dos cajas solicitan \`2 × 24 = 48\` unidades base. No hay conversiones entre presentaciones, factores decimales ni inferencia de empaques. Cada venta y movimiento conserva el snapshot de producto, presentación, factor, precio y costo aplicable.

## 8. Precios

MVP-1 usa un único precio vigente por presentación, en COP entero mínimo de \`1\`. No requiere vigencia histórica: el precio se congela en el snapshot de venta y un cambio afecta solo ventas futuras. Solo \`admin\` y el permiso explícito de gestión de catálogo/precios podrán modificarlo mediante autoridad server-side. La Function resuelve presentación y precio canónicos y rechaza precio, costo, descuento o total autoritativo enviados por vendedor.

## 9. Clientes

El cliente continúa siendo una entidad tenant-aware separada del usuario autenticado. MVP-1 reutiliza los campos legacy \`nombre\`, \`cedula\`, \`tipoDocumento\`, \`telefono\` y \`activo\`: \`nombre\` representa el nombre comercial y \`cedula\` el número de documento. Añade únicamente contacto opcional, dirección y barrio/zona opcional. No se persiste vendedor asignado ni relación vendedor→cliente, y no se filtra por vendedor. No se persiste saldo, límite ni condición de crédito. El vendedor consulta todos los clientes activos de su mismo tenant y solo puede crearlos mediante la frontera server-authoritative; no edita ni desactiva clientes existentes. Administración conserva la lectura y CRUD administrativo existentes.

## 10. Vendedores

Se adopta una plantilla de permisos \`vendedor\`; no se reutilizan semánticamente \`cajero\`, \`cocinero\` ni \`supervisor\`. Puede iniciar sesión, consultar todos los clientes activos de su tenant y crear clientes; U2-A no le permite editar ni desactivar clientes existentes. Puede consultar catálogo/precios, crear venta de contado y consultar sus ventas. Puede recaudar efectivo mediante un turno propio limitado y registrar transferencias.

No puede modificar costos/precios, usuarios, membresías, permisos, configuración, compras, finanzas administrativas, otros turnos, otros vendedores ni ventas ajenas salvo permiso futuro explícito. Su turno autoriza solo apertura, su venta de contado y su propio cierre/conciliación; no equivale a una facultad administrativa de caja. Pago mixto queda fuera de MVP-1. Las comprobaciones viven en Functions y Rules; ocultar módulos es solo presentación.

## 11. Flujo de venta

MVP-1 adopta **venta directa**, no \`pedido → despacho\`:

\`\`\`text
Login → Inicio vendedor → Clientes → Cliente → Catálogo → Presentación
→ Cantidad → Resumen → Pago contado → Confirmación
\`\`\`

La confirmación usa el flujo server-authoritative existente. La Function resuelve tenant, actor, producto/presentación, factor, precio, impuestos y cuenta operativa; crea snapshots, acredita pago, registra auditoría y movimiento de inventario idempotente. La venta no equivale a una futura remisión.

## 12. Inventario

La compra confirmada aumenta \`cantidadCompra × factorUnidadBase\`; la venta de contado descuenta \`cantidadVenta × factorUnidadBase\`; ajuste y merma continúan como movimientos explícitos del ledger. MVP-1 no reserva stock: un borrador de UI no muta existencias. El punto único de salida es la confirmación de venta; se preservan secuencia, saldo, referencia, costo snapshot, idempotencia y aislamiento.

## 13. Mobile / PWA

Se reutiliza Web/PWA, con flujo mobile-first, controles grandes, formularios cortos, búsqueda rápida, resumen persistente y estados claros de reintento/error. No se promete offline; las redes intermitentes se manejan con Commands idempotentes.

## 14. Capacidades y módulos

MVP-1 reutiliza solo IDs existentes: \`sell\`, \`inventory\`, \`purchases\`, \`clientes\`, \`reports\`, \`shifts\`, \`finanzas\`, \`gastos\`, \`waste\`, \`permissions\` y \`settings\`, filtrados también por permiso. El vendedor recibe un subconjunto de \`sell\`, \`clientes\` y la operación limitada de \`shifts\`; no recibe los módulos administrativos completos de finanzas/caja.

Se deshabilitan por tenant \`salon\`, \`kitchen\`, \`recipes\`, \`reservas\`, \`alquiler_dashboard\` y \`consignaciones\`. \`vendors\`, \`customers\`, \`products\` y \`cash\` no se introducen como capabilities nuevas hasta aprobar una extensión del catálogo de módulos/planes.

## 15. Seguridad

\`empresaId\` continúa siendo la frontera de aislamiento. Las Rules conservan deny-by-default para hechos críticos; las Functions validan membresía activa, rol/permisos y capacidades antes de cada mutación. El servidor deriva actor, tenant, cuenta, precio y costos; no confía en campos financieros ni IDs de otro tenant. Las pruebas incluirán acceso cross-tenant, elevación de vendedor, manipulación de factor/precio y replay.

Para impedir que el rol \`vendedor\` reciba costos o documentos internos completos,
su lectura de catálogo y de ventas se realiza exclusivamente mediante callables
server-authoritative. Las Rules le niegan la lectura directa de \`productos\` y
\`ventas\`; las Functions derivan \`empresaId\` y actor de Auth y membresía, no de
parámetros del cliente, y devuelven DTOs con un esquema fijo. Las proyecciones
de catálogo incluyen únicamente identificador, nombre, categoría, estado,
unidad y disponibilidad comercial existente; las de ventas propias incluyen
identificador, fecha, cliente, ítems comerciales, cantidades, precio de venta,
total, medio de pago y estado. Nunca incluyen \`costo\`, \`costoUnitario\`,
márgenes, información financiera interna ni selección libre de campos. Esta
frontera no reemplaza la lectura administrativa legítima de los demás roles.

## 16. Fiscalidad

MVP-1 puede operar en modo DEMO/operación inicial bajo los gates existentes. Operación FISCAL, factura electrónica, remisión y ticket físico requieren configuración, numeración, datos autorizados, canal/hardware y certificación específica del tenant; este ADR no los presume ni habilita.

## 17. MVP-2 futuro

MVP-2 podrá introducir un agregado de distribución separado:

\`\`\`text
BORRADOR → CONFIRMADO → DESPACHADO → ENTREGADO
\`\`\`

También podrá añadir crédito/cartera derivada, abonos inmutables, vencimientos, aging, límites, bloqueo por mora y rutas. Requerirá ADR propio para fijar punto de efecto de inventario/venta/cobro, reservas, reversos y entregas parciales; MVP-1 no persiste un pseudo-pedido para anticiparlo.

## 18. Riesgos

| Riesgo | Mitigación |
|---|---|
| Stock fragmentado por empaque | Un producto base y factores enteros canónicos. |
| Precio manipulable | Resolución server-side y snapshot de presentación. |
| Doble descuento | Un único efecto al confirmar venta y clave idempotente. |
| Escalamiento de vendedor | Permisos y verificación servidor/Rules, no solo UI. |
| Confundir ticket con documento fiscal/remisión | Separación DEMO/FISCAL y gate posterior. |
| Expansión logística | Pedido, despacho y crédito quedan en MVP-2. |

## 19. Decisiones pendientes del cliente

Antes de configurar el tenant real deben confirmarse: unidad base y empaques reales por producto; datos obligatorios de cliente; y si el comprobante inicial será solo ticket DEMO o se exige documento fiscal. Para MVP-1 quedan resueltos: precio vigente entero mínimo de \`1\` COP, visibilidad de todos los clientes activos del tenant, efectivo y transferencia, turno propio limitado por vendedor y pago mixto deshabilitado. Entrega posterior, crédito o abono pertenecen a MVP-2.

## 20. Criterios de aceptación para el futuro PR

1. Dos tenants no pueden leer ni mutar datos de presentación, cliente, venta o inventario del otro.
2. Una caja/paca/unidad descuenta exactamente su factor en unidad base y deja snapshots trazables.
3. Un vendedor no puede alterar precio, costo, tenant, cuenta ni permisos, incluso con una llamada manipulada.
4. Una venta de contado idempotente produce una sola venta, efectos financieros y movimiento de inventario.
5. Compra, ajuste y merma conservan el mismo artículo base y ledger.
6. La PWA permite completar el flujo móvil sin módulos de restaurante.
7. Administración ve ventas diarias, por vendedor, inventario, compras, caja, clientes y catálogo.
8. Las suites pertinentes de Functions, Rules, tenant, configuración, inventario y E2E móvil pasan con fixtures sintéticas multi-tenant.

## Consecuencias y siguiente gate

La propuesta maximiza velocidad y reutilización al no crear una logística incompleta. Su coste es que una venta que deba despacharse o cobrarse a crédito no cabe en MVP-1. El primer PR se limita a contratos/capacidades/permisos y pruebas; no crea un tenant real ni incorpora MVP-2.
