import assert from "node:assert/strict";
import test from "node:test";
import { validarEntradaCompra } from "./compra-input-validation";

test("acepta líneas de compra con cantidades y costos COP enteros seguros", () => {
  assert.equal(validarEntradaCompra([
    { cantidad: 2, costoUnitario: 300 },
    { cantidad: 3, costoUnitario: 500 },
  ]), null);
});

test("rechaza cantidades fraccionarias que el ledger de inventario no puede aplicar", () => {
  assert.equal(validarEntradaCompra([{ cantidad: 1.5, costoUnitario: 300 }]), "CANTIDAD_INVALIDA");
});

test("rechaza cantidades fuera del rango entero seguro", () => {
  assert.equal(validarEntradaCompra([{ cantidad: Number.MAX_SAFE_INTEGER + 1, costoUnitario: 300 }]), "CANTIDAD_INVALIDA");
});

test("rechaza cantidades cero o negativas", () => {
  assert.deepEqual(
    [0, -1].map((cantidad) => validarEntradaCompra([{ cantidad, costoUnitario: 300 }])),
    ["CANTIDAD_INVALIDA", "CANTIDAD_INVALIDA"],
  );
});

test("rechaza costos unitarios fraccionarios que el servidor rechazaría", () => {
  assert.equal(validarEntradaCompra([{ cantidad: 1, costoUnitario: 300.5 }]), "COSTO_INVALIDO");
});

test("rechaza costos unitarios fuera del rango entero seguro", () => {
  assert.equal(validarEntradaCompra([{ cantidad: 1, costoUnitario: Number.MAX_SAFE_INTEGER + 1 }]), "COSTO_INVALIDO");
});

test("rechaza costos unitarios cero o negativos", () => {
  assert.deepEqual(
    [0, -1].map((costoUnitario) => validarEntradaCompra([{ cantidad: 1, costoUnitario }])),
    ["COSTO_INVALIDO", "COSTO_INVALIDO"],
  );
});

test("rechaza productos cantidad por costo cuyo subtotal excede el entero seguro", () => {
  assert.equal(validarEntradaCompra([{ cantidad: Number.MAX_SAFE_INTEGER, costoUnitario: 2 }]), "TOTAL_COMPRA_INVALIDO");
});

test("rechaza compras cuyo total agregado excede el entero seguro", () => {
  assert.equal(validarEntradaCompra([
    { cantidad: Number.MAX_SAFE_INTEGER, costoUnitario: 1 },
    { cantidad: 1, costoUnitario: 1 },
  ]), "TOTAL_COMPRA_INVALIDO");
});

test("rechaza una lista vacía de líneas", () => {
  assert.equal(validarEntradaCompra([]), "ITEMS_INVALIDOS");
});
