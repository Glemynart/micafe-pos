export interface LineaCompraValidacion {
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
  for (const item of items) {
    if (!Number.isSafeInteger(item.cantidad) || item.cantidad <= 0) {
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
  }

  return null
}
