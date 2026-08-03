import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TicketBuilder } from '../ticket-builder'
import { EMPRESA_BASE, EMPRESA_RESPONSABLE_INC, CONSUMIDOR_FINAL_DIAN_INPUT, VENTA_SIMPLE_INPUT } from './fixtures'

test('fromVenta: ticket simple sin DIAN usa defaults de Consumidor Final y no arma impuestos', () => {
  const modelo = TicketBuilder.fromVenta(VENTA_SIMPLE_INPUT, EMPRESA_BASE)

  assert.equal(modelo.tipoDocumento, 'venta')
  assert.equal(modelo.dian, undefined)
  assert.equal(modelo.cliente.nombre, 'CONSUMIDOR FINAL')
  assert.equal(modelo.cliente.documento, '222222222222')
  assert.equal(modelo.meta.titulo, 'TICKET DE VENTA')
  assert.equal(modelo.meta.numero, '000042')
  assert.deepEqual(modelo.impuestos, [])
})

test('fromVenta: DEMO se identifica como operación no fiscal y no proyecta impuestos', () => {
  const modelo = TicketBuilder.fromVenta(
    { ...VENTA_SIMPLE_INPUT, modoOperacion: 'DEMO', numero: 'DEMO-venta-1' },
    { ...EMPRESA_RESPONSABLE_INC, razonSocial: undefined, nit: '' },
  )

  assert.equal(modelo.meta.titulo, 'VENTA DE DEMOSTRACIÓN — NO FISCAL')
  assert.equal(modelo.meta.numero, 'DEMO-venta-1')
  assert.equal(modelo.meta.modoOperacion, 'DEMO')
  assert.equal(modelo.empresa.rotuloFiscal, 'OPERACIÓN NO FISCAL')
  assert.equal(modelo.empresa.razonSocial, undefined)
  assert.equal(modelo.empresa.nit, '')
  assert.deepEqual(modelo.impuestos, [])
  assert.equal(modelo.dian, undefined)
})

test('fromVenta: rotulo fiscal se deriva del regimen de la empresa (default no_responsable)', () => {
  const sinRegimen = TicketBuilder.fromVenta(VENTA_SIMPLE_INPUT, { ...EMPRESA_BASE, regimenTributario: undefined })
  assert.equal(sinRegimen.empresa.rotuloFiscal, 'No Responsable de INC')

  const responsableInc = TicketBuilder.fromVenta(VENTA_SIMPLE_INPUT, EMPRESA_RESPONSABLE_INC)
  assert.equal(responsableInc.empresa.rotuloFiscal, 'Responsable de INC')

  const responsableIva = TicketBuilder.fromVenta(VENTA_SIMPLE_INPUT, {
    ...EMPRESA_BASE,
    regimenTributario: 'responsable_iva',
  })
  assert.equal(responsableIva.empresa.rotuloFiscal, 'Responsable de IVA')
})

test('fromVenta: la presencia de dian determina el titulo y arma el bloque DIAN', () => {
  const modelo = TicketBuilder.fromVenta(CONSUMIDOR_FINAL_DIAN_INPUT, EMPRESA_RESPONSABLE_INC)

  assert.equal(modelo.meta.titulo, 'FACTURA ELECTRÓNICA DE VENTA')
  assert.ok(modelo.dian)
  assert.equal(modelo.dian?.cufe, CONSUMIDOR_FINAL_DIAN_INPUT.dian?.cufe)
  assert.equal(modelo.dian?.numero, '000101')
  assert.equal(modelo.impuestos.length, 1)
  assert.equal(modelo.impuestos[0].tipo, 'INC')
})

test('fromVenta: qrPayload se deriva del CUFE cuando no se provee explicitamente', () => {
  const modelo = TicketBuilder.fromVenta(CONSUMIDOR_FINAL_DIAN_INPUT, EMPRESA_RESPONSABLE_INC)
  assert.equal(
    modelo.dian?.qrPayload,
    `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentKey=${CONSUMIDOR_FINAL_DIAN_INPUT.dian?.cufe}`
  )
})

test('fromVenta: qrPayload explicito no se sobreescribe', () => {
  const input = {
    ...CONSUMIDOR_FINAL_DIAN_INPUT,
    dian: { ...CONSUMIDOR_FINAL_DIAN_INPUT.dian!, qrPayload: 'https://ejemplo.com/qr-explicito' },
  }
  const modelo = TicketBuilder.fromVenta(input, EMPRESA_RESPONSABLE_INC)
  assert.equal(modelo.dian?.qrPayload, 'https://ejemplo.com/qr-explicito')
})

test('fromVenta: cliente registrado sobreescribe los defaults de Consumidor Final', () => {
  const input = {
    ...CONSUMIDOR_FINAL_DIAN_INPUT,
    cliente: { nombre: 'Juan Perez', documento: '1020304050' },
  }
  const modelo = TicketBuilder.fromVenta(input, EMPRESA_RESPONSABLE_INC)
  assert.equal(modelo.cliente.nombre, 'JUAN PEREZ')
  assert.equal(modelo.cliente.documento, '1020304050')
})

test('fromVenta: conserva el detalle comercial de modificadores en orden', () => {
  const input = {
    ...VENTA_SIMPLE_INPUT,
    items: [{
      ...VENTA_SIMPLE_INPUT.items[0],
      modificadores: [
        { nombre: 'Grande', precioDelta: 0 },
        { nombre: 'Leche Almendra', precioDelta: 1500 },
        { nombre: 'Canela', precioDelta: 0 },
      ],
    }],
  }

  const modelo = TicketBuilder.fromVenta(input, EMPRESA_BASE)
  assert.deepEqual(modelo.items[0].modificadores, input.items[0].modificadores)
})
