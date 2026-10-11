import assert from "node:assert/strict";
import test from "node:test";
import { construirPayloadCompra, obtenerComandoCompraPendiente } from "./compra-command";

const compra = {
  proveedor: "Proveedor de prueba",
  proveedorId: "proveedor-1",
  espacioId: "espacio-1",
  fechaCompra: "2026-10-11",
  cuentaClaveOperativa: "bancolombia",
  items: [
    { tipo: "producto" as const, itemId: "producto-1", cantidad: 2, costoUnitario: 300 },
  ],
};

test("reintentar el mismo borrador conserva el identificador idempotente", () => {
  const pendiente = obtenerComandoCompraPendiente(compra, "BODEGA_MVP1", undefined, () => "uuid-1");

  const reintento = obtenerComandoCompraPendiente(compra, "BODEGA_MVP1", pendiente, () => {
    throw new Error("no debe generar un comando nuevo para el mismo borrador");
  });

  assert.deepEqual(reintento, pendiente);
});

test("un cambio de contenido o vertical crea una identidad de comando nueva", () => {
  const pendiente = obtenerComandoCompraPendiente(compra, "BODEGA_MVP1", undefined, () => "uuid-1");
  const compraModificada = { ...compra, items: [{ ...compra.items[0], cantidad: 3 }] };

  const cambioContenido = obtenerComandoCompraPendiente(compraModificada, "BODEGA_MVP1", pendiente, () => "uuid-2");
  const cambioVertical = obtenerComandoCompraPendiente(compra, "GENERAL", pendiente, () => "uuid-3");

  assert.equal(cambioContenido.commandId, "compra:uuid-2");
  assert.equal(cambioVertical.commandId, "compra:uuid-3");
});

test("un comando completado permite registrar otra compra idéntica con una identidad nueva", () => {
  const primera = obtenerComandoCompraPendiente(compra, "BODEGA_MVP1", undefined, () => "uuid-1");
  const siguiente = obtenerComandoCompraPendiente(compra, "BODEGA_MVP1", undefined, () => "uuid-2");

  assert.notEqual(siguiente.commandId, primera.commandId);
});

test("el payload de compra solo contiene los campos de intención enviados al servidor", () => {
  assert.deepEqual(construirPayloadCompra(compra), {
    proveedor: "Proveedor de prueba",
    proveedorId: "proveedor-1",
    espacioId: "espacio-1",
    fechaCompra: "2026-10-11",
    cuentaClaveOperativa: "bancolombia",
    items: [{ tipo: "producto", articuloId: "producto-1", cantidad: 2, costoUnitario: 300 }],
  });
});
