import assert from "node:assert/strict";
import test from "node:test";
import { esCompraDeInsumos, resolverCallableCompra } from "./compra-routing";

test("el vertical Bodega usa su callable aislada de compras", () => {
  assert.equal(resolverCallableCompra("BODEGA_MVP1"), "registrarCompraBodegaV1");
});

test("los tenants generales y legacy conservan el endpoint de compras actual", () => {
  assert.equal(resolverCallableCompra("GENERAL"), "registrarCompraOperativaV1");
  assert.equal(resolverCallableCompra(null), "registrarCompraOperativaV1");
});

test("Bodega siempre compra productos, aunque el espacio tenga 'cafetería' en su nombre", () => {
  assert.equal(esCompraDeInsumos("BODEGA_MVP1", "Cafetería principal"), false);
  assert.equal(esCompraDeInsumos("GENERAL", "Cafetería principal"), true);
});
