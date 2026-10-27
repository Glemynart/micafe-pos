# G-SAAS-02 / E2.2 — Plan offline para los dos catálogos de Diana

## Estado

`PREPARACIÓN LOCAL — requiere validar el Excel, revisar el plan resultante y un corte operativo autorizado para cualquier importación.`

Este procedimiento sigue ADR-SAAS-094, aceptado el 2026-10-27. Supersede el
antiguo plan de asociaciones de precio por canal que describía ADR-SAAS-092.
No autoriza importaciones, escrituras en Firebase, transferencias, activación
de Nevera, creación de ofertas ni despliegues.

## Fuente y separación

El archivo fuente es `DISTRIBUIDORA LAS JIMENEZ (2).xlsx` y contiene dos surtidos
independientes:

| Hoja | Catálogo | Filas | Precio operativo | Stock inicial |
| --- | --- | ---: | --- | ---: |
| `PRECIOS A TIENDA` | Bodega | 107 | Precio de venta del empaque completo a tienda | 0 |
| `PRECIOS CONS FINAL` | Nevera | 55 | Precio retail de la presentación | 0 |

Cada fila produce una identidad independiente dentro de su catálogo. Una
coincidencia de nombre entre hojas no comparte producto, presentación, precio,
costo ni stock. Las categorías también se crean y consultan por catálogo. La
pantalla permite filtrar por categoría y buscar por nombre.

## Datos del plan revisable

El plan local conserva, por fila, la hoja y fila fuente, SHA-256 del libro,
`catalogoId`, nombre de producto, categoría, unidad base, nombre de presentación,
factor, precio y la decisión de revisión. No incluye datos ajenos al libro ni
completa información mediante búsqueda automática.

- Bodega conserva exactamente `AL COSTO` como costo total de la presentación o
  empaque, y `PRECIO VENTA` como precio de venta de ese mismo empaque. No divide
  ni redondea el costo entre las unidades.
- Nevera conserva el precio de `PRECIOS CONS FINAL` en su catálogo separado. Se
  importa con stock cero y sin costo de adquisición asignado. No se vende desde
  Nevera hasta que un flujo autorizado registre existencias y costo.
- El número explícito del nombre (por ejemplo, `x 12 unds`) propone el factor
  de la presentación. Aguardientes, rones y vodkas se tratan como unidad
  individual por decisión confirmada del administrador. En la hoja Bodega, los
  nombres que no precisan unidades para otros productos se proponen como factor
  uno y quedan señalados para corrección de Diana; el Excel actual tiene 12
  filas de este tipo. La hoja Nevera se trata como venta individual confirmada,
  salvo presentaciones que declaran un paquete explícito, como `Sixpak`.
- Las reglas locales sugieren categorías; la confirmación del responsable y el
  plan revisado son la autoridad. Las categorías de Nevera y Bodega no se
  comparten automáticamente.
- Cualquier relación Bodega↔Nevera pertenece a una operación futura de
  transferencia: requiere asociación, factor, origen de costo y aprobación
  explícitos. No se genera asociación durante la importación.

Las cuatro tarifas de consumidor que pudieran existir en presentaciones
históricas de Bodega se conservan sin reinterpretarlas. El importador puede
advertirlas, pero no las usa en venta Bodega, no las traslada a Nevera y no las
elimina. Su destino exige reconciliación auditable.

## Preflight y ejecución futura

El preflight local debe fallar si cambió el hash del origen, hay filas
duplicadas, faltan precios/nombres, existen fórmulas no evaluadas o hay
decisiones de categoría/unidad/presentación inválidas. Debe presentar por
separado los conteos Bodega y Nevera, las sugerencias de categoría, factores
propuestos, advertencias de datos legados y diferencias frente al snapshot
actual del tenant.

La futura importación se limitará a crear o actualizar de forma idempotente los
registros aprobados en el catálogo correspondiente mediante callables
server-authoritative. Preservará IDs existentes, no cambiará snapshots ni
ledgers, no creará asociaciones, costos o stock de Nevera y no ejecutará ventas
ni compras. Ante una interrupción, la reanudación requiere el mismo plan/hash y
un preflight fresco; no se borrarán documentos para reiniciar.

## Pendientes antes de importar o vender

1. Validar localmente el Excel vigente y generar un plan offline nuevo. Revisar
   los 107 productos Bodega y los 55 Nevera en sus listas separadas, junto con
   los factores/categorías aún dudosos.
2. Comparar el plan contra el estado actual del tenant con sesión admin y
   reconciliar las cuatro tarifas legadas de Bodega sin modificarlas en esta
   etapa.
3. Aprobar explícitamente el resumen de importación y confirmar el release,
   tenant y espacio de destino inmediatamente antes de la escritura.
4. Después de importar, Diana registra el conteo físico. Nevera permanece no
   vendible hasta que correspondencias, transferencia, costo por capa y pruebas
   estén implementados y aprobados.
5. Crear y probar ofertas por catálogo. Una oferta Bodega no puede seleccionar
   productos Nevera; una oferta Nevera será independiente y no cambiará precios
   Bodega.

El plan offline y una importación exitosa no certifican Gate I, Rules,
disponibilidad comercial, ventas, compras, transferencia de inventario ni
preparación para producción.
