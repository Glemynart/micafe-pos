# ADR-MOD-001 — Líneas configuradas, snapshots y fusión

## Estado

Aceptado.

## Contexto

U1 a U3 permiten administrar y seleccionar modificadores, pero las líneas de
pedido solo conservan IDs temporales. Las ventas necesitan reconstruirse sin
consultar el catálogo vivo y las líneas equivalentes deben poder fusionarse de
forma determinística.

## Decisiones

### Contrato de `PedidoItem`

Las líneas nuevas de U4 escriben `schemaVersion: 1`, `configurationKey` y un
snapshot de modificadores. Se mantienen los campos existentes (`id`, `uid`,
`name`, `code`, `price`, `cost`, `category`, `impuestoTipo`, `quantity` y los
campos operativos de cocina) para compatibilidad.

El snapshot de cada grupo seleccionado conserva su ID, nombre y las opciones
seleccionadas con ID, nombre, precio adicional efectivo y nombre de cocina
cuando exista. `precioBaseUnitario` conserva el precio del producto antes de
los adicionales; `price` conserva el precio final unitario.

Los límites, defaults, estado activo y overrides del catálogo no se guardan:
son reglas de selección, no hechos históricos de la línea.

### Contrato de `VentaItem`

Una venta U4 recibe el mismo snapshot de configuración de su `PedidoItem`,
además de `schemaVersion`, `configurationKey`, `precioBaseUnitario`, identidad
de producto, código, categoría, importes y snapshot tributario por línea. La
venta no consulta el catálogo para reconstruir modificadores.

### `configurationKey`

La clave es una representación canónica, legible y sin hash de identificadores
estables exclusivamente:

`mod:v1|p:<productoId>|g:<grupoId>:<opcionId>,<opcionId>|...`

Los grupos se ordenan por `grupoId`, las opciones por `opcionId`, los valores se
codifican para no colisionar con los separadores y los grupos sin selección se
omiten. Una línea sin modificadores usa `mod:v1|p:<productoId>`.

La clave no incluye nombres, precios, códigos ni textos visibles.

### Fusión

Dos líneas U4 se fusionan solo si comparten producto, `configurationKey`, precio
unitario final, costo unitario, categoría e impuesto de la línea. Estos son los
atributos que determinan su equivalencia comercial y contable; el snapshot no
se compara para decidir la fusión y permanece como evidencia histórica.

Las líneas legacy (sin `schemaVersion` o `configurationKey`) permanecen en su
flujo histórico y nunca se fusionan con líneas U4. Las líneas U4 no mutan su
configuración; una edición futura genera una nueva clave y nueva línea.

### Compatibilidad

Los lectores aceptan documentos sin los campos nuevos. Pedidos U3 ya abiertos
con solo `grupoId` y `opcionIds` siguen siendo cobrables como legacy: no se
completan desde el catálogo vivo porque esa información pudo haber cambiado.
No se requiere migración masiva ni nuevas colecciones.

## Consecuencias

- Pedidos, ventas, futuros tickets, KDS y reportes podrán usar el mismo
  snapshot sin lecturas adicionales del catálogo.
- Se incrementa el tamaño de cada línea configurada; se debe vigilar el límite
  de tamaño de documento de Firestore en pedidos muy grandes.
- Impresión, KDS, promociones y combos no se implementan en U4; solo reciben un
  contrato estable para unidades posteriores.
