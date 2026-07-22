export type {
  TicketModel,
  VentaTicketModel,
  TicketAssets,
  TicketEmpresa,
  TicketMeta,
  TicketPie,
  TicketCliente,
  TicketItem,
  TicketImpuestoLinea,
  TicketImpuestoTipo,
  TicketTotales,
  TicketPago,
  TicketDianInfo,
  TipoDocumentoTicket,
} from './ticket-model'

export type { RenderOptions, RenderOptionsColumnas } from './render-options'
export { DEFAULT_RENDER_OPTIONS, RENDER_OPTIONS_58MM, RENDER_OPTIONS_80MM } from './render-options'

export { renderTicket } from './ticket-renderer'

export { TicketBuilder } from './ticket-builder'
export type {
  TicketEmpresaConfig,
  RegimenTributarioTicket,
  VentaBuilderInput,
  VentaBuilderInputCliente,
  VentaBuilderInputItem,
  VentaBuilderInputTotales,
  VentaBuilderInputPago,
  VentaBuilderInputDian,
} from './ticket-builder'

export { formatMoney, formatFecha } from './format'
export type { FechaFormateada } from './format'

export { generateQrDataUri, QrGenerator, DEFAULT_QR_OPTIONS } from './qr-generator'
export type { QrOptions, QrErrorCorrectionLevel } from './qr-generator'
