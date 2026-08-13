import assert from "node:assert/strict";
import test from "node:test";
import { reconciliarVencimientosComerciales } from "./scheduler";

function queryEmpty() {
  return { limit: () => ({ get: async () => ({ docs: [] }) }) };
}

test("el scheduler consulta Trials y periodos de relaciones contractuales", async () => {
  const estadosConsultados: string[] = [];
  const db = {
    collection: () => ({ where: () => queryEmpty() }),
    collectionGroup: (nombre: string) => ({
      where: (_campo: string, _operador: string, estado: string) => {
        assert.equal(nombre, "relaciones");
        estadosConsultados.push(estado);
        return queryEmpty();
      },
    }),
  };

  const resultado = await reconciliarVencimientosComerciales(db as never);

  assert.deepEqual(estadosConsultados, ["trialing", "active"]);
  assert.equal(resultado.relacionesProcesadas, 0);
});
