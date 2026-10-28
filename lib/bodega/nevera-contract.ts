export interface PresentacionRetailNeveraDTO {
  productoId: string
  productoNombre: string
  categoriaId: string | null
  unidadBase: string
  presentacionId: string
  presentacionNombre: string
  factorUnidadBase: number
  precioCOP: number
  disponibilidadUnidadBase: number
  maximoPresentacionesVendibles: number
  fifoListo: boolean
}

export type MetodoPagoRetailNevera = "efectivo" | "transferencia"

export interface ComandoVentaRetailNevera {
  commandId: string
  idempotencyKey: string
  correlationId: string
  causationId: null
  payload: {
    lineas: Array<{ productoId: string; presentacionId: string; cantidad: number }>
    metodoPago: MetodoPagoRetailNevera
    montoRecibidoCOP?: number
  }
}

export interface ResultadoVentaRetailNevera {
  commandId: string
  ventaId: string
  estadoOperativo: "COMPLETO"
  catalogoId: "NEVERA"
  total: number
  metodoPago: MetodoPagoRetailNevera
  montoRecibidoCOP?: number
  cambioCOP?: number
  movimientoFinancieroId: string
  movimientosInventario: string[]
  cuentaControlMovimientoIds: string[]
  turnoId: string | null
}

export type EstadoProductoAperturaNevera = "LISTO" | "APERTURA_PENDIENTE" | "CAPAS_DIVERGENTES" | "BLOQUEADO"

export interface ProductoPreflightAperturaNevera {
  productoId: string
  nombre?: string
  stock: number
  movimientos?: number
  capasEsperadas?: number
  valorExistenciaCOP?: number
  estado: EstadoProductoAperturaNevera
  ledgerHash?: string
  motivo?: string
}

export interface ResultadoPreflightAperturaNevera {
  catalogoId: "NEVERA"
  empresaId: string
  reconstruible: boolean
  todasLasCapasAbiertas: boolean
  productos: ProductoPreflightAperturaNevera[]
  totalProductos: number
  saldoControlCOP: number | null
  valorLedgerReconstruidoCOP: number | null
  saldoControlCoincide: boolean
  manifestHash: string
}

export interface ComandoAperturaNevera {
  commandId: string
  idempotencyKey: string
  correlationId: string
  causationId: null
  payload: { productoId: string; ledgerHash: string }
}

export interface ResultadoAperturaNevera {
  commandId: string
  productoId: string
  estado: "LISTO"
  idempotente: boolean
  capasCreadas?: number
  cargoAperturaCOP?: number
  saldoControlCOP?: number
  ledgerHash: string
}

export function construirComandoAperturaProductoNevera(
  productoId: string,
  ledgerHash: string,
  generarId: () => string = () => crypto.randomUUID(),
): ComandoAperturaNevera {
  const commandId = `apertura-nevera:${productoId}:${generarId()}`
  return {
    commandId,
    idempotencyKey: commandId,
    correlationId: `apertura-nevera:${generarId()}`,
    causationId: null,
    payload: { productoId, ledgerHash },
  }
}

export function construirComandoVentaRetailNevera(input: {
  lineas: Array<{ productoId: string; presentacionId: string; cantidad: number }>
  metodoPago: MetodoPagoRetailNevera
  montoRecibidoCOP?: number
  generarId?: () => string
}): ComandoVentaRetailNevera {
  const generarId = input.generarId ?? (() => crypto.randomUUID())
  const commandId = `venta-retail-nevera:${generarId()}`
  return {
    commandId,
    idempotencyKey: commandId,
    correlationId: `venta-retail-nevera:${generarId()}`,
    causationId: null,
    payload: {
      lineas: input.lineas.map(linea => ({ ...linea })),
      metodoPago: input.metodoPago,
      ...(input.metodoPago === "efectivo" ? { montoRecibidoCOP: input.montoRecibidoCOP } : {}),
    },
  }
}
