import assert from "node:assert/strict"
import test from "node:test"
import { RECIBO_INTERNO_BODEGA_VERSION, normalizarReciboInternoVentaBodega } from "./recibo-interno"
import { renderReciboInternoVentaBodega } from "./recibo-interno-renderer"
import { proyectarVentaBodegaAdmin } from "./ui-contract"

const snapshot = {
  version: RECIBO_INTERNO_BODEGA_VERSION,
  empresaId: "tenant-a",
  nombreComercialSnapshot: "Distribuidora",
  consecutivo: 12,
  folioInterno: "BOD-000012",
  fechaConfirmacionIso: "2026-10-30T15:00:00.000Z",
  cliente: { id: "cliente-a", nombre: "Tienda <Centro>" },
  lineas: [{
    productoId: "producto-a", nombreProducto: "Aguardiente & más", presentacionId: "unidad-a",
    nombrePresentacion: "Unidad individual", cantidad: 2, factorUnidadBase: 1, unidadBase: "unidad",
    precioBaseCOP: 10000, precioUnitarioCOP: 9000, subtotalCOP: 18000, ofertaId: "oferta-a",
  }],
  subtotalCOP: 20000,
  descuentoCOP: 2000,
  totalCOP: 18000,
  metodoPago: "cuenta_cobro",
  estadoPagoInicial: "PENDIENTE",
  saldoInicialCOP: 18000,
  montoRecibidoCOP: null,
  cambioCOP: null,
  costoTotalLineaCOP: 1,
}

test("ADR-098: normaliza una whitelist del snapshot y descarta costos u otros campos", () => {
  const recibo = normalizarReciboInternoVentaBodega(snapshot)
  assert.ok(recibo)
  assert.equal(recibo.folioInterno, "BOD-000012")
  assert.equal(recibo.saldoInicialCOP, 18000)
  assert.equal("costoTotalLineaCOP" in recibo.lineas[0], false)
})

test("ADR-098: rechaza snapshot inconsistente y folio que no coincide con el consecutivo", () => {
  assert.equal(normalizarReciboInternoVentaBodega({ ...snapshot, folioInterno: "BOD-000011" }), null)
  assert.equal(normalizarReciboInternoVentaBodega({ ...snapshot, saldoInicialCOP: 1 }), null)
  assert.equal(normalizarReciboInternoVentaBodega({ ...snapshot, lineas: [] }), null)
})

test("ADR-098: la proyección administrativa conserva el recibo validado y descarta campos ajenos", () => {
  const venta = proyectarVentaBodegaAdmin("venta-a", {
    schemaVersion: "BODEGA_MVP1_V1",
    totales: { total: 18000 },
    reciboInterno: { ...snapshot, costoPresentacionCOP: 9000 },
  })
  assert.equal(venta.reciboInterno?.folioInterno, "BOD-000012")
  assert.equal(JSON.stringify(venta).includes("costo"), false)
})

test("ADR-098: renderiza el recibo pendiente, su leyenda y anulación escapando contenido del tenant", () => {
  const recibo = normalizarReciboInternoVentaBodega(snapshot)
  assert.ok(recibo)
  const html = renderReciboInternoVentaBodega(recibo, "anulada")
  assert.match(html, /RECIBO INTERNO DE VENTA/)
  assert.match(html, /No es factura electrónica ni documento fiscal/)
  assert.match(html, /BOD-000012/)
  assert.match(html, /PENDIENTE DE PAGO/)
  assert.match(html, /Saldo inicial pendiente/)
  assert.match(html, /VENTA ANULADA/)
  assert.match(html, /Tienda &lt;Centro&gt;/)
  assert.match(html, /Aguardiente &amp; más/)
  assert.doesNotMatch(html, /<Centro>/)
  assert.doesNotMatch(html, /costoTotalLineaCOP/)
})
