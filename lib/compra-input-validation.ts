export interface LineaCompraValidacion {
  tipo: "producto" | "insumo"
  articuloId: string
  cantidad: number
  costoUnitario: number
}

export type ErrorValidacionCompra =
  | "ITEMS_INVALIDOS"
  | "CANTIDAD_INVALIDA"
  | "COSTO_INVALIDO"
  | "TOTAL_COMPRA_INVALIDO"

/** Alinea el borrador del cliente con los enteros que aceptan compra y ledger. */
export function validarEntradaCompra(
  items: readonly LineaCompraValidacion[],
): ErrorValidacionCompra | null {
  if (items.length === 0) return "ITEMS_INVALIDOS"

  let total = 0
  const articulos = new Map<string, { cantidad: number; costoTotal: number }>()
  for (const item of items) {
    if (!Number.isFinite(item.cantidad) || item.cantidad <= 0) {
      return "CANTIDAD_INVALIDA"
    }
    if (!Number.isSafeInteger(item.costoUnitario) || item.costoUnitario <= 0) {
      return "COSTO_INVALIDO"
    }

    const subtotal = item.cantidad * item.costoUnitario
    if (!Number.isSafeInteger(subtotal) || subtotal <= 0) {
      return "TOTAL_COMPRA_INVALIDO"
    }

    total += subtotal
    if (!Number.isSafeInteger(total) || total <= 0) {
      return "TOTAL_COMPRA_INVALIDO"
    }

    const key = `${item.tipo}:${item.articuloId}`
    const articulo = articulos.get(key)
    if (articulo) {
      articulo.cantidad += item.cantidad
      articulo.costoTotal += subtotal
    } else {
      articulos.set(key, { cantidad: item.cantidad, costoTotal: subtotal })
    }
  }

  for (const articulo of articulos.values()) {
    if (!Number.isSafeInteger(articulo.cantidad) || articulo.cantidad <= 0) {
      return "CANTIDAD_INVALIDA"
    }

    const costoUnitarioConsolidado = articulo.costoTotal / articulo.cantidad
    if (!Number.isSafeInteger(costoUnitarioConsolidado) || costoUnitarioConsolidado <= 0) {
      return "COSTO_INVALIDO"
    }
  }

  return null
}
