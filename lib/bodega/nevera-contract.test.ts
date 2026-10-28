import assert from "node:assert/strict"
import test from "node:test"
import { construirComandoAperturaProductoNevera, construirComandoVentaRetailNevera } from "./nevera-contract"

test("el comando retail conserva cantidades y método de pago sin enviar precios o tenant", () => {
  let sequence = 0
  const command = construirComandoVentaRetailNevera({
    lineas: [{ productoId: "producto-nevera", presentacionId: "unidad", cantidad: 2 }],
    metodoPago: "transferencia",
    generarId: () => String(++sequence),
  })
  assert.deepEqual(command, {
    commandId: "venta-retail-nevera:1",
    idempotencyKey: "venta-retail-nevera:1",
    correlationId: "venta-retail-nevera:2",
    causationId: null,
    payload: { lineas: [{ productoId: "producto-nevera", presentacionId: "unidad", cantidad: 2 }], metodoPago: "transferencia" },
  })
  const payload = JSON.stringify(command)
  for (const forbidden of ["empresaId", "precio", "costo", "subtotal", "stock", "turnoId", "clienteId"]) assert.equal(payload.includes(forbidden), false)
})

test("el envelope cash lleva solo efectivo recibido, sin cambio autoritativo", () => {
  const command = construirComandoVentaRetailNevera({
    lineas: [{ productoId: "p", presentacionId: "u", cantidad: 1 }],
    metodoPago: "efectivo",
    montoRecibidoCOP: 12_000,
    generarId: () => "cash",
  })
  assert.equal(command.payload.montoRecibidoCOP, 12_000)
  assert.equal(JSON.stringify(command).includes("cambioCOP"), false)
})

test("la apertura FIFO usa comando idempotente y solo envía el producto y la huella", () => {
  const ids = ["cmd-1", "corr-1"]
  const command = construirComandoAperturaProductoNevera("producto-a", "a".repeat(64), () => ids.shift()!)
  assert.equal(command.commandId, "apertura-nevera:producto-a:cmd-1")
  assert.equal(command.idempotencyKey, command.commandId)
  assert.equal(command.correlationId, "apertura-nevera:corr-1")
  assert.deepEqual(command.payload, { productoId: "producto-a", ledgerHash: "a".repeat(64) })
})
