# G-SAAS-02 / E2.2 — Mapeo explícito de tarifas retail del catálogo Bodega

## Estado

`PREPARADO LOCALMENTE — pendiente de preflight final del catálogo y del corte
operativo autorizado de carga.`

Este documento concreta la entrada de datos requerida por ADR-SAAS-092. No
autoriza importaciones, escritura en Firebase, creación de Nevera, ofertas ni
despliegues.

## Alcance y fuente

El origen privado vigente es `DISTRIBUIDORA LAS JIMENEZ (2).xlsx`:

- `PRECIOS A TIENDA` aporta costo y tarifa de tienda por sus 107 filas.
- `PRECIOS CONS FINAL` aporta tarifas retail por sus 55 filas.

Los nombres no son una clave de integración: los formatos comerciales difieren
entre listas, por ejemplo una caja/paquete de Bodega frente a una unidad para
Nevera. Una coincidencia textual, una marca o una sugerencia local nunca puede
asignar una tarifa retail.

## Contrato de revisión v2

La siguiente plantilla privada de revisión debe conservar los valores fuente
inmutables y añadir una asociación por cada fila retail que se vaya a habilitar:

| Campo | Regla |
| --- | --- |
| `filaConsumidorFuente` | Fila existente y única de `PRECIOS CONS FINAL`. |
| `filaTiendaFuente` | Fila existente de `PRECIOS A TIENDA` que aporta el producto base. |
| `relacionPresentacion` | `MISMA_PRESENTACION` o `PRESENTACION_RETAIL_DISTINTA`. |
| `nombrePresentacionRetail` | Obligatorio si es una presentación distinta; no se infiere del nombre fuente. |
| `unidadesBasePorPresentacionRetail` | Entero positivo. Obligatorio si es distinta. |
| `categoria` y `unidadBase` | Deben coincidir con el producto Bodega asociado. |
| `precioConsumidorFinalCOP` | Copia exacta del origen; entero COP positivo. |
| `notaDeRevision` | Obligatoria cuando la relación o el factor no sea evidente. |

Una asociación es válida solo si es bilateral, no duplica la fila retail y no
crea ambigüedad entre productos. Una misma presentación puede tener una sola
tarifa vigente por canal. El plan no acepta precios inventados, fórmulas,
redondeo de costo ni asociaciones por similitud.

## Efecto previsto en el catálogo

1. `MISMA_PRESENTACION`: se conserva la presentación de tienda y se completa
   su `precioConsumidorFinalCOP` con el precio retail revisado. El costo exacto
   de esa presentación se conserva desde la fila fuente de tienda.
2. `PRESENTACION_RETAIL_DISTINTA`: se conserva el producto y se crea una
   presentación retail separada solo con factor explícito y tarifa retail de la
   fila de consumidor. Su costo se completa únicamente cuando existe un costo
   fuente exacto para esa presentación o un costo exacto por unidad base. No se
   obtiene dividiendo y redondeando el costo del empaque de tienda.
3. Sin asociación aprobada: la fila retail permanece diferida. Nunca habilita
   una venta desde Nevera y no modifica el precio de tienda.

El inventario inicial seguirá en cero; Diana contará y corregirá las existencias
después de que los productos estén cargados. La falta de una cantidad en el
nombre se conserva como evidencia (`assumed_single_unit`) y no bloquea la fila
de tienda aprobada: el factor inicial será uno y quedará señalado para revisión.
Un costo retail que no pueda establecerse exactamente deja esa presentación
diferida; no altera ni bloquea la importación del catálogo de tienda.

## Criterios para generar un plan importable

- La fuente y la revisión tienen SHA-256 registrados.
- Las 107 filas de tienda conservan categoría, unidad base, presentación,
  factor, evidencia del conteo del empaque, tarifa y costo fuente exactos.
- Cada tarifa retail que se vaya a usar desde Nevera tiene asociación explícita
  y un precio fuente válido; si se habilita su costo, debe ser exacto para esa
  presentación y no aproximado desde el costo del empaque de tienda.
- Las filas retail diferidas se enumeran sin crear presentaciones ni precios.
- La vista previa compara contra el snapshot actualizado del tenant y rechaza
  duplicados, diferencias de identidad o reanudaciones incompatibles.
- El lote sigue siendo idempotente, servidor-autoritativo y comienza con stock
  cero.

## Bloqueo actual

Falta que Diana confirme las asociaciones y factores de las filas retail cuyo
nombre o empaque no coincide literalmente con la lista tienda. Sin esos datos,
se puede importar solo el catálogo de tienda tras su propio preflight, pero no
se puede habilitar Nevera ni ventas al consumidor final de forma segura. Diana
corregirá las cantidades físicas después de la carga; el lote inicial no crea
existencias y todas comienzan en cero.
