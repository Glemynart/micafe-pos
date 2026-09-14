export const MAX_LINEAS_BODEGA = 50

export type MetodoPagoBodega = "efectivo" | "transferencia"

export interface ClienteVendedorDTO {
  id: string
  nombre: string
  cedula: string
  tipoDocumento: string | null
  telefono: string
  contacto: string | null
  direccion: string | null
  barrioZona: string | null
  activo: boolean
}

export interface PresentacionVendedorDTO {
  productoId: string
  productoNombre: string
  categoriaId: string | null
  unidadBase: string | null
  presentacionId: string
  presentacionNombre: string
  factorUnidadBase: number
  precioCOP: number
  disponibilidadUnidadBase: number | null
  maximoPresentacionesVendibles: number | null
}

export interface LineaCarritoBodega {
  productoId: string
  presentacionId: string
  cantidad: number
}

export interface ConfirmacionVentaBodega {
  commandId: string
  idempotencyKey: string
  correlationId: string
  causationId: null
  payload: {
    clienteId: string
    lineas: LineaCarritoBodega[]
    metodoPago: MetodoPagoBodega
  }
}

export interface ResultadoVentaBodega {
  commandId: string
  ventaId: string
  estadoOperativo: "COMPLETO"
  metodoPago: MetodoPagoBodega
  total: number
  movimientoFinancieroId: string
  movimientosInventario: string[]
  turnoId: string | null
}

export interface VentaVendedorDTO {
  id: string
  fecha: unknown
  clienteId: string | null
  cliente: string | null
  items: Array<{ productoId: string; nombre: string; cantidad: number; precioUnitario: number | null; subtotal: number | null }>
  total: number | null
  metodoPago: string | null
  estado: string | null
}

export type SuperficieBodega = "VENDEDOR" | "ADMIN" | "LEGACY" | "DENEGADA"

export function resolverSuperficieBodega(vertical: "GENERAL" | "BODEGA_MVP1" | null, rol: string | null, destino: "POS" | "ADMIN"): SuperficieBodega {
  if (vertical === null) return "DENEGADA"
  if (vertical !== "BODEGA_MVP1") return "LEGACY"
  if (destino === "POS") {
    if (rol === "vendedor") return "VENDEDOR"
    if (rol === "admin") return "ADMIN"
    return "DENEGADA"
  }
  return rol === "admin" ? "ADMIN" : "DENEGADA"
}

export function crearProtectorDobleEnvio() {
  let ejecucion: Promise<unknown> | null = null
  return {
    ejecutar<T>(action: () => Promise<T>): Promise<T> {
      if (ejecucion) return ejecucion as Promise<T>
      ejecucion = action().finally(() => { ejecucion = null })
      return ejecucion as Promise<T>
    },
    get activo() { return ejecucion !== null },
  }
}

function requerido(value: string, campo: string): string {
  const normalizado = value.trim()
  if (!normalizado) throw new Error(`${campo}_REQUERIDO`)
  return normalizado
}

export function construirConfirmacionVentaBodega(input: {
  clienteId: string
  lineas: readonly LineaCarritoBodega[]
  metodoPago: MetodoPagoBodega
  generarId?: () => string
}): ConfirmacionVentaBodega {
  if (input.lineas.length === 0 || input.lineas.length > MAX_LINEAS_BODEGA) throw new Error("LINEAS_INVALIDAS")
  const lineas = input.lineas.map((linea) => {
    if (!Number.isSafeInteger(linea.cantidad) || linea.cantidad <= 0) throw new Error("CANTIDAD_INVALIDA")
    return {
      productoId: requerido(linea.productoId, "PRODUCTO"),
      presentacionId: requerido(linea.presentacionId, "PRESENTACION"),
      cantidad: linea.cantidad,
    }
  })
  const generarId = input.generarId ?? (() => crypto.randomUUID())
  const commandId = `bodega-venta:${generarId()}`
  return {
    commandId,
    idempotencyKey: commandId,
    correlationId: `bodega-venta:${generarId()}`,
    causationId: null,
    payload: {
      clienteId: requerido(input.clienteId, "CLIENTE"),
      lineas,
      metodoPago: input.metodoPago,
    },
  }
}

export function mensajeErrorBodega(error: unknown): string {
  const candidate = error as { code?: string; message?: string; details?: { code?: string } }
  const code = candidate?.details?.code ?? candidate?.code ?? candidate?.message ?? ""
  if (code.includes("TURNO_CERRADO")) return "Abre tu turno antes de cobrar en efectivo."
  if (code.includes("STOCK_INSUFICIENTE")) return "No hay existencias suficientes para completar la venta."
  if (code.includes("CLIENTE")) return "El cliente seleccionado ya no está disponible."
  if (code.includes("PRODUCTO") || code.includes("PRESENTACION")) return "El catálogo cambió. Actualízalo antes de reintentar."
  if (code.includes("ROLE_FORBIDDEN") || code.includes("permission-denied")) return "Tu permiso para vender cambió. Vuelve a iniciar sesión o contacta al administrador."
  if (code.includes("IDEMPOTENCY") || code.includes("COMMAND_ID_CONFLICT") || code.includes("already-exists")) return "La operación no coincide con el intento anterior. Actualiza y vuelve a intentarlo."
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) return "No fue posible conectar. Reintenta: conservaremos el mismo identificador de operación."
  return "No fue posible completar la venta. Revisa los datos e inténtalo de nuevo."
}
