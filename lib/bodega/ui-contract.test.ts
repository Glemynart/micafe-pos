import assert from "node:assert/strict"
import test from "node:test"
import { construirConfirmacionVentaBodega, crearProtectorDobleEnvio, MAX_LINEAS_BODEGA, mensajeErrorBodega, resolverSuperficieBodega } from "./ui-contract"

test("U4 construye exactamente el envelope certificado sin campos de autoridad", () => {
  let secuencia = 0
  const envelope = construirConfirmacionVentaBodega({
    clienteId: " cliente ",
    lineas: [{ productoId: "producto", presentacionId: "caja", cantidad: 2 }],
    metodoPago: "transferencia",
    generarId: () => String(++secuencia),
  })
  assert.deepEqual(envelope, {
    commandId: "bodega-venta:1",
    idempotencyKey: "bodega-venta:1",
    correlationId: "bodega-venta:2",
    causationId: null,
    payload: { clienteId: "cliente", lineas: [{ productoId: "producto", presentacionId: "caja", cantidad: 2 }], metodoPago: "transferencia" },
  })
  const serializado = JSON.stringify(envelope)
  for (const prohibido of ["empresaId", "cajeroId", "turnoId", "cuenta", "precio", "costo", "factor", "subtotal", "total", "stock", "cantidadUnidadBase"]) {
    assert.equal(serializado.includes(prohibido), false)
  }
})

test("U4 limita líneas, cantidades y conserva mensajes operativos fail-closed", () => {
  assert.throws(() => construirConfirmacionVentaBodega({ clienteId: "c", lineas: [], metodoPago: "efectivo" }), /LINEAS_INVALIDAS/)
  assert.throws(() => construirConfirmacionVentaBodega({ clienteId: "c", lineas: Array.from({ length: MAX_LINEAS_BODEGA + 1 }, (_, i) => ({ productoId: `p${i}`, presentacionId: `x${i}`, cantidad: 1 })), metodoPago: "efectivo" }), /LINEAS_INVALIDAS/)
  assert.throws(() => construirConfirmacionVentaBodega({ clienteId: "c", lineas: [{ productoId: "p", presentacionId: "x", cantidad: 0 }], metodoPago: "efectivo" }), /CANTIDAD_INVALIDA/)
  assert.match(mensajeErrorBodega({ details: { code: "TURNO_CERRADO" } }), /turno/i)
  assert.match(mensajeErrorBodega({ details: { code: "STOCK_INSUFICIENTE" } }), /existencias/i)
  assert.match(mensajeErrorBodega({ details: { code: "ROLE_FORBIDDEN" } }), /permiso/i)
  assert.match(mensajeErrorBodega({ details: { code: "CLIENTE_INACTIVO" } }), /cliente/i)
  assert.match(mensajeErrorBodega({ details: { code: "PRESENTACION_INACTIVA" } }), /catálogo/i)
  assert.match(mensajeErrorBodega({ details: { code: "IDEMPOTENCY_CONFLICT" } }), /intento anterior/i)
  assert.match(mensajeErrorBodega({ code: "functions/unavailable" }), /Reintenta/i)
})

test("U4 separa vertical y roles sin convertir la UI en autoridad", () => {
  assert.equal(resolverSuperficieBodega("BODEGA_MVP1", "vendedor", "POS"), "VENDEDOR")
  assert.equal(resolverSuperficieBodega("BODEGA_MVP1", "admin", "POS"), "ADMIN")
  assert.equal(resolverSuperficieBodega("BODEGA_MVP1", "supervisor", "POS"), "DENEGADA")
  assert.equal(resolverSuperficieBodega("BODEGA_MVP1", "admin", "ADMIN"), "ADMIN")
  assert.equal(resolverSuperficieBodega("BODEGA_MVP1", "vendedor", "ADMIN"), "DENEGADA")
  assert.equal(resolverSuperficieBodega("GENERAL", "vendedor", "POS"), "LEGACY")
  assert.equal(resolverSuperficieBodega(null, null, "POS"), "DENEGADA")
})

test("U4 colapsa doble submit concurrente en una sola ejecución", async () => {
  const guard = crearProtectorDobleEnvio()
  let llamadas = 0
  let resolver!: (value: string) => void
  const operacion = () => { llamadas += 1; return new Promise<string>(resolve => { resolver = resolve }) }
  const a = guard.ejecutar(operacion)
  const b = guard.ejecutar(operacion)
  assert.equal(llamadas, 1)
  assert.equal(guard.activo, true)
  resolver("ok")
  assert.deepEqual(await Promise.all([a, b]), ["ok", "ok"])
  assert.equal(guard.activo, false)
})
