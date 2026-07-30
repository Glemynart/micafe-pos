import assert from "node:assert/strict";
import test from "node:test";
import * as superficiePublica from "../index";

test("R1-B: la entrada publicada expone todas las Callables financieras", () => {
  for (const nombre of [
    "cerrarTurnoOperativoV1",
    "registrarEgresoOperativoV1",
    "registrarMovimientoFinancieroV1",
    "trasladarEntreCuentasV1",
  ] as const) {
    assert.equal(typeof superficiePublica[nombre], "function", nombre);
  }
});
