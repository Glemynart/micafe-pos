import assert from "node:assert/strict";
import test from "node:test";
import { resolverCallableCompra } from "./compra-routing";

test("el vertical Bodega usa su callable aislada de compras", () => {
  assert.equal(resolverCallableCompra("BODEGA_MVP1"), "registrarCompraBodegaV1");
});

test("los tenants generales y legacy conservan el endpoint de compras actual", () => {
  assert.equal(resolverCallableCompra("GENERAL"), "registrarCompraOperativaV1");
  assert.equal(resolverCallableCompra(null), "registrarCompraOperativaV1");
});
