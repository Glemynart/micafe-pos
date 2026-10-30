export const RECIBO_INTERNO_BODEGA_VERSION = "BODEGA_RECIBO_INTERNO_V1" as const;

export interface ReciboInternoVentaBodegaLinea {
  productoId: string;
  nombreProducto: string;
  presentacionId: string;
  nombrePresentacion: string;
  cantidad: number;
  factorUnidadBase: number;
  unidadBase: string;
  precioBaseCOP: number;
  precioUnitarioCOP: number;
  subtotalCOP: number;
  ofertaId: string | null;
}

/** Snapshot comercial sin costos, destinado a imprimir la venta confirmada. */
export interface ReciboInternoVentaBodega {
  version: typeof RECIBO_INTERNO_BODEGA_VERSION;
  empresaId: string;
  nombreComercialSnapshot: string | null;
  consecutivo: number;
  folioInterno: string;
  fechaConfirmacionIso: string;
  cliente: { id: string; nombre: string };
  lineas: ReciboInternoVentaBodegaLinea[];
  subtotalCOP: number;
  descuentoCOP: number;
  totalCOP: number;
  metodoPago: "efectivo" | "transferencia" | "cuenta_cobro";
  estadoPagoInicial: "PAGADA" | "PENDIENTE";
  saldoInicialCOP: number;
  montoRecibidoCOP: number | null;
  cambioCOP: number | null;
}

const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const money = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const folioPara = (value: number) => `BOD-${String(value).padStart(6, "0")}`;

/** Whitelist de lectura: nunca expone campos adicionales como costo o margen. */
export function normalizarReciboInternoVentaBodega(value: unknown): ReciboInternoVentaBodega | null {
  if (!object(value) || value.version !== RECIBO_INTERNO_BODEGA_VERSION
    || !text(value.empresaId) || !Number.isSafeInteger(value.consecutivo) || value.consecutivo <= 0
    || value.folioInterno !== folioPara(value.consecutivo)
    || typeof value.fechaConfirmacionIso !== "string" || !Number.isFinite(Date.parse(value.fechaConfirmacionIso))
    || !object(value.cliente) || !text(value.cliente.id) || !text(value.cliente.nombre)
    || !Array.isArray(value.lineas) || value.lineas.length === 0 || value.lineas.length > 50
    || !money(value.subtotalCOP) || !money(value.descuentoCOP) || !money(value.totalCOP) || value.totalCOP <= 0
    || !["efectivo", "transferencia", "cuenta_cobro"].includes(value.metodoPago)
    || !["PAGADA", "PENDIENTE"].includes(value.estadoPagoInicial)
    || !money(value.saldoInicialCOP)
    || (value.montoRecibidoCOP !== null && !money(value.montoRecibidoCOP))
    || (value.cambioCOP !== null && !money(value.cambioCOP))) return null;

  const lineas: ReciboInternoVentaBodegaLinea[] = [];
  let totalLineasCOP = 0;
  let subtotalCalculadoCOP = 0;
  let descuentoCalculadoCOP = 0;
  for (const line of value.lineas) {
    if (!object(line) || !text(line.productoId) || !text(line.nombreProducto)
      || !text(line.presentacionId) || !text(line.nombrePresentacion)
      || !Number.isSafeInteger(line.cantidad) || line.cantidad <= 0
      || !Number.isSafeInteger(line.factorUnidadBase) || line.factorUnidadBase <= 0
      || !text(line.unidadBase) || !money(line.precioBaseCOP) || !money(line.precioUnitarioCOP)
      || !money(line.subtotalCOP) || !(line.ofertaId === null || text(line.ofertaId))) return null;
    const subtotalLinea = line.precioUnitarioCOP * line.cantidad;
    const subtotalBaseLinea = line.precioBaseCOP * line.cantidad;
    if (!Number.isSafeInteger(subtotalLinea) || line.subtotalCOP !== subtotalLinea
      || !Number.isSafeInteger(subtotalBaseLinea)) return null;
    totalLineasCOP += subtotalLinea;
    subtotalCalculadoCOP += subtotalBaseLinea;
    descuentoCalculadoCOP += Math.max(0, line.precioBaseCOP - line.precioUnitarioCOP) * line.cantidad;
    if (![totalLineasCOP, subtotalCalculadoCOP, descuentoCalculadoCOP].every(Number.isSafeInteger)) return null;
    lineas.push({
      productoId: line.productoId,
      nombreProducto: line.nombreProducto,
      presentacionId: line.presentacionId,
      nombrePresentacion: line.nombrePresentacion,
      cantidad: line.cantidad,
      factorUnidadBase: line.factorUnidadBase,
      unidadBase: line.unidadBase,
      precioBaseCOP: line.precioBaseCOP,
      precioUnitarioCOP: line.precioUnitarioCOP,
      subtotalCOP: line.subtotalCOP,
      ofertaId: line.ofertaId,
    });
  }

  if ((value.metodoPago === "cuenta_cobro") !== (value.estadoPagoInicial === "PENDIENTE")
    || (value.estadoPagoInicial === "PENDIENTE" && value.saldoInicialCOP !== value.totalCOP)
    || (value.estadoPagoInicial === "PAGADA" && value.saldoInicialCOP !== 0)
    || totalLineasCOP !== value.totalCOP
    || subtotalCalculadoCOP !== value.subtotalCOP
    || descuentoCalculadoCOP !== value.descuentoCOP
    || value.subtotalCOP !== value.totalCOP + value.descuentoCOP
    || (value.metodoPago === "efectivo" && (value.montoRecibidoCOP === null || value.cambioCOP === null
      || value.montoRecibidoCOP < value.totalCOP || value.cambioCOP !== value.montoRecibidoCOP - value.totalCOP))
    || (value.metodoPago !== "efectivo" && (value.montoRecibidoCOP !== null || value.cambioCOP !== null))) return null;

  return {
    version: RECIBO_INTERNO_BODEGA_VERSION,
    empresaId: value.empresaId,
    nombreComercialSnapshot: text(value.nombreComercialSnapshot) ? value.nombreComercialSnapshot : null,
    consecutivo: value.consecutivo,
    folioInterno: value.folioInterno,
    fechaConfirmacionIso: value.fechaConfirmacionIso,
    cliente: { id: value.cliente.id, nombre: value.cliente.nombre },
    lineas,
    subtotalCOP: value.subtotalCOP,
    descuentoCOP: value.descuentoCOP,
    totalCOP: value.totalCOP,
    metodoPago: value.metodoPago,
    estadoPagoInicial: value.estadoPagoInicial,
    saldoInicialCOP: value.saldoInicialCOP,
    montoRecibidoCOP: value.montoRecibidoCOP,
    cambioCOP: value.cambioCOP,
  };
}
