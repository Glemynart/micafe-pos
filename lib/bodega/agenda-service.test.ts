import assert from "node:assert/strict"
import test from "node:test"
import { construirProgramacionPedidoBodega, fechaLocalEnZonaHoraria } from "./ui-contract"

test("ADR-064 UI: conserva la fecha calendario de la zona horaria del tenant", () => {
  assert.equal(fechaLocalEnZonaHoraria(new Date("2026-10-08T03:30:00.000Z"), "America/Bogota"), "2026-10-07")
})

test("ADR-064 UI: construye pedido con fecha y franja sin aceptar precio ni stock del cliente", () => {
  const command = construirProgramacionPedidoBodega({
    clienteId: "cliente-1", fechaLocal: "2026-10-10", franja: { desde: "10:00", hasta: "12:00" },
    lineas: [{ productoId: "producto-1", presentacionId: "presentacion-1", cantidad: 2 }],
    generarId: (() => { let i = 0; return () => `id-${++i}` })(),
  })
  assert.deepEqual(command, {
    commandId: "bodega-agenda:id-1", idempotencyKey: "bodega-agenda:id-1", correlationId: "bodega-agenda:id-2", causationId: null,
    payload: { clienteId: "cliente-1", fechaLocal: "2026-10-10", franja: { desde: "10:00", hasta: "12:00" }, lineas: [{ productoId: "producto-1", presentacionId: "presentacion-1", cantidad: 2 }] },
  })
  assert.throws(() => construirProgramacionPedidoBodega({ clienteId: "cliente-1", fechaLocal: "2026-10-10", lineas: [{ productoId: "p", presentacionId: "x", cantidad: 0 }] }), /CANTIDAD_INVALIDA/)
  assert.throws(() => construirProgramacionPedidoBodega({ clienteId: "cliente-1", fechaLocal: "2026-10-10", franja: { desde: "12:00", hasta: "10:00" }, lineas: [{ productoId: "p", presentacionId: "x", cantidad: 1 }] }), /FRANJA_INVALIDA/)
})
