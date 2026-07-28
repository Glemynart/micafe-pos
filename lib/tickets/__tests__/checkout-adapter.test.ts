import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adaptarCheckoutAModeloTicket, type CheckoutConfiguracionEmpresa, type CheckoutTicketInput } from '../adapters/checkout-adapter'
import type { ConfiguracionHistoricaTicket } from '../../reimpresion/legacy-ticket-config'

// Venta canónica del Checkout: CrearVentaParams + { consecutivo, fecha }.
// Es EXACTAMENTE el objeto que registrarVenta/cobrarPedido persisten (fuente única).
const BASE_VENTA: CheckoutTicketInput = {
  turnoId: 't1',
  cajeroId: 'u1',
  cajeroNombre: 'Cajero',
  items: [
    {
      id: 'CAF01',
      nombre: 'Cafe',
      cantidad: 2,
      precioUnitario: 4500,
      costoUnitario: 1000,
      subtotal: 9000,
      base: 8333,
      impuestoTipo: 'inc_8',
      impuestoTarifa: 8,
      impuestoValor: 667,
    },
  ],
  totales: { subtotalBase: 8333, totalINC: 667, totalExcluido: 0, total: 9000 },
  regimenAlMomento: 'responsable_inc',
  metodoPago: 'efectivo',
  dineroRecibido: 10000,
  cambio: 1000,
  estado: 'pagada',
  consecutivo: 45,
  fecha: new Date('2026-07-05T15:30:00.000Z'),
}

const venta = (overrides: Partial<CheckoutTicketInput> = {}): CheckoutTicketInput => ({
  ...BASE_VENTA,
  ...overrides,
})

const BASE_CONFIG: ConfiguracionHistoricaTicket = {
  nombre_tienda: 'Cafe Central',
  razonSocial: 'Cafe Central SAS',
  nit_tienda: '900123456-7',
  direccion_tienda: 'Calle 1 #2-3',
  ciudad: 'Bogota',
  telefono: '3000000000',
  email: 'a@b.co',
  prefijo_factura: 'SETP',
  resolucion_dian: '',
  mensaje_ticket: 'Gracias',
}

const cfg = (overrides: Partial<ConfiguracionHistoricaTicket> = {}): CheckoutConfiguracionEmpresa => { const c = { ...BASE_CONFIG, ...overrides }; const [numeroDocumento, digitoVerificacion] = c.nit_tienda.split('-'); return { identidad: { nombreComercial: c.nombre_tienda, razonSocial: c.razonSocial, tipoPersona: undefined, tipoDocumento: 'NIT', numeroDocumento, digitoVerificacion, regimenTributario: undefined, responsabilidadesFiscales: undefined, actividadEconomicaPrincipal: undefined, contacto: { email: c.email, telefono: c.telefono } }, localizacion: { paisFiscal: 'CO', moneda: 'COP', idioma: 'es-CO', zonaHoraria: 'America/Bogota', direccion: { linea1: c.direccion_tienda, municipioNombre: c.ciudad } }, ticket: { mensajePie: c.mensaje_ticket, mostrarLogoDocumento: false, mostrarRazonSocial: true, mostrarDireccion: true, mostrarTelefono: true, mostrarDesgloseImpuestos: true } } }

// ── D-PAGO ──────────────────────────────────────────────────────────────────

test('D-PAGO efectivo: puebla metodo, recibido y cambio', () => {
  const { input } = adaptarCheckoutAModeloTicket(venta({ metodoPago: 'efectivo', dineroRecibido: 10000, cambio: 1000 }), cfg())
  assert.equal(input.pago.metodo, 'efectivo')
  assert.equal(input.pago.recibido, 10000)
  assert.equal(input.pago.cambio, 1000)
})

test('D-PAGO transferencia: metodo poblado, recibido/cambio ausentes', () => {
  const { input } = adaptarCheckoutAModeloTicket(venta({ metodoPago: 'transferencia', dineroRecibido: undefined, cambio: undefined }), cfg())
  assert.equal(input.pago.metodo, 'transferencia')
  assert.equal(input.pago.recibido, undefined)
  assert.equal(input.pago.cambio, undefined)
})

test('D-PAGO cuenta_cobro: recibido/cambio ausentes', () => {
  const { input } = adaptarCheckoutAModeloTicket(
    venta({ metodoPago: 'cuenta_cobro', estado: 'pendiente', clienteNombre: 'Juan', clienteDocumento: '123' }),
    cfg()
  )
  assert.equal(input.pago.metodo, 'cuenta_cobro')
  assert.equal(input.pago.recibido, undefined)
  assert.equal(input.pago.cambio, undefined)
})

test('D-PAGO mixto: recibido/cambio ausentes', () => {
  const { input } = adaptarCheckoutAModeloTicket(venta({ metodoPago: 'mixto' }), cfg())
  assert.equal(input.pago.metodo, 'mixto')
  assert.equal(input.pago.recibido, undefined)
  assert.equal(input.pago.cambio, undefined)
})

// ── D-CLIENTE / D-CLIENTE-MOSTRADOR ──────────────────────────────────────────

test('D-CLIENTE cuenta_cobro: mapea clienteNombre/clienteDocumento', () => {
  const { input } = adaptarCheckoutAModeloTicket(
    venta({ metodoPago: 'cuenta_cobro', estado: 'pendiente', clienteNombre: 'Juan Perez', clienteDocumento: '123456' }),
    cfg()
  )
  assert.deepEqual(input.cliente, { nombre: 'Juan Perez', documento: '123456' })
})

test('D-CLIENTE-MOSTRADOR: sin cliente estructurado → cliente undefined', () => {
  const { input } = adaptarCheckoutAModeloTicket(venta({ metodoPago: 'efectivo' }), cfg())
  assert.equal(input.cliente, undefined) // el builder aplicara CONSUMIDOR FINAL
})

test('D-CLIENTE parcial (solo nombre): documento undefined, no rompe', () => {
  const { input } = adaptarCheckoutAModeloTicket(venta({ clienteNombre: 'Solo Nombre' }), cfg())
  assert.equal(input.cliente!.nombre, 'Solo Nombre')
  assert.equal(input.cliente!.documento, undefined)
})

// ── Totales ─────────────────────────────────────────────────────────────────

test('Totales: subtotalBase/totalINC/total del shape canonico', () => {
  const { input } = adaptarCheckoutAModeloTicket(venta(), cfg())
  assert.deepEqual(input.totales, { subtotalBase: 8333, totalINC: 667, total: 9000 })
})

test('Totales: totalExcluido no se mapea (no es linea del renderer)', () => {
  const { input } = adaptarCheckoutAModeloTicket(
    venta({ totales: { subtotalBase: 5000, totalINC: 0, totalExcluido: 5000, total: 5000 } }),
    cfg()
  )
  assert.equal((input.totales as any).totalExcluido, undefined)
  assert.equal((input.totales as any).otros, undefined)
  assert.deepEqual(input.totales, { subtotalBase: 5000, totalINC: 0, total: 5000 })
})

// ── Items (passthrough del snapshot tributario) ──────────────────────────────

test('Items: passthrough de impuestoTipo/base sin derivar ni recalcular', () => {
  const { input } = adaptarCheckoutAModeloTicket(venta(), cfg())
  const it = input.items[0]
  assert.equal(it.descripcion, 'Cafe')
  assert.equal(it.codigo, 'CAF01')
  assert.equal(it.cantidad, 2)
  assert.equal(it.precioUnitario, 4500)
  assert.equal(it.subtotal, 9000)
  assert.equal(it.impuestoTipo, 'inc_8')
  assert.equal(it.impuestoTarifa, 8)
  assert.equal(it.impuestoValor, 667)
  assert.equal(it.base, 8333)
})

test('Items: excluido se preserva tal cual', () => {
  const { input } = adaptarCheckoutAModeloTicket(
    venta({
      items: [
        { id: 'X', nombre: 'Excluido', cantidad: 1, precioUnitario: 1000, costoUnitario: 0, subtotal: 1000, base: 1000, impuestoTipo: 'excluido', impuestoTarifa: 0, impuestoValor: 0 },
      ],
    }),
    cfg()
  )
  assert.equal(input.items[0].impuestoTipo, 'excluido')
})

test('Items: proyecta modificadores exclusivamente desde el snapshot U4', () => {
  const { input } = adaptarCheckoutAModeloTicket(venta({
    items: [{
      ...BASE_VENTA.items[0],
      modificadores: [{
        grupoId: 'tamano',
        opcionIds: ['grande'],
        nombreGrupo: 'TamaÃ±o',
        opciones: [{ opcionId: 'grande', nombre: 'Grande', precioDelta: 0, cocinaNombre: 'VASO GRANDE' }],
      }, {
        grupoId: 'leche',
        opcionIds: ['almendra', 'canela'],
        nombreGrupo: 'Leche y extras',
        opciones: [
          { opcionId: 'almendra', nombre: 'Leche Almendra', precioDelta: 1500, cocinaNombre: 'ALMENDRA' },
          { opcionId: 'canela', nombre: 'Canela', precioDelta: 0 },
        ],
      }],
    }],
  }), cfg())

  assert.deepEqual(input.items[0].modificadores, [
    { nombre: 'Grande', precioDelta: 0 },
    { nombre: 'Leche Almendra', precioDelta: 1500 },
    { nombre: 'Canela', precioDelta: 0 },
  ])
})

// ── Empresa / regimen ────────────────────────────────────────────────────────

test('Empresa: regimen desde regimenAlMomento (snapshot)', () => {
  const { empresa } = adaptarCheckoutAModeloTicket(venta({ regimenAlMomento: 'responsable_iva' }), cfg())
  assert.equal(empresa.regimenTributario, 'responsable_iva')
})

test('Empresa: mapeo canónico sin fallback de identidad', () => {
  const { empresa } = adaptarCheckoutAModeloTicket(venta(), cfg())
  assert.equal(empresa.nombreComercial, 'Cafe Central')
  assert.equal(empresa.razonSocial, 'Cafe Central SAS')
  assert.equal(empresa.nit, '900123456-7')
  assert.equal(empresa.direccion, 'Calle 1 #2-3')
  assert.equal(empresa.telefono, '3000000000')

  const sinNombre = adaptarCheckoutAModeloTicket(venta(), cfg({ nombre_tienda: '' }))
  assert.equal(sinNombre.empresa.nombreComercial, '')
})

// ── Numero / fecha ───────────────────────────────────────────────────────────

test('Numero: sale del consecutivo capturado', () => {
  const { input } = adaptarCheckoutAModeloTicket(venta({ consecutivo: 88 }), cfg())
  assert.equal(input.numero, 88)
})

test('Fecha: se transporta la fecha de la venta', () => {
  const f = new Date('2026-07-05T12:00:00.000Z')
  const { input } = adaptarCheckoutAModeloTicket(venta({ fecha: f }), cfg())
  assert.equal(input.fecha, f)
})

// ── Invariante del Checkout ──────────────────────────────────────────────────

test('INVARIANTE: input.dian SIEMPRE undefined (Checkout nunca emite DIAN)', () => {
  const efectivo = adaptarCheckoutAModeloTicket(venta({ metodoPago: 'efectivo' }), cfg())
  const credito = adaptarCheckoutAModeloTicket(venta({ metodoPago: 'cuenta_cobro', estado: 'pendiente', clienteNombre: 'J', clienteDocumento: '1' }), cfg())
  assert.equal(efectivo.input.dian, undefined)
  assert.equal(credito.input.dian, undefined)
})
