import test from "node:test";
import assert from "node:assert/strict";
import {
  E4_01_PENDING_GATES,
  E4_01_STEP_DEFINITIONS,
  validarContratoE4_01,
  validarProyectoEmulador,
} from "./e4-01-contract.mjs";

test("E4.1 define exactamente los cinco cortes reutilizables del núcleo", () => {
  assert.equal(validarContratoE4_01(), true);
  assert.deepEqual(E4_01_STEP_DEFINITIONS.map((step) => step.id), ["P0-01", "P0-06", "P1-02", "P1-04", "P0-10"]);
});

test("E4.1 solo acepta proyectos de Emulator con el prefijo del corte", () => {
  for (const step of E4_01_STEP_DEFINITIONS) {
    assert.equal(validarProyectoEmulador(`${step.projectPrefix}e4-01`, step.projectPrefix), true);
    assert.equal(validarProyectoEmulador("micafe-pos", step.projectPrefix), false);
    assert.equal(validarProyectoEmulador(`${step.projectPrefix}PROD`, step.projectPrefix), false);
  }
});

test("E4.1 registra seis gates externos sin ejecutarlos", () => {
  assert.deepEqual(E4_01_PENDING_GATES.map((gate) => gate.id), [
    "P0-07/E3.1",
    "P0-08/E3.2",
    "P0-02/E1.2-P0-09",
    "P1-09",
    "P2-04",
    "P2-01",
  ]);
  assert.ok(E4_01_PENDING_GATES.every((gate) => gate.status === "PENDIENTE"));
});
