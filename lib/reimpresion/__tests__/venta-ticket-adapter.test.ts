import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adaptarVentaAModeloTicket, adaptarVentaB2AModeloTicket } from '../venta-ticket-adapter'
import type { ConfiguracionGlobal } from '../../configuracion-service'

// Config mínima válida; los tests sobreescriben lo relevante.
const BASE_CONFIG: ConfiguracionGlobal = {
  nombre_tienda: 'Cafe Central',
  razonSocial: 'Cafe Central SAS',
  nit_tienda: '900123456-7',
  direccion_tienda: 'Calle 1 #2-3',
  ciudad: 'Bogota',
  telefono: '3000000000',
  email: 'a@b.co',
  prefijo_factura: 'SETP',
  consecutivo_actual: 10,
  resolucion_dian: 'RES-123',
  rangoInicio: '1',
  rangoFin: '5000',
  resolucionVigencia: '2027-01-01',
  tipo_contribuyente: 'Regimen Simplificado',
  responsable_iva: '',
  mensaje_ticket: 'Gracias',
  modulos_habilitados: [],
  baseCajaSugerida: 0,
  umbralAlertaFaltante: 0,
}

const cfg = (overrides: Partial<ConfiguracionGlobal> = {}): ConfiguracionGlobal => ({
  ...BASE_CONFIG,
  ...overrides,
})

const ventaNueva = () => ({
  id: 'venta_abc123',
  fecha: '2026-07-03T15:30:00.000Z',
  metodoPago: 'transferencia',
  regimenAlMomento: 'responsable_inc',
  items: [
    { id: 'p1', nombre: 'Cafe', cantidad: 2, precioUnitario: 4500, subtotal: 9000, impuestoTipo: 'inc_8', impuestoTarifa: 8, impuestoValor: 667, base: 8333 },
  ],
  totales: { subtotalBase: 8333, totalINC: 667, totalExcluido: 0, total: 9000 },
})

test('shape actual: totales se toman tal cual', () => {
  const { input } = adaptarVentaAModeloTicket(ventaNueva(), cfg())
  assert.deepEqual(input.totales, { subtotalBase: 8333, totalINC: 667, total: 9000 })
})

test('shape historico (D-TOTALES-VIEJO A): SUBTOTAL = TOTAL, INC = 0', () => {
  const ventaVieja = {
    id: 'v1',
    fecha: '2026-06-15T10:00:00.000Z',
    metodoPago: 'efectivo',
    items: [{ id: 'p1', nombre: 'Pan', cantidad: 1, precioUnitario: 3000, subtotal: 3000 }],
    totales: { subtotal: 2521, iva: 0, impoconsumo: 479, total: 3000 },
  }
  const { input } = adaptarVentaAModeloTicket(ventaVieja, cfg())
  assert.deepEqual(input.totales, { subtotalBase: 3000, totalINC: 0, total: 3000 })
})

test('sin bloque totales: total sale de venta.total y SUBTOTAL = TOTAL', () => {
  const venta = { id: 'v2', fecha: '2026-06-01T10:00:00.000Z', items: [], total: 5000 }
  const { input } = adaptarVentaAModeloTicket(venta, cfg())
  assert.deepEqual(input.totales, { subtotalBase: 5000, totalINC: 0, total: 5000 })
})

test('D-FORMAPAGO: metodoPagoFinal precede a metodoPago', () => {
  const venta = { ...ventaNueva(), metodoPago: 'transferencia', metodoPagoFinal: 'efectivo' }
  const { input } = adaptarVentaAModeloTicket(venta, cfg())
  assert.equal(input.pago.metodo, 'efectivo')
})

test('D-FORMAPAGO: fallback a efectivo cuando no hay metodo', () => {
  const venta = { id: 'v3', fecha: '2026-06-01T10:00:00.000Z', items: [] }
  const { input } = adaptarVentaAModeloTicket(venta, cfg())
  assert.equal(input.pago.metodo, 'efectivo')
})

test('D-FORMAPAGO: recibido/cambio no se pueblan (se preserva su ausencia)', () => {
  const venta = { ...ventaNueva(), dineroRecibido: 10000, cambio: 1000 }
  const { input } = adaptarVentaAModeloTicket(venta, cfg())
  assert.equal(input.pago.recibido, undefined)
  assert.equal(input.pago.cambio, undefined)
})

test('fecha: normaliza Timestamp (toDate), {seconds} y string', () => {
  const d = new Date('2026-07-03T15:30:00.000Z')
  const conToDate = adaptarVentaAModeloTicket({ ...ventaNueva(), fecha: { toDate: () => d } }, cfg())
  assert.ok(conToDate.input.fecha instanceof Date)
  assert.equal((conToDate.input.fecha as Date).getTime(), d.getTime())

  const conSeconds = adaptarVentaAModeloTicket({ ...ventaNueva(), fecha: { seconds: 1751556600 } }, cfg())
  assert.ok(conSeconds.input.fecha instanceof Date)

  const conString = adaptarVentaAModeloTicket(ventaNueva(), cfg())
  assert.ok(conString.input.fecha instanceof Date)
})

test('cliente NO se mapea (fuera de alcance H3): input.cliente undefined', () => {
  const venta = { ...ventaNueva(), clienteNombre: 'Juan Perez', clienteDocumento: '123' }
  const { input } = adaptarVentaAModeloTicket(venta, cfg())
  assert.equal(input.cliente, undefined)
})

test('items: mapeo de campos y fallback de codigo a item.id', () => {
  const { input } = adaptarVentaAModeloTicket(ventaNueva(), cfg())
  assert.equal(input.items.length, 1)
  assert.equal(input.items[0].descripcion, 'Cafe')
  assert.equal(input.items[0].codigo, 'p1') // sin codigo/barcode → id
  assert.equal(input.items[0].cantidad, 2)
  assert.equal(input.items[0].subtotal, 9000)
})

test('items: subtotal se deriva de cantidad*precio si falta', () => {
  const venta = { id: 'v4', fecha: '2026-06-01T10:00:00.000Z', items: [{ id: 'x', nombre: 'Y', cantidad: 3, precioUnitario: 1000 }] }
  const { input } = adaptarVentaAModeloTicket(venta, cfg())
  assert.equal(input.items[0].subtotal, 3000)
})

test('items: proyecta modificadores del snapshot persistido sin consultar catÃ¡logo', () => {
  const venta = {
    ...ventaNueva(),
    items: [{
      ...ventaNueva().items[0],
      modificadores: [{
        grupoId: 'leche',
        opcionIds: ['almendra'],
        opciones: [{ opcionId: 'almendra', nombre: 'Leche Almendra', precioDelta: 1500, cocinaNombre: 'ALMENDRA' }],
      }],
    }],
  }

  const { input } = adaptarVentaAModeloTicket(venta, cfg())
  assert.deepEqual(input.items[0].modificadores, [{ nombre: 'Leche Almendra', precioDelta: 1500 }])
})

test('items legacy: sin snapshot de modificadores conserva la lÃ­nea normal', () => {
  const { input } = adaptarVentaAModeloTicket(ventaNueva(), cfg())
  assert.equal(input.items[0].modificadores, undefined)
})

test('sin DIAN: input.dian es undefined', () => {
  const { input } = adaptarVentaAModeloTicket(ventaNueva(), cfg())
  assert.equal(input.dian, undefined)
})

test('DIAN: despoja prefijo, usa config real y qrPayload de Factus; sin placeholders', () => {
  const venta = {
    ...ventaNueva(),
    dian: { cufe: 'CUFE123', numero: 'SETP000045', prefijo: 'SETP', qr: 'https://factus/qr', resolucion: 'RES-XYZ' },
  }
  const { input } = adaptarVentaAModeloTicket(venta, cfg())
  assert.ok(input.dian)
  assert.equal(input.dian!.numero, '000045') // prefijo despojado (builder padea)
  assert.equal(input.dian!.prefijo, 'SETP')
  assert.equal(input.dian!.resolucion, 'RES-XYZ')
  assert.equal(input.dian!.rangoInicio, '1')
  assert.equal(input.dian!.rangoFin, '5000')
  assert.equal(input.dian!.cufe, 'CUFE123')
  assert.equal(input.dian!.qrPayload, 'https://factus/qr')
})

test('DIAN con config vacia: resolucion/rangos undefined (sin placeholders ficticios)', () => {
  const venta = { ...ventaNueva(), dian: { cufe: 'C', numero: '9', prefijo: 'SETP' } }
  const { input } = adaptarVentaAModeloTicket(venta, cfg({ resolucion_dian: '', rangoInicio: '', rangoFin: '', resolucionVigencia: '' }))
  assert.equal(input.dian!.resolucion, undefined)
  assert.equal(input.dian!.rangoInicio, undefined)
  assert.equal(input.dian!.rangoFin, undefined)
  assert.equal(input.dian!.vigencia, undefined)
  assert.equal(input.dian!.qrPayload, undefined) // builder derivara la URL DIAN
})

test('B2: reimpresión usa exclusivamente snapshotFiscal y no acepta configuración vigente', () => {
  const snapshot = {
    schemaVersion: 1 as const, configuracionRevision: 7,
    identidadFiscal: { nombreComercial: 'Cafe Snapshot', razonSocial: 'Snapshot SAS', numeroDocumento: '900373913', digitoVerificacion: '4', regimenTributario: 'no_responsable', direccion: 'Calle Snapshot', ciudad: 'Bogota', telefono: '3001112233' },
    paisFiscal: 'CO', moneda: 'COP', emitidaEn: '2026-07-03T15:30:00.000Z',
    impuestosLineas: [{ itemId: 'p1', impuestoTipo: 'inc_8', impuestoTarifa: 8, impuestoValor: 74, base: 926 }],
    documento: { items: [{ id: 'p1', nombre: 'Cafe', cantidad: 1, precioUnitario: 1000, subtotal: 1000, impuestoTipo: 'inc_8', impuestoTarifa: 8, impuestoValor: 74, base: 926 }], totales: { subtotalBase: 926, totalINC: 74, total: 1000 }, pago: { metodo: 'efectivo', recibido: 1000, cambio: 0 } },
    numeracion: { numeracionId: 'n1', revision: 3, tipoDocumento: 'pos' as const, scope: 'EMPRESA' as const, numero: 42, prefijo: 'B2', resolucion: 'RES-SNAPSHOT', rangoInicio: 10, rangoFin: 99, vigenciaDesde: '2026-01-01', vigenciaHasta: '2030-12-31' },
  }
  const { input, empresa } = adaptarVentaB2AModeloTicket(snapshot)
  assert.equal(input.numero, 42); assert.equal(input.items[0].descripcion, 'Cafe'); assert.equal(empresa.nombreComercial, 'Cafe Snapshot'); assert.equal(empresa.direccion, 'Calle Snapshot')
  assert.equal(adaptarVentaB2AModeloTicket.length, 1)
})

test('empresa: regimen desde venta.regimenAlMomento y fallback de nombre', () => {
  const { empresa } = adaptarVentaAModeloTicket(ventaNueva(), cfg())
  assert.equal(empresa.regimenTributario, 'responsable_inc')
  assert.equal(empresa.nombreComercial, 'Cafe Central')

  const sinNombre = adaptarVentaAModeloTicket(ventaNueva(), cfg({ nombre_tienda: '' }))
  assert.equal(sinNombre.empresa.nombreComercial, 'MiTienda')
})
