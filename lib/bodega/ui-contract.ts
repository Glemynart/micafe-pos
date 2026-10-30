import { normalizarReciboInternoVentaBodega, type ReciboInternoVentaBodega } from "@/lib/bodega/recibo-interno"

export const MAX_LINEAS_BODEGA = 50

export type MetodoPagoBodega = "efectivo" | "transferencia" | "pendiente"
export const METODO_PAGO_BODEGA_PREDETERMINADO: MetodoPagoBodega = "pendiente"
export type MetodoAbonoBodega = "efectivo" | "transferencia"

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
  saldoPendienteCOP: number
}

export interface FacturaPendienteBodegaDTO {
  ventaId: string
  fecha: unknown
  totalCOP: number
  totalAbonadoCOP: number
  saldoPendienteCOP: number
  fechaCompromisoPagoLocal: string | null
}

export interface CarteraClienteBodegaDTO {
  clienteId: string
  facturas: FacturaPendienteBodegaDTO[]
  saldoPendienteCOP: number
}

export interface ComandoAbonoVentaBodega {
  commandId: string
  idempotencyKey: string
  correlationId: string
  causationId: string | null
  payload: {
    ventaId: string
    montoCOP: number
    metodoPago: MetodoAbonoBodega
    fechaCompromisoPagoLocal?: string
  }
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
    montoRecibidoCOP?: number
    solicitudId?: string
  }
}

export type EstadoSolicitudVentaBodega = "PENDIENTE_APROBACION" | "APROBADA" | "RECHAZADA" | "CANCELADA" | "INVALIDADA" | "EXPIRADA" | "EJECUTADA"

export interface SolicitudVentaBodegaDTO {
  solicitudId: string
  estado: EstadoSolicitudVentaBodega
  revision: number
  clienteId: string
  cliente: { id: string; nombre: string } | null
  lineas: Array<LineaCarritoBodega & {
    productoNombre: string
    unidadBase: string
    presentacionNombre: string
    factorUnidadBase: number
    cantidadUnidadBase: number
    precioPresentacionCOP: number
    subtotalCOP: number
  }>
  totalCOP: number
  solicitanteUid: string
  creadaEn: unknown
  aprobacion: { actorUid: string; revision: number; expiraEn: unknown } | null
}

export interface ComandoSolicitudVentaBodega {
  commandId: string
  idempotencyKey: string
  correlationId: string
  causationId: null
  payload: { clienteId: string; lineas: LineaCarritoBodega[] }
}

export type EstadoProgramacionPedidoBodega = "PENDIENTE_REVISION" | "RESERVADA" | "CANCELADA" | "VENCIDA" | "CONVERTIDA_A_SOLICITUD" | "CUMPLIDA"

export interface ProgramacionPedidoBodegaDTO {
  programacionId: string
  estado: EstadoProgramacionPedidoBodega
  revision: number
  clienteId: string
  cliente: { id: string; nombre: string; direccion?: string | null } | null
  fechaLocal: string
  franja: { desde: string; hasta: string } | null
  zonaHoraria: string
  lineas: Array<{
    productoId: string
    productoNombre: string
    unidadBase: string
    presentacionId: string
    presentacionNombre: string
    cantidad: number
    factorUnidadBase: number
    cantidadUnidadBase: number
  }>
  stockReservadoUnidadBase: number
  solicitanteUid: string
  solicitudId: string | null
  reservaExpiraEn: unknown
  creadaEn: unknown
  actualizadaEn: unknown
}

export interface ComandoCrearProgramacionPedidoBodega {
  commandId: string
  idempotencyKey: string
  correlationId: string
  causationId: null
  payload: {
    clienteId: string
    fechaLocal: string
    franja: { desde: string; hasta: string } | null
    lineas: LineaCarritoBodega[]
  }
}

export function fechaLocalEnZonaHoraria(fecha: Date, zonaHoraria: string): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zonaHoraria,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha)
  const valores = Object.fromEntries(partes.map(parte => [parte.type, parte.value]))
  return `${valores.year}-${valores.month}-${valores.day}`
}

export function construirProgramacionPedidoBodega(input: {
  clienteId: string
  fechaLocal: string
  franja?: { desde: string; hasta: string } | null
  lineas: readonly LineaCarritoBodega[]
  generarId?: () => string
}): ComandoCrearProgramacionPedidoBodega {
  if (input.lineas.length === 0 || input.lineas.length > MAX_LINEAS_BODEGA) throw new Error("LINEAS_INVALIDAS")
  const lineas = input.lineas.map(linea => {
    if (!Number.isSafeInteger(linea.cantidad) || linea.cantidad <= 0) throw new Error("CANTIDAD_INVALIDA")
    return { productoId: requerido(linea.productoId, "PRODUCTO"), presentacionId: requerido(linea.presentacionId, "PRESENTACION"), cantidad: linea.cantidad }
  })
  const clienteId = requerido(input.clienteId, "CLIENTE")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaLocal)) throw new Error("FECHA_INVALIDA")
  if (input.franja && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.franja.desde)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.franja.hasta)
    || input.franja.hasta <= input.franja.desde)) throw new Error("FRANJA_INVALIDA")
  const generarId = input.generarId ?? (() => crypto.randomUUID())
  const commandId = `bodega-agenda:${generarId()}`
  return {
    commandId,
    idempotencyKey: commandId,
    correlationId: `bodega-agenda:${generarId()}`,
    causationId: null,
    payload: { clienteId, fechaLocal: input.fechaLocal, franja: input.franja ?? null, lineas },
  }
}

export interface ResultadoVentaBodegaCompletada {
  commandId: string
  ventaId: string
  estadoOperativo: "COMPLETO"
  metodoPago: MetodoPagoBodega
  total: number
  montoRecibidoCOP?: number
  cambioCOP?: number
  movimientoFinancieroId?: string
  estado?: "pendiente"
  saldoPendienteCOP?: number
  movimientosInventario: string[]
  turnoId: string | null
  solicitudId?: string
  reciboInterno: ReciboInternoVentaBodega
}

export interface ResultadoSolicitudVentaInvalidada {
  commandId: string
  solicitudId: string
  estado: "INVALIDADA"
  estadoOperativo: "SOLICITUD_INVALIDADA"
  motivo: string
}

export type ResultadoVentaBodega = ResultadoVentaBodegaCompletada | ResultadoSolicitudVentaInvalidada

export interface VentaVendedorDTO {
  id: string
  fecha: unknown
  clienteId: string | null
  cliente: string | null
  items: Array<{ productoId: string; nombre: string; cantidad: number; precioUnitario: number | null; subtotal: number | null }>
  total: number | null
  metodoPago: string | null
  estado: string | null
  turnoId: string | null
  montoRecibidoCOP: number | null
  cambioCOP: number | null
  totalAbonadoCOP?: number | null
  saldoPendienteCOP?: number | null
  fechaCompromisoPagoLocal?: string | null
  reciboInterno?: ReciboInternoVentaBodega | null
}

export interface VentaBodegaAdminDTO {
  id: string
  cajeroId: string
  clienteNombreSnapshot: string
  metodoPago: string
  estado: string
  total: number
  fecha: unknown
  schemaVersion: string
  turnoId: string | null
  montoRecibidoCOP: number | null
  cambioCOP: number | null
  saldoPendienteCOP: number | null
  reciboInterno?: ReciboInternoVentaBodega | null
}

const montoCOPSeguro = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null

export function proyectarVentaBodegaAdmin(id: string, data: Record<string, any>): VentaBodegaAdminDTO {
  return {
    id,
    cajeroId: typeof data.cajeroId === "string" ? data.cajeroId : "",
    clienteNombreSnapshot: typeof data.clienteNombreSnapshot === "string" ? data.clienteNombreSnapshot : typeof data.clienteNombre === "string" ? data.clienteNombre : "",
    metodoPago: typeof data.metodoPago === "string" ? data.metodoPago : "",
    estado: typeof data.estado === "string" ? data.estado : "",
    total: typeof data.totales?.total === "number" ? data.totales.total : 0,
    fecha: data.fecha ?? null,
    schemaVersion: typeof data.schemaVersion === "string" ? data.schemaVersion : "",
    turnoId: typeof data.turnoId === "string" && data.turnoId.trim() ? data.turnoId : null,
    montoRecibidoCOP: montoCOPSeguro(data.pago?.montoRecibidoCOP),
    cambioCOP: montoCOPSeguro(data.pago?.cambioCOP),
    saldoPendienteCOP: montoCOPSeguro(data.saldoPendienteCOP),
    reciboInterno: normalizarReciboInternoVentaBodega(data.reciboInterno),
  }
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

export function fechaDesdeSerializacionBodega(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (!value || typeof value !== "object") return null

  const record = value as Record<string, unknown>
  if (typeof record.toDate === "function") {
    try {
      const date = (record.toDate as () => unknown)()
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date
    } catch {
      // A malformed serialized Timestamp should not prevent trying its plain fields.
    }
  }

  const seconds = record._seconds ?? record.seconds
  const nanoseconds = record._nanoseconds ?? record.nanoseconds ?? 0
  if (!Number.isSafeInteger(seconds) || !Number.isInteger(nanoseconds) || (nanoseconds as number) < 0 || (nanoseconds as number) >= 1_000_000_000) return null

  const date = new Date((seconds as number) * 1000 + Math.floor((nanoseconds as number) / 1_000_000))
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatearReferenciaSolicitud(solicitudId: string): string {
  const id = solicitudId.trim()
  if (!id) return "sin referencia"
  return id.length > 18 ? `…${id.slice(-8).toUpperCase()}` : id
}

export function formatearFechaBodega(value: unknown): string {
  return fechaDesdeSerializacionBodega(value)?.toLocaleString("es-CO") ?? "no disponible"
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
  montoRecibidoCOP?: number
  solicitudId?: string
  generarId?: () => string
}): ConfirmacionVentaBodega {
  if (input.lineas.length === 0 || input.lineas.length > MAX_LINEAS_BODEGA) throw new Error("LINEAS_INVALIDAS")
  if (input.metodoPago === "efectivo" && (!Number.isSafeInteger(input.montoRecibidoCOP) || (input.montoRecibidoCOP as number) < 0)) throw new Error("MONTO_RECIBIDO_INVALIDO")
  if (input.metodoPago !== "efectivo" && input.montoRecibidoCOP !== undefined) throw new Error("MONTO_RECIBIDO_NO_APLICA")
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
      ...(input.metodoPago === "efectivo" ? { montoRecibidoCOP: input.montoRecibidoCOP as number } : {}),
      ...(input.solicitudId ? { solicitudId: requerido(input.solicitudId, "SOLICITUD") } : {}),
    },
  }
}

export function construirComandoAbonoVentaBodega(input: {
  ventaId: string
  montoCOP: number
  metodoPago: MetodoAbonoBodega
  fechaCompromisoPagoLocal?: string
  generarId?: () => string
}): ComandoAbonoVentaBodega {
  if (!Number.isSafeInteger(input.montoCOP) || input.montoCOP <= 0) throw new Error("ABONO_INVALIDO")
  if (input.fechaCompromisoPagoLocal !== undefined && !fechaLocalValidaBodega(input.fechaCompromisoPagoLocal)) throw new Error("FECHA_COMPROMISO_INVALIDA")
  const generarId = input.generarId ?? (() => crypto.randomUUID())
  const commandId = `bodega-abono:${generarId()}`
  return {
    commandId,
    idempotencyKey: commandId,
    correlationId: `bodega-abono:${generarId()}`,
    causationId: null,
    payload: {
      ventaId: requerido(input.ventaId, "VENTA"), montoCOP: input.montoCOP, metodoPago: input.metodoPago,
      ...(input.fechaCompromisoPagoLocal ? { fechaCompromisoPagoLocal: input.fechaCompromisoPagoLocal } : {}),
    },
  }
}

function fechaLocalValidaBodega(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function calcularCambioEfectivoBodega(totalCOP: number, montoRecibidoCOP: number): number | null {
  if (!Number.isSafeInteger(totalCOP) || totalCOP <= 0 || !Number.isSafeInteger(montoRecibidoCOP) || montoRecibidoCOP < totalCOP) return null
  return montoRecibidoCOP - totalCOP
}

export function construirSolicitudVentaBodega(input: {
  clienteId: string
  lineas: readonly LineaCarritoBodega[]
  generarId?: () => string
}): ComandoSolicitudVentaBodega {
  if (input.lineas.length === 0 || input.lineas.length > MAX_LINEAS_BODEGA) throw new Error("LINEAS_INVALIDAS")
  const lineas = input.lineas.map(linea => {
    if (!Number.isSafeInteger(linea.cantidad) || linea.cantidad <= 0) throw new Error("CANTIDAD_INVALIDA")
    return { productoId: requerido(linea.productoId, "PRODUCTO"), presentacionId: requerido(linea.presentacionId, "PRESENTACION"), cantidad: linea.cantidad }
  })
  const generarId = input.generarId ?? (() => crypto.randomUUID())
  const commandId = `bodega-solicitud:${generarId()}`
  return {
    commandId,
    idempotencyKey: commandId,
    correlationId: `bodega-solicitud:${generarId()}`,
    causationId: null,
    payload: { clienteId: requerido(input.clienteId, "CLIENTE"), lineas },
  }
}

export function mensajeErrorBodega(error: unknown): string {
  const candidate = error as { code?: string; message?: string; details?: { code?: string } }
  const code = candidate?.details?.code ?? candidate?.code ?? candidate?.message ?? ""
  if (code.includes("MONTO_RECIBIDO")) return "El efectivo recibido debe ser un valor entero igual o mayor al total."
  if (code.includes("ABONO_SUPERA_SALDO")) return "El abono supera el saldo pendiente. Actualiza la cuenta y vuelve a intentarlo."
  if (code.includes("ABONO_INVALIDO")) return "El abono debe ser un importe entero mayor que cero."
  if (code.includes("COSTO_NEVERA_REQUERIDO")) return "Registra el costo de compra por unidad base antes de cargar existencias en Nevera."
  if (code.includes("COSTO_NEVERA_REQUIERE_ENTRADA")) return "Para cambiar el costo de Nevera, registra al mismo tiempo una entrada de existencias."
  if (code.includes("PRODUCTO_INACTIVO")) return "Activa el producto antes de registrar existencias en Nevera."
  if (code.includes("NEVERA_STOCK_INICIAL_NO_PERMITIDO")) return "Crea el producto Nevera con saldo cero y registra el inventario desde la pantalla Stock."
  if (code.includes("SALDO_CLIENTE_INCONSISTENTE") || code.includes("SALDO_VENTA_INCONSISTENTE")) return "El saldo de esta cuenta requiere revisión administrativa. No se aplicó el abono."
  if (code.includes("CARTERA_SUPERA_LIMITE")) return "Esta cuenta tiene demasiadas facturas abiertas para mostrarlas. Contacta al administrador."
  if (code.includes("VENTA_NO_PENDIENTE")) return "La factura ya no tiene un saldo pendiente. Actualiza la cuenta."
  if (code.includes("TURNO_CERRADO")) return "El turno activo no está disponible. Actualiza la vista y vuelve a intentarlo."
  if (code.includes("STOCK_INSUFICIENTE")) return "No hay existencias suficientes para completar la venta."
  if (code.includes("SOLICITUD_APROBACION_REQUERIDA")) return "La solicitud de venta debe estar aprobada antes de confirmar el pago."
  if (code.includes("SOLICITUD_APROBACION_EXPIRADA")) return "La aprobación venció. Envía una nueva solicitud al administrador."
  if (code.includes("SOLICITUD_CONTENIDO_NO_COINCIDE")) return "Los artículos o cantidades no coinciden con la solicitud aprobada."
  if (code.includes("SOLICITUD_NO_APROBADA")) return "La solicitud todavía no está aprobada para confirmar la venta."
  if (code.includes("CLIENTE")) return "El cliente seleccionado ya no está disponible."
  if (code.includes("PRODUCTO") || code.includes("PRESENTACION")) return "El catálogo cambió. Actualízalo antes de reintentar."
  if (code.includes("ROLE_FORBIDDEN") || code.includes("permission-denied")) return "Tu permiso para vender cambió. Vuelve a iniciar sesión o contacta al administrador."
  if (code.includes("IDEMPOTENCY") || code.includes("COMMAND_ID_CONFLICT") || code.includes("already-exists")) return "La operación no coincide con el intento anterior. Actualiza y vuelve a intentarlo."
  if (code.includes("unavailable") || code.includes("deadline-exceeded")) return "No fue posible conectar. Reintenta: conservaremos el mismo identificador de operación."
  return "No fue posible completar esta operación. Actualiza la vista e inténtalo de nuevo."
}
