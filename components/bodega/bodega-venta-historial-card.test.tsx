import assert from "node:assert/strict"
import test from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BodegaVentaHistorialCard } from "./bodega-venta-historial-card"
import type { VentaVendedorDTO } from "@/lib/bodega/ui-contract"

const venta: VentaVendedorDTO = {
  id: "r1a-WyJFM8yLUJPREVHQS1TVEFHSU5HLUZJWFRVUkUiLCJ2ZW50YS1ib2RlZ2EiY21kLWNvbmN1cnQzF0ZWYtMjAyNjEwMDMiXQ",
  fecha: "2026-10-20T14:00:00.000Z",
  clienteId: "cliente-fixture",
  cliente: "E2_2-BODEGA-STAGING-FIXTURE-CLIENTE-GATE-F",
  items: [],
  total: 5000,
  metodoPago: "efectivo",
  estado: "CONFIRMADA",
  turnoId: null,
  montoRecibidoCOP: 10000,
  cambioCOP: 5000,
}

test("Mis ventas conserva la referencia completa sin mostrarla como texto de tarjeta", () => {
  const html = renderToStaticMarkup(<BodegaVentaHistorialCard venta={venta} />)
  assert.match(html, /<summary>Ref\. …[A-Z0-9]{8}<\/summary>/)
  assert.match(html, /<code[^>]*>r1a-WyJFM8yL/)
  assert.match(html, /E2_2-BODEGA-STAGING-FIXTURE-CLIENTE-GATE-F/)
  assert.match(html, /efectivo sin turno/)
  assert.match(html, /Recibido/)
  assert.match(html, /Cambio/)
  assert.match(html, /5\.000/)
})
