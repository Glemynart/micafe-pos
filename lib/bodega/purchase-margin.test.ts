import assert from "node:assert/strict";
import test from "node:test";
import { proyectarMargenCompraPorPresentaciones } from "./purchase-margin";

test("calcula utilidad y margen bruto por cada presentación activa", () => {
  const resultado = proyectarMargenCompraPorPresentaciones(1_000, [
    { id: "unidad", nombre: "Unidad", factorUnidadBase: 1, precioCOP: 1_800, activo: true },
    { id: "caja", nombre: "Caja", factorUnidadBase: 3, precioCOP: 4_000, activo: true },
  ]);

  assert.deepEqual(resultado, [
    {
      id: "unidad",
      nombre: "Unidad",
      factorUnidadBase: 1,
      precioCOP: 1_800,
      costoPresentacionCOP: 1_000,
      utilidadBrutaCOP: 800,
      margenBrutoPorcentaje: (800 / 1_800) * 100,
    },
    {
      id: "caja",
      nombre: "Caja",
      factorUnidadBase: 3,
      precioCOP: 4_000,
      costoPresentacionCOP: 3_000,
      utilidadBrutaCOP: 1_000,
      margenBrutoPorcentaje: 25,
    },
  ]);
});

test("no presenta margen como calculado mientras falta un costo de compra válido", () => {
  const resultado = proyectarMargenCompraPorPresentaciones(0, [
    { id: "unidad", nombre: "Unidad", factorUnidadBase: 1, precioCOP: 1_800, activo: true },
  ]);

  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].precioCOP, 1_800);
  assert.equal(resultado[0].costoPresentacionCOP, null);
  assert.equal(resultado[0].utilidadBrutaCOP, null);
  assert.equal(resultado[0].margenBrutoPorcentaje, null);
});

test("conserva una utilidad negativa cuando el costo supera el precio de venta", () => {
  const [resultado] = proyectarMargenCompraPorPresentaciones(2_000, [
    { id: "unidad", nombre: "Unidad", factorUnidadBase: 1, precioCOP: 1_500, activo: true },
  ]);

  assert.equal(resultado.utilidadBrutaCOP, -500);
  assert.equal(resultado.margenBrutoPorcentaje, (-500 / 1_500) * 100);
});

test("omite presentaciones inactivas o sin precio/factor entero positivo", () => {
  const resultado = proyectarMargenCompraPorPresentaciones(1_000, [
    { id: "inactiva", nombre: "Inactiva", factorUnidadBase: 1, precioCOP: 1_800, activo: false },
    { id: "sin-precio", nombre: "Sin precio", factorUnidadBase: 1, precioCOP: 0, activo: true },
    { id: "sin-factor", nombre: "Sin factor", factorUnidadBase: 0, precioCOP: 1_800, activo: true },
    { id: "decimal", nombre: "Factor decimal", factorUnidadBase: 1.5, precioCOP: 1_800, activo: true },
  ]);

  assert.deepEqual(resultado, []);
});

test("no calcula un costo total inseguro por desbordamiento", () => {
  const [resultado] = proyectarMargenCompraPorPresentaciones(Number.MAX_SAFE_INTEGER, [
    { id: "caja", nombre: "Caja", factorUnidadBase: 2, precioCOP: 1_800, activo: true },
  ]);

  assert.equal(resultado.precioCOP, 1_800);
  assert.equal(resultado.costoPresentacionCOP, null);
  assert.equal(resultado.utilidadBrutaCOP, null);
  assert.equal(resultado.margenBrutoPorcentaje, null);
});
