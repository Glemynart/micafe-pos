import assert from "node:assert/strict";
import test from "node:test";
import { ErrorFifoNevera, planificarConsumoFifoNevera, reconstruirCapasFifoNevera, type CapaFifoNevera } from "./nevera-fifo";

const layer = (id: string, sequence: number, qty: number, cost: number): CapaFifoNevera => ({
  id, empresaId: "empresa-a", productoId: "producto-a", catalogoId: "NEVERA",
  secuenciaArticulo: sequence, unidadesIniciales: qty, unidadesRestantes: qty, costoUnitarioCOP: cost,
});

test("FIFO consumes oldest layers and calculates exact COP across package quantities", () => {
  const result = planificarConsumoFifoNevera([layer("second", 2, 5, 1_300), layer("first", 1, 3, 1_000)], 6);
  assert.deepEqual(result, {
    consumos: [
      { capaId: "first", secuenciaArticulo: 1, cantidad: 3, costoUnitarioCOP: 1_000, costoTotalCOP: 3_000, unidadesRestantes: 0 },
      { capaId: "second", secuenciaArticulo: 2, cantidad: 3, costoUnitarioCOP: 1_300, costoTotalCOP: 3_900, unidadesRestantes: 2 },
    ],
    costoTotalCOP: 6_900,
  });
});

test("FIFO rejects insufficient stock, invalid costs and duplicate sequences", () => {
  assert.throws(() => planificarConsumoFifoNevera([layer("one", 1, 2, 500)], 3), (error: unknown) => error instanceof ErrorFifoNevera && error.codigo === "STOCK_FIFO_INSUFICIENTE");
  assert.throws(() => planificarConsumoFifoNevera([layer("one", 1, 2, 0)], 1), /CAPA_FIFO_INVALIDA/);
  assert.throws(() => planificarConsumoFifoNevera([layer("one", 1, 2, 500), layer("two", 1, 1, 600)], 1), /SECUENCIA_FIFO_DUPLICADA/);
});

test("opening reconstruction reproduces ledger balance and remaining FIFO valuation", () => {
  const result = reconstruirCapasFifoNevera([
    { id: "entrada-1", tipo: "ajuste_positivo", cantidad: 5, costoUnitario: 1_000, secuenciaArticulo: 1, saldoCantidadDespues: 5 },
    { id: "venta-1", tipo: "venta", cantidad: -2, costoUnitario: 0, secuenciaArticulo: 2, saldoCantidadDespues: 3 },
    { id: "entrada-2", tipo: "ajuste_positivo", cantidad: 4, costoUnitario: 1_200, secuenciaArticulo: 3, saldoCantidadDespues: 7 },
  ], 7, { empresaId: "empresa-a", productoId: "producto-a" });

  assert.equal(result.saldoReconstruido, 7);
  assert.equal(result.valorExistenciaCOP, 7_800);
  assert.deepEqual(result.capas.map(item => [item.id, item.unidadesRestantes]), [["entrada-1", 3], ["entrada-2", 4]]);
});

test("opening reconstruction fails closed on sequence gaps, invalid entry cost and mismatched stock", () => {
  const row = { id: "entrada-1", tipo: "ajuste_positivo", cantidad: 5, costoUnitario: 1_000, secuenciaArticulo: 1, saldoCantidadDespues: 5 };
  const identity = { empresaId: "empresa-a", productoId: "producto-a" };
  assert.throws(() => reconstruirCapasFifoNevera([{ ...row, secuenciaArticulo: 2 }], 5, identity), /SECUENCIA_LEDGER_FIFO_INCOMPLETA/);
  assert.throws(() => reconstruirCapasFifoNevera([{ ...row, costoUnitario: 0 }], 5, identity), /COSTO_ENTRADA_FIFO_INVALIDO/);
  assert.throws(() => reconstruirCapasFifoNevera([row], 4, identity), /STOCK_LEDGER_FIFO_DIFERENTE/);
});
