# G-SAAS-02 / E2.2 — Mapeo explícito de tarifas retail del catálogo Bodega

## Estado

`PREPARADO LOCALMENTE — pendiente de datos comerciales revisados y de integrar
el corte de tarifas por canal.`

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
   su `precioConsumidorFinalCOP` con el precio retail revisado.
2. `PRESENTACION_RETAIL_DISTINTA`: se conserva el producto y su costo por
   unidad base; se crea una presentación retail separada con factor explícito,
   tarifa tienda solamente si Diana también la define, y tarifa retail de la
   fila de consumidor.
3. Sin asociación aprobada: la fila retail permanece diferida. Nunca habilita
   una venta desde Nevera y no modifica el precio de tienda.

El inventario inicial seguirá en cero. El costo de una presentación retail se
deriva únicamente del costo canónico del producto y de su factor entero; una
conversión no exacta bloquea el plan y requiere corregir la base comercial.

## Criterios para generar un plan importable

- La fuente y la revisión tienen SHA-256 registrados.
- Las 107 filas de tienda mantienen categoría, unidad base, presentación,
  factor y base de costo completos.
- Cada tarifa retail que se vaya a usar desde Nevera tiene asociación explícita
  y un precio fuente válido.
- Las filas retail diferidas se enumeran sin crear presentaciones ni precios.
- La vista previa compara contra el snapshot actualizado del tenant y rechaza
  duplicados, diferencias de identidad o reanudaciones incompatibles.
- El lote sigue siendo idempotente, servidor-autoritativo y comienza con stock
  cero.

## Bloqueo actual

Falta que Diana confirme las asociaciones y factores de las filas retail cuyo
nombre o empaque no coincide literalmente con la lista tienda. Sin esos datos,
se puede importar solo el catálogo de tienda tras su propio preflight, pero no
se puede habilitar Nevera ni ventas al consumidor final de forma segura.
