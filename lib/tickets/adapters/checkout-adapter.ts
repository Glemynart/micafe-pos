import type { CrearVentaParams, VentaItem } from '../../ventas-service'
import type { ConfiguracionGlobal } from '../../configuracion-service'
import { proyectarModificadoresTicket } from '../../modifier-snapshot-projection'
import type {
  TicketEmpresaConfig,
  VentaBuilderInput,
  VentaBuilderInputCliente,
  VentaBuilderInputItem,
  VentaBuilderInputPago,
  VentaBuilderInputTotales,
} from '../ticket-builder'

/**
 * Adaptador de Checkout (H4-v2).
 *
 * Traduce una venta del Checkout real (`sell-module.tsx`) al contrato de
 * entrada del motor de tickets (`VentaBuilderInput` + `TicketEmpresaConfig`),
 * convirtiendo al Checkout en el segundo consumidor del motor tras Historial (H3).
 *
 * FUENTE ÚNICA (anti-divergencia): la entrada es EXACTAMENTE el mismo objeto
 * `CrearVentaParams` que `registrarVenta`/`cobrarPedido` persisten en Firestore,
 * ampliado con los dos únicos datos que se generan al persistir y no viven en
 * `params`: `consecutivo` (lo devuelve el servicio) y `fecha` (sello de cliente;
 * en Firestore es `serverTimestamp()`). Al tipar contra `CrearVentaParams`,
 * cualquier cambio futuro del contrato de venta rompe la compilación de este
 * adaptador en vez de divergir silenciosamente. No se mantiene un segundo modelo
 * de venta.
 *
 * RESPONSABILIDAD ÚNICA: adaptar estructuras de datos. Sin HTML, CSS, impresión,
 * Electron ni React. Función pura y síncrona, solo imports de tipos. El motor
 * (`TicketBuilder`, `renderTicket`, `generateQrDataUri`) permanece intacto.
 *
 * Decisiones cerradas que materializa (diseño H4-v2):
 *  - D-CLIENTE / D-CLIENTE-MOSTRADOR: mapea el cliente estructurado cuando existe
 *    (`clienteNombre`/`clienteDocumento`, presentes solo en `cuenta_cobro`). En
 *    ventas de mostrador no hay cliente estructurado → `cliente: undefined` y el
 *    builder aplica su default "CONSUMIDOR FINAL". PROHIBIDO construir clientes
 *    ficticios o replicar ese default aquí: su única fuente es el builder.
 *  - D-PAGO: el adaptador decide cuándo poblar `recibido`/`cambio` (solo si el
 *    método es 'efectivo'); el renderer permanece agnóstico.
 *  - D-CUFE / D-QR: INAPLICABLES en el Checkout. La emisión DIAN (Factus) ocurre
 *    después, desde Historial; en el punto de venta nunca hay CUFE/QR. Por eso
 *    `input.dian` es SIEMPRE `undefined` y el ticket es siempre simple. Nunca se
 *    fabrica información fiscal.
 *
 * `impuestoTipo` (ImpuestoTipo) y `regimenAlMomento` (RegimenTributario) son
 * idénticos a los tipos del motor, por lo que se transportan sin conversión.
 */

/**
 * Fuente única del ticket de Checkout: el objeto `CrearVentaParams` persistido
 * + `consecutivo` (retorno del servicio) + `fecha` (sello de cliente).
 */
export type CheckoutTicketInput = CrearVentaParams & {
  consecutivo: number
  fecha: Date
}

/**
 * D-CLIENTE-MOSTRADOR: mapea el cliente estructurado solo si existe. Los campos
 * `clienteNombre`/`clienteDocumento` únicamente se pueblan en `cuenta_cobro`; en
 * mostrador ambos faltan → `undefined` (el builder aplica CONSUMIDOR FINAL).
 */
function mapearCliente(venta: CheckoutTicketInput): VentaBuilderInputCliente | undefined {
  if (!venta.clienteNombre && !venta.clienteDocumento) return undefined
  return {
    nombre: venta.clienteNombre || undefined,
    documento: venta.clienteDocumento || undefined,
  }
}

/**
 * D-PAGO: método siempre presente; `recibido`/`cambio` solo en efectivo (en otros
 * métodos "cambio" no es un concepto aplicable). El renderer no contiene esta
 * regla: solo pinta las líneas si ambos campos vienen definidos.
 */
function mapearPago(venta: CheckoutTicketInput): VentaBuilderInputPago {
  if (venta.metodoPago !== 'efectivo') return { metodo: venta.metodoPago }
  return {
    metodo: venta.metodoPago,
    recibido: venta.dineroRecibido,
    cambio: venta.cambio,
  }
}

/**
 * Totales del shape canónico ADR-TRIB-001. `totalExcluido` no tiene línea propia
 * en el renderer (su base ya está incluida en `subtotalBase`); no se mapea. No
 * hay `otros`: este modelo no produce un IVA agregado.
 */
function mapearTotales(venta: CheckoutTicketInput): VentaBuilderInputTotales {
  return {
    subtotalBase: venta.totales.subtotalBase,
    totalINC: venta.totales.totalINC,
    total: venta.totales.total,
  }
}

/**
 * Passthrough de items: ya vienen con el snapshot tributario por línea congelado
 * (`impuestoTipo`/`impuestoTarifa`/`impuestoValor`/`base`) en el mismo vocabulario
 * del motor. No se deriva ni recalcula nada.
 */
function mapearItems(items: VentaItem[]): VentaBuilderInputItem[] {
  return items.map((i) => ({
    descripcion: i.nombre,
    codigo: i.id,
    cantidad: i.cantidad,
    precioUnitario: i.precioUnitario,
    subtotal: i.subtotal,
    modificadores: proyectarModificadoresTicket(i.modificadores),
    impuestoTipo: i.impuestoTipo,
    impuestoTarifa: i.impuestoTarifa,
    impuestoValor: i.impuestoValor,
    base: i.base,
  }))
}

/** Encabezado/pie de empresa. El régimen sale del snapshot de la venta (ADR-TRIB-001 D6). */
function mapearEmpresa(venta: CheckoutTicketInput, config: ConfiguracionGlobal): TicketEmpresaConfig {
  return {
    nombreComercial: config.nombre_tienda || 'MiTienda',
    razonSocial: config.razonSocial || undefined,
    nit: config.nit_tienda || '',
    direccion: config.direccion_tienda || undefined,
    ciudad: config.ciudad || undefined,
    telefono: config.telefono || undefined,
    regimenTributario: venta.regimenAlMomento,
  }
}

/**
 * Adapta la venta del Checkout (`CrearVentaParams` + `consecutivo` + `fecha`) +
 * config al contrato del motor. La orquestación (builder → renderer → impresión)
 * vive en el consumidor (`sell-module.tsx`), no aquí.
 */
export function adaptarCheckoutAModeloTicket(
  venta: CheckoutTicketInput,
  config: ConfiguracionGlobal
): { input: VentaBuilderInput; empresa: TicketEmpresaConfig } {
  const input: VentaBuilderInput = {
    numero: venta.consecutivo,
    fecha: venta.fecha,
    cliente: mapearCliente(venta),
    items: mapearItems(venta.items),
    totales: mapearTotales(venta),
    pago: mapearPago(venta),
    // D-CUFE / D-QR: el Checkout nunca emite DIAN → ticket siempre simple.
    dian: undefined,
  }

  return { input, empresa: mapearEmpresa(venta, config) }
}
