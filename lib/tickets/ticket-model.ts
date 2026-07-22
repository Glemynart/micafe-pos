/**
 * TicketModel — contrato de datos del motor de tickets (diseño H1 V3).
 *
 * Es el único tipo que conoce el renderer. No debe contener nada que dependa
 * del origen de los datos (Checkout, Historial, Firestore, Factus) ni nada
 * que dependa de cómo se presenta físicamente (HTML, anchos, fuentes — eso
 * vive en RenderOptions) ni imágenes ya generadas (el QR se representa como
 * `qrPayload`, un texto; la imagen la resuelve PrintService en un PR futuro).
 *
 * `TipoDocumentoTicket` reserva a nivel de tipos los documentos que el motor
 * deberá renderizar en el futuro (nota crédito, devoluciones, caja). Ninguno
 * de esos se implementa en este PR: `TicketModel` hoy solo admite `venta`.
 * Añadir un tipo nuevo es una unión adicional en este archivo + su rama en
 * el renderer, sin tocar la rama `venta`.
 */

export type TipoDocumentoTicket =
  | 'venta'
  | 'nota_credito'
  | 'devolucion'
  | 'apertura_caja'
  | 'cierre_caja'
  | 'arqueo'

/** Encabezado de empresa, común a todo tipo de documento impreso. */
export interface TicketEmpresa {
  nombreComercial: string
  razonSocial?: string
  nit: string
  /** Rótulo fiscal ya derivado del régimen tributario (ej. "Responsable de INC"). */
  rotuloFiscal: string
  direccion?: string
  ciudad?: string
  telefono?: string
}

/** Metadatos del documento (numeración, título, fecha). */
export interface TicketMeta {
  /** Fecha/hora de emisión en ISO 8601. */
  fecha: string
  /** Título mostrado en el cuerpo del ticket, ej. "TICKET DE VENTA". */
  titulo: string
  /** Número de documento ya formateado para mostrar (sin prefijo). */
  numero: string
  prefijo?: string
}

/** Pie de página, común a todo tipo de documento impreso. */
export interface TicketPie {
  fabricanteSoftware: string
  proveedorTecnologico?: string
  mensajeTicket?: string
}

export type TicketImpuestoTipo = 'excluido' | 'inc_8' | 'iva_19'

/** Modificador comercial ya proyectado desde el snapshot U4 de la venta. */
export interface TicketModificador {
  nombre: string
  precioDelta: number
}

export interface TicketItem {
  descripcion: string
  codigo?: string
  cantidad: number
  precioUnitario: number
  subtotal: number
  modificadores?: TicketModificador[]
  /** Reservado: el dominio de ventas aún no produce descuentos por línea. */
  descuento?: number
  impuestoTipo?: TicketImpuestoTipo
  impuestoTarifa?: number
  impuestoValor?: number
  base?: number
}

/** Línea de detalle de la tabla de impuestos (solo se renderiza en tickets DIAN). */
export interface TicketImpuestoLinea {
  tipo: string
  tasa: number
  base: number
  valor: number
}

export interface TicketTotales {
  subtotalBase: number
  /** Reservado: el dominio de ventas aún no produce descuentos globales. */
  totalDescuento?: number
  totalINC: number
  otros?: number
  total: number
}

export interface TicketPago {
  metodo: string
  recibido?: number
  cambio?: number
}

export interface TicketCliente {
  nombre: string
  documento: string
  tipoDoc?: string
}

/**
 * Bloque DIAN. Su presencia determina si el ticket es una Factura Electrónica
 * (con tabla de impuestos, CUFE y QR) o un ticket simple. `qrPayload` es el
 * texto a codificar — nunca una imagen ni un data URI: eso lo resuelve
 * PrintService en un PR posterior y se lo entrega al renderer como asset.
 */
export interface TicketDianInfo {
  numero: string
  prefijo: string
  resolucion?: string
  rangoInicio?: string
  rangoFin?: string
  vigencia?: string
  cufe: string
  qrPayload: string
}

export interface VentaTicketModel {
  tipoDocumento: 'venta'
  empresa: TicketEmpresa
  meta: TicketMeta
  pie: TicketPie
  cliente: TicketCliente
  items: TicketItem[]
  impuestos: TicketImpuestoLinea[]
  totales: TicketTotales
  pago: TicketPago
  dian?: TicketDianInfo
}

/**
 * Unión discriminada del modelo. Hoy solo incluye `VentaTicketModel`; los
 * demás `TipoDocumentoTicket` se añadirán aquí cuando se implementen sus
 * builders y su rama de renderer correspondientes.
 */
export type TicketModel = VentaTicketModel

/**
 * Assets ya resueltos que el renderer necesita pero no puede generar por sí
 * mismo (no debe tocar red ni librerías de imagen). En este PR el único
 * asset previsto es el QR; se deja opcional porque el motor debe poder
 * renderizar un ticket sin QR (ticket sin DIAN, o generación de QR aún no
 * implementada).
 */
export interface TicketAssets {
  /** Data URI de la imagen del QR (ej. "data:image/png;base64,..."). */
  qrDataUri?: string
}
