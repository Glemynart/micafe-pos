import type {
  TicketCliente,
  TicketImpuestoLinea,
  TicketImpuestoTipo,
  TicketItem,
  VentaTicketModel,
} from './ticket-model'

/**
 * TicketBuilder — único punto de construcción del TicketModel (diseño H1 V3,
 * decisión #1). El renderer nunca conoce el origen de los datos; toda la
 * traducción "shape de origen → modelo de negocio" vive aquí.
 *
 * Este PR solo implementa `fromVenta`. Es deliberadamente autocontenido: no
 * importa `ConfiguracionGlobal` ni los tipos de `lib/ventas-service.ts` para
 * que el motor de tickets no dependa de ningún módulo de dominio mientras no
 * tenga consumidores reales. Cuando Historial (PR3) y Checkout (PR4) se
 * integren, cada uno adaptará su propio shape (doc de Firestore / estado en
 * memoria) a `VentaBuilderInput` + `TicketEmpresaConfig` — esa adaptación es
 * la que decide, por ejemplo, cómo separar el prefijo del número de factura
 * o cómo resolver el shape dual de ADR-TRIB-001. Aquí se asume una entrada
 * ya normalizada.
 *
 * `fromNotaCredito` / `fromDevolucion` / `fromApertura` / `fromCierre` /
 * `fromArqueo` no se implementan en este PR (sin requisito, sin consumidor);
 * se añadirán como funciones hermanas cuando exista una necesidad concreta,
 * junto con su variante en `TicketModel` y su rama en el renderer.
 */

export type RegimenTributarioTicket = 'no_responsable' | 'responsable_inc' | 'responsable_iva'

/**
 * Subconjunto de la configuración de empresa que el builder necesita para
 * armar el encabezado y el pie del ticket. Deliberadamente más pequeño que
 * `ConfiguracionGlobal` (ver nota de aislamiento arriba).
 */
export interface TicketEmpresaConfig {
  nombreComercial: string
  razonSocial?: string
  nit: string
  direccion?: string
  ciudad?: string
  telefono?: string
  regimenTributario?: RegimenTributarioTicket
  mensajeTicket?: string
  fabricanteSoftware?: string
  proveedorTecnologico?: string
}

export interface VentaBuilderInputCliente {
  nombre?: string
  documento?: string
  tipoDoc?: string
}

export interface VentaBuilderInputItem {
  descripcion: string
  codigo?: string
  cantidad: number
  precioUnitario: number
  subtotal: number
  impuestoTipo?: TicketImpuestoTipo
  impuestoTarifa?: number
  impuestoValor?: number
  base?: number
}

export interface VentaBuilderInputTotales {
  subtotalBase: number
  totalINC: number
  otros?: number
  total: number
}

export interface VentaBuilderInputPago {
  metodo: string
  recibido?: number
  cambio?: number
}

export interface VentaBuilderInputDian {
  /** Número de factura sin el prefijo. */
  numero: string
  prefijo: string
  resolucion?: string
  rangoInicio?: string
  rangoFin?: string
  vigencia?: string
  cufe: string
  /**
   * Texto a codificar en el QR. Si no se provee, se deriva la URL pública
   * de consulta de la DIAN a partir del CUFE (mismo fallback que usa hoy
   * Historial).
   */
  qrPayload?: string
}

export interface VentaBuilderInput {
  /** Número de ticket/venta sin prefijo (se le aplica padding a 6 dígitos). */
  numero: string | number
  fecha: string | Date
  cliente?: VentaBuilderInputCliente
  items: VentaBuilderInputItem[]
  totales: VentaBuilderInputTotales
  pago: VentaBuilderInputPago
  dian?: VentaBuilderInputDian
}

const CLIENTE_DEFAULT: TicketCliente = {
  nombre: 'CONSUMIDOR FINAL',
  documento: '222222222222',
}

const DEFAULT_FABRICANTE_SOFTWARE = 'Desarrollado por Sebastian Agudelo Muñoz - NIT: 1000292576-3'
const DEFAULT_PROVEEDOR_TECNOLOGICO = 'FACTUS S.A.S. NIT: 901724254-1'

/** Default alineado con ADR-TRIB-001 (REGIMEN_TRIBUTARIO_DEFAULT = 'no_responsable'). */
const REGIMEN_DEFAULT: RegimenTributarioTicket = 'no_responsable'

function derivarRotuloFiscal(regimen: RegimenTributarioTicket | undefined): string {
  switch (regimen ?? REGIMEN_DEFAULT) {
    case 'responsable_inc':
      return 'Responsable de INC'
    case 'responsable_iva':
      return 'Responsable de IVA'
    default:
      return 'No Responsable de INC'
  }
}

function derivarQrPayload(dian: VentaBuilderInputDian): string {
  if (dian.qrPayload) return dian.qrPayload
  return `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentKey=${dian.cufe}`
}

function formatearNumero(numero: string | number): string {
  return String(numero).padStart(6, '0')
}

function construirItems(items: VentaBuilderInputItem[]): TicketItem[] {
  return items.map((item) => ({
    descripcion: item.descripcion.toUpperCase(),
    codigo: item.codigo,
    cantidad: item.cantidad,
    precioUnitario: Math.round(item.precioUnitario),
    subtotal: Math.round(item.subtotal),
    impuestoTipo: item.impuestoTipo,
    impuestoTarifa: item.impuestoTarifa,
    impuestoValor: item.impuestoValor,
    base: item.base,
  }))
}

/**
 * Deriva las líneas de detalle de impuestos a partir de los items. Solo se
 * usa cuando el ticket es DIAN (el renderer ignora `impuestos` en tickets
 * simples). Agrupa por tipo de impuesto, igual que hace hoy Historial.
 */
function construirImpuestos(items: VentaBuilderInputItem[]): TicketImpuestoLinea[] {
  const grupos = new Map<string, TicketImpuestoLinea>()

  for (const item of items) {
    if (!item.impuestoTipo || item.impuestoTipo === 'excluido') continue
    const tasa = item.impuestoTarifa ?? 0
    const base = item.base ?? item.subtotal
    const valor = item.impuestoValor ?? 0
    const etiqueta = item.impuestoTipo === 'iva_19' ? 'IVA' : 'INC'
    const clave = `${etiqueta}-${tasa}`

    const existente = grupos.get(clave)
    if (existente) {
      existente.base += base
      existente.valor += valor
    } else {
      grupos.set(clave, { tipo: etiqueta, tasa, base, valor })
    }
  }

  return Array.from(grupos.values())
}

function fromVenta(input: VentaBuilderInput, empresaConfig: TicketEmpresaConfig): VentaTicketModel {
  const isDian = !!input.dian

  const cliente: TicketCliente = {
    nombre: input.cliente?.nombre?.toUpperCase() || CLIENTE_DEFAULT.nombre,
    documento: input.cliente?.documento || CLIENTE_DEFAULT.documento,
    tipoDoc: input.cliente?.tipoDoc,
  }

  return {
    tipoDocumento: 'venta',
    empresa: {
      nombreComercial: empresaConfig.nombreComercial,
      razonSocial: empresaConfig.razonSocial,
      nit: empresaConfig.nit,
      rotuloFiscal: derivarRotuloFiscal(empresaConfig.regimenTributario),
      direccion: empresaConfig.direccion,
      ciudad: empresaConfig.ciudad,
      telefono: empresaConfig.telefono,
    },
    meta: {
      fecha: typeof input.fecha === 'string' ? input.fecha : input.fecha.toISOString(),
      titulo: isDian ? 'FACTURA ELECTRÓNICA DE VENTA' : 'TICKET DE VENTA',
      numero: formatearNumero(input.dian?.numero ?? input.numero),
      prefijo: input.dian?.prefijo,
    },
    pie: {
      fabricanteSoftware: empresaConfig.fabricanteSoftware ?? DEFAULT_FABRICANTE_SOFTWARE,
      proveedorTecnologico: empresaConfig.proveedorTecnologico ?? DEFAULT_PROVEEDOR_TECNOLOGICO,
      mensajeTicket: empresaConfig.mensajeTicket,
    },
    cliente,
    items: construirItems(input.items),
    impuestos: isDian ? construirImpuestos(input.items) : [],
    totales: {
      subtotalBase: Math.round(input.totales.subtotalBase),
      totalINC: Math.round(input.totales.totalINC),
      otros: input.totales.otros !== undefined ? Math.round(input.totales.otros) : undefined,
      total: Math.round(input.totales.total),
    },
    pago: {
      metodo: input.pago.metodo,
      recibido: input.pago.recibido !== undefined ? Math.round(input.pago.recibido) : undefined,
      cambio: input.pago.cambio !== undefined ? Math.round(input.pago.cambio) : undefined,
    },
    dian: input.dian
      ? {
          numero: formatearNumero(input.dian.numero),
          prefijo: input.dian.prefijo,
          resolucion: input.dian.resolucion,
          rangoInicio: input.dian.rangoInicio,
          rangoFin: input.dian.rangoFin,
          vigencia: input.dian.vigencia,
          cufe: input.dian.cufe,
          qrPayload: derivarQrPayload(input.dian),
        }
      : undefined,
  }
}

export const TicketBuilder = {
  fromVenta,
}
