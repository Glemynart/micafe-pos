import type {
  TicketEmpresaConfig,
  VentaBuilderInput,
  VentaBuilderInputDian,
  VentaBuilderInputItem,
  VentaBuilderInputTotales,
} from '../tickets'
import type { ConfiguracionHistoricaTicket } from './legacy-ticket-config'
import { proyectarModificadoresTicket } from '../modifier-snapshot-projection'
import type { SnapshotFiscal } from '../fiscal/contrato'
import type { CheckoutConfiguracionEmpresa } from '../tickets/adapters/checkout-adapter'

/**
 * Adaptador de reimpresión (H3).
 *
 * Traduce el documento crudo de una Venta de Firestore + la configuración
 * histórica explícita del ticket.
 * al contrato de entrada del motor de tickets (`VentaBuilderInput` +
 * `TicketEmpresaConfig`). Convierte a Historial en el primer consumidor del
 * motor introducido en H1/H2 sin modificar el motor.
 *
 * RESPONSABILIDAD ÚNICA: adaptar estructuras de datos. Este módulo NO contiene
 * HTML, CSS, decisiones visuales, lógica fiscal (rótulo/impuestos los deriva el
 * builder), lógica de impresión, ni lógica de presentación (formateo lo hace el
 * renderer). Es una función pura y síncrona, sin efectos secundarios ni imports
 * en tiempo de ejecución (solo tipos).
 *
 * Decisiones cerradas que materializa (ver diseño H3):
 *  - Shape dual: soporta el modelo actual `{subtotalBase, totalINC}` y el
 *    histórico `{subtotal, iva, impoconsumo}` en un único punto (`mapearTotales`),
 *    dejando al motor 100% agnóstico del origen.
 *  - D-TOTALES-VIEJO (A): en el shape histórico se preserva la salida visible
 *    actual (SUBTOTAL = TOTAL); no se re-superficia el desglose de un modelo
 *    tributario ya derogado por ADR-TRIB-001.
 *  - D-FORMAPAGO: resuelve el método de pago real
 *    (`metodoPagoFinal → metodoPago → 'efectivo'`), corrigiendo la salida rota
 *    ("FORMA PAGO: UNDEFINED"). No introduce reglas adicionales.
 *  - Rótulo fiscal: se deriva del régimen congelado en la venta
 *    (`regimenAlMomento`), no de `tipo_contribuyente` (el builder lo deriva).
 *  - Placeholders DIAN eliminados: resolución/rangos salen de config real o
 *    quedan vacíos; nunca valores ficticios.
 *  - Cliente: NO se mapea (fuera de alcance de H3); el builder aplica el default
 *    "CONSUMIDOR FINAL", preservando el comportamiento actual.
 */

const PREFIJO_DEFAULT = 'SETT'

/**
 * Normaliza la fecha de la venta a `Date`. El doc crudo de Firestore la entrega
 * como `Timestamp` (con `toDate()`); se contemplan además `{seconds}` (admin),
 * string ISO y `Date` por robustez.
 */
function normalizarFecha(fecha: any): Date {
  if (fecha instanceof Date) return fecha
  if (fecha && typeof fecha.toDate === 'function') return fecha.toDate()
  if (fecha && typeof fecha.seconds === 'number') return new Date(fecha.seconds * 1000)
  if (fecha && typeof fecha._seconds === 'number') return new Date(fecha._seconds * 1000)
  return new Date(fecha)
}

/** D-FORMAPAGO: origen real del método de pago, sin reglas extra. */
function resolverMetodoPago(venta: any): string {
  return venta?.metodoPagoFinal ?? venta?.metodoPago ?? 'efectivo'
}

/** Resuelve el prefijo de facturación (idéntico al que usaba Historial). */
function resolverPrefijo(venta: any, config: ConfiguracionHistoricaTicket): string {
  return venta?.dian?.prefijo || config.prefijo_factura || PREFIJO_DEFAULT
}

/**
 * Quita el prefijo del número de factura si viene embebido (ej. "SETT000123"),
 * de modo que el builder reciba solo el número y aplique el padding. Misma
 * normalización que hacía Historial.
 */
function despojarPrefijo(numero: any, prefijo: string): string {
  if (typeof numero !== 'string') return String(numero ?? '')
  const cleanPref = prefijo.trim().toUpperCase()
  const cleanVal = numero.trim().toUpperCase()
  if (cleanPref && cleanVal.startsWith(cleanPref)) {
    return numero.trim().substring(cleanPref.length).trim()
  }
  return numero.trim()
}

/**
 * Punto único del shape dual. El motor solo ve el shape normalizado.
 * - Shape actual: se toman `subtotalBase`/`totalINC` tal cual.
 * - Shape histórico o sin `totales` (D-TOTALES-VIEJO A): SUBTOTAL = TOTAL,
 *   INC = 0, preservando exactamente la salida visible actual.
 */
function mapearTotales(venta: any): VentaBuilderInputTotales {
  const t = venta?.totales
  const total = Number(t?.total ?? venta?.total ?? 0)
  const esShapeNuevo = t?.subtotalBase !== undefined
  if (esShapeNuevo) {
    return {
      subtotalBase: Number(t.subtotalBase ?? 0),
      totalINC: Number(t.totalINC ?? 0),
      total,
    }
  }
  return { subtotalBase: total, totalINC: 0, total }
}

function mapearItems(items: any): VentaBuilderInputItem[] {
  const lista: any[] = Array.isArray(items) ? items : []
  return lista.map((i) => {
    const cantidad = Number(i?.cantidad ?? 1)
    const precioUnitario = Number(i?.precioUnitario ?? i?.precio ?? i?.precio_unitario ?? 0)
    return {
      descripcion: i?.nombre ?? i?.descripcion ?? '',
      codigo: i?.codigo ?? i?.barcode ?? i?.producto_id ?? i?.id,
      cantidad,
      precioUnitario,
      subtotal: Number(i?.subtotal ?? cantidad * precioUnitario),
      modificadores: proyectarModificadoresTicket(i?.modificadores),
      impuestoTipo: i?.impuestoTipo,
      impuestoTarifa: i?.impuestoTarifa,
      impuestoValor: i?.impuestoValor,
      base: i?.base,
    }
  })
}

/**
 * Bloque DIAN. Su presencia (CUFE) determina que la venta es Factura
 * Electrónica. Sin placeholders: resolución/rangos salen de config real o
 * quedan vacíos. El `qrPayload` es el contenido de Factus (`dian.qr`); si viene
 * vacío, el builder deriva la URL pública de la DIAN a partir del CUFE.
 */
function mapearDian(
  venta: any,
  config: ConfiguracionHistoricaTicket,
  prefijo: string
): VentaBuilderInputDian | undefined {
  const d = venta?.dian
  if (!d?.cufe) return undefined
  return {
    numero: despojarPrefijo(d.numero, prefijo),
    prefijo,
    resolucion: d.resolucion || config.resolucion_dian || undefined,
    rangoInicio: config.rangoInicio || undefined,
    rangoFin: config.rangoFin || undefined,
    vigencia: config.resolucionVigencia || undefined,
    cufe: d.cufe,
    qrPayload: d.qr || undefined,
  }
}

/** Encabezado/pie de empresa. El régimen sale del snapshot de la venta (ADR). */
function mapearEmpresa(venta: any, config: ConfiguracionHistoricaTicket): TicketEmpresaConfig {
  return {
    nombreComercial: config.nombre_tienda || 'MiTienda',
    razonSocial: config.razonSocial || undefined,
    nit: config.nit_tienda || '',
    direccion: config.direccion_tienda || undefined,
    ciudad: config.ciudad || undefined,
    telefono: config.telefono || undefined,
    regimenTributario: venta?.regimenAlMomento,
  }
}

/**
 * Adapta un documento de venta (crudo, de `obtenerVentaPorId`) + config al
 * contrato del motor. La orquestación (builder → QR → renderer → impresión)
 * vive en el consumidor (Historial), no aquí.
 */
export function adaptarVentaAModeloTicket(
  venta: any,
  config: ConfiguracionHistoricaTicket
): { input: VentaBuilderInput; empresa: TicketEmpresaConfig } {
  const prefijo = resolverPrefijo(venta, config)

  const input: VentaBuilderInput = {
    numero: venta?.id ?? '',
    fecha: normalizarFecha(venta?.fecha),
    // Cliente no se mapea (H3 fuera de alcance): el builder aplica el default
    // "CONSUMIDOR FINAL", preservando el comportamiento actual.
    items: mapearItems(venta?.items),
    totales: mapearTotales(venta),
    pago: {
      metodo: resolverMetodoPago(venta),
      // recibido/cambio no se pueblan: hoy nunca se imprimen; añadirlos sería
      // funcionalidad nueva fuera de alcance de H3.
    },
    dian: mapearDian(venta, config, prefijo),
  }

  return { input, empresa: mapearEmpresa(venta, config) }
}

/** Adaptador exclusivo B2: no recibe ni consulta configuración o autoridades vigentes. */
export function adaptarVentaB2AModeloTicket(snapshot: SnapshotFiscal): { input: VentaBuilderInput; empresa: TicketEmpresaConfig } {
  const d = snapshot.documento
  const identidad = snapshot.identidadFiscal
  return {
    input: {
      numero: snapshot.numeracion.numero,
      fecha: normalizarFecha(snapshot.emitidaEn),
      cliente: d.cliente,
      items: d.items.map((item) => ({
        descripcion: item.nombre, codigo: item.codigo ?? item.id, cantidad: item.cantidad,
        precioUnitario: item.precioUnitario, subtotal: item.subtotal,
        impuestoTipo: item.impuestoTipo as VentaBuilderInputItem['impuestoTipo'],
        impuestoTarifa: item.impuestoTarifa, impuestoValor: item.impuestoValor, base: item.base,
      })),
      totales: d.totales,
      pago: d.pago,
    },
    empresa: {
      nombreComercial: identidad.nombreComercial,
      razonSocial: identidad.razonSocial,
      nit: identidad.numeroDocumento ? `${identidad.numeroDocumento}${identidad.digitoVerificacion ? `-${identidad.digitoVerificacion}` : ''}` : '',
      direccion: identidad.direccion,
      ciudad: identidad.ciudad,
      telefono: identidad.telefono,
      regimenTributario: identidad.regimenTributario as TicketEmpresaConfig['regimenTributario'],
    },
  }
}

/**
 * Adapta una venta DEMO persistida usando la configuración canónica vigente.
 * Una venta DEMO no tiene snapshot fiscal y por eso no puede pasar por B2 ni
 * inventar identidad, numeración o datos DIAN para poder reimprimirse.
 */
export function adaptarVentaDemoAModeloTicket(
  venta: any,
  config: CheckoutConfiguracionEmpresa,
): { input: VentaBuilderInput; empresa: TicketEmpresaConfig } {
  return {
    input: {
      numero: venta?.referenciaOperacion ?? venta?.id ?? '',
      fecha: normalizarFecha(venta?.fecha),
      modoOperacion: 'DEMO',
      cliente: venta?.clienteNombre || venta?.clienteDocumento
        ? { nombre: venta.clienteNombre, documento: venta.clienteDocumento }
        : undefined,
      items: mapearItems(venta?.items),
      totales: mapearTotales(venta),
      pago: { metodo: resolverMetodoPago(venta) },
    },
    empresa: {
      nombreComercial: config.identidad.nombreComercial,
      direccion: config.localizacion.direccion.linea1,
      ciudad: config.localizacion.direccion.municipioNombre,
      telefono: config.identidad.contacto.telefono,
      nit: '',
    },
  }
}

/** Nombre explícito para el camino histórico; no consulta una autoridad vigente. */
export const adaptarVentaLegacyAModeloTicket = adaptarVentaAModeloTicket
