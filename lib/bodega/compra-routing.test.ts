import assert from "node:assert/strict";
import test from "node:test";
import {
  esCompraDeInsumos,
  resolverCallableCompra,
  sincronizarUnidadPredeterminadaEnItemsVacios,
  unidadMedidaCompraPredeterminada,
} from "./compra-routing";

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

test("las filas de compra Bodega vacías usan unidades, no gramos", () => {
  assert.equal(unidadMedidaCompraPredeterminada("BODEGA_MVP1", "Bodega principal"), "unidades");
  assert.equal(unidadMedidaCompraPredeterminada("BODEGA_MVP1", "Cafetería principal"), "unidades");
});

test("las compras de insumos de cafetería conservan gramos como unidad vacía", () => {
  assert.equal(unidadMedidaCompraPredeterminada("GENERAL", "Cafetería principal"), "g");
});

test("otros contextos de compra usan unidades como valor predeterminado", () => {
  assert.equal(unidadMedidaCompraPredeterminada("GENERAL", "Tienda principal"), "unidades");
  assert.equal(unidadMedidaCompraPredeterminada(null, null), "unidades");
});

test("una configuración que carga tarde actualiza solo las filas todavía vacías", () => {
  const items = [
    { insumoId: "", cantidad: 0, costoUnitario: 0, unidadMedida: "unidades" },
    { insumoId: "", cantidad: 2, costoUnitario: 0, unidadMedida: "unidades" },
    { insumoId: "producto-1", cantidad: 0, costoUnitario: 0, unidadMedida: "unidades" },
  ];

  assert.deepEqual(
    sincronizarUnidadPredeterminadaEnItemsVacios(items, "g"),
    [
      { ...items[0], unidadMedida: "g" },
      items[1],
      items[2],
    ],
  );
});
