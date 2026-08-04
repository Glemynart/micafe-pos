import assert from 'node:assert/strict'
import test from 'node:test'
import { renderTicket } from '../ticket-renderer'
import { RENDER_OPTIONS_80MM } from '../render-options'
import type { VentaTicketModel } from '../ticket-model'

test('P0-07: escapa datos de negocio antes de entregarlos a la ventana HTML', () => {
  const modelo: VentaTicketModel = {
    tipoDocumento: 'venta',
    empresa: {
      nombreComercial: '<script>alert(1)</script>',
      nit: '900123&456',
      rotuloFiscal: 'OPERACIÓ<N NO FISCAL',
    },
    meta: {
      fecha: '2026-08-03T12:00:00.000Z',
      titulo: 'Venta "demo"',
      numero: 'DEMO-1',
      modoOperacion: 'DEMO',
    },
    pie: {
      fabricanteSoftware: 'POS <seguro>',
      mensajeTicket: "Gracias 'cliente'",
    },
    cliente: { nombre: '<cliente>', documento: '1&2' },
    items: [{
      descripcion: '<producto>',
      codigo: 'A&B',
      cantidad: 1,
      precioUnitario: 1000,
      subtotal: 1000,
      modificadores: [{ nombre: '<modificador>', precioDelta: 0 }],
    }],
    impuestos: [],
    totales: { subtotalBase: 1000, totalINC: 0, total: 1000 },
    pago: { metodo: 'efectivo' },
  }

  const html = renderTicket(modelo, RENDER_OPTIONS_80MM, {})

  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /&lt;producto&gt;/)
  assert.match(html, /A&amp;B/)
  assert.match(html, /&quot;demo&quot;/)
  assert.match(html, /&#39;cliente&#39;/)
})
