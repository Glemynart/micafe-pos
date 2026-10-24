import assert from "node:assert/strict";
import test from "node:test";
import { validarEntradaCompra } from "./compra-input-validation";

type TipoArticulo = "producto" | "insumo";
function lineaCompra(cantidad: number, costoUnitario: number, articuloId = "cafe", tipo: TipoArticulo = "producto") {
  return { articuloId, tipo, cantidad, costoUnitario };
}

test("acepta líneas de compra con cantidades y costos COP enteros seguros", () => {
  assert.equal(validarEntradaCompra([
    lineaCompra(2, 300),
    lineaCompra(3, 500, "azucar"),
  ]), null);
});

test("rechaza una cantidad fraccionaria que no se consolida en entero", () => {
  assert.equal(validarEntradaCompra([lineaCompra(1.5, 300)]), "CANTIDAD_INVALIDA");
});

test("preserva líneas fraccionarias que el backend consolida en cantidad y costo enteros", () => {
  assert.equal(validarEntradaCompra([
    lineaCompra(0.5, 300),
    lineaCompra(0.5, 300),
  ]), null);
});

test("rechaza cantidades finitas mayores al rango del subtotal COP seguro", () => {
  assert.equal(validarEntradaCompra([lineaCompra(Number.MAX_SAFE_INTEGER + 1, 1)]), "TOTAL_COMPRA_INVALIDO");
});

test("rechaza cantidades no finitas, cero o negativas", () => {
  assert.deepEqual(
    [Number.POSITIVE_INFINITY, 0, -1].map((cantidad) => validarEntradaCompra([lineaCompra(cantidad, 300)])),
    ["CANTIDAD_INVALIDA", "CANTIDAD_INVALIDA", "CANTIDAD_INVALIDA"],
  );
});

test("rechaza costos unitarios fraccionarios que el servidor rechazaría", () => {
  assert.equal(validarEntradaCompra([lineaCompra(1, 300.5)]), "COSTO_INVALIDO");
});

test("rechaza costos unitarios fuera del rango entero seguro", () => {
  assert.equal(validarEntradaCompra([lineaCompra(1, Number.MAX_SAFE_INTEGER + 1)]), "COSTO_INVALIDO");
});

test("rechaza costos unitarios cero o negativos", () => {
  assert.deepEqual(
    [0, -1].map((costoUnitario) => validarEntradaCompra([lineaCompra(1, costoUnitario)])),
    ["COSTO_INVALIDO", "COSTO_INVALIDO"],
  );
});

test("rechaza líneas del mismo artículo cuyo costo unitario consolidado es fraccionario", () => {
  assert.equal(validarEntradaCompra([
    lineaCompra(1, 100),
    lineaCompra(1, 101),
  ]), "COSTO_INVALIDO");
});

test("rechaza productos cantidad por costo cuyo subtotal excede el entero seguro", () => {
  assert.equal(validarEntradaCompra([lineaCompra(Number.MAX_SAFE_INTEGER, 2)]), "TOTAL_COMPRA_INVALIDO");
});

test("rechaza compras cuyo total agregado excede el entero seguro", () => {
  assert.equal(validarEntradaCompra([
    lineaCompra(Number.MAX_SAFE_INTEGER, 1),
    lineaCompra(1, 1, "azucar"),
  ]), "TOTAL_COMPRA_INVALIDO");
});

test("no consolida cantidades iguales que pertenecen a tipos de artículo distintos", () => {
  assert.equal(validarEntradaCompra([
    lineaCompra(0.5, 300, "cafe", "producto"),
    lineaCompra(0.5, 300, "cafe", "insumo"),
  ]), "CANTIDAD_INVALIDA");
});

test("rechaza una lista vacía de líneas", () => {
  assert.equal(validarEntradaCompra([]), "ITEMS_INVALIDOS");
});
