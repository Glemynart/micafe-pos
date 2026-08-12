import test from "node:test";
import assert from "node:assert/strict";
import {
  E4_02_FOLLOW_UP_IDS,
  E4_02_PENDING_GATES,
  E4_02_REQUIRED_CI_COMMANDS,
  validarContratoE4_02,
} from "./e4-02-contract.mjs";

test("E4.2 conserva las suites core y clasifica las cinco condiciones posteriores", () => {
  assert.equal(E4_02_REQUIRED_CI_COMMANDS.length, 12);
  assert.equal(E4_02_PENDING_GATES.length, 5);
  assert.equal(new Set(E4_02_PENDING_GATES.map((gate) => gate.id)).size, 5);
  assert.deepEqual(E4_02_PENDING_GATES.map((gate) => gate.status), [
    "NON_BLOCKING",
    "CONDITIONAL",
    "BACKLOG",
    "BACKLOG",
    "BACKLOG",
  ]);
});

test("E4.2 contrato valido exige registrar seguimientos tecnicos", () => {
  const ci = E4_02_REQUIRED_CI_COMMANDS.join("\n");
  assert.equal(
    validarContratoE4_02({ ci, gates: E4_02_PENDING_GATES, followUpIds: E4_02_FOLLOW_UP_IDS }),
    true,
  );
});

test("E4.2 rechaza una suite core ausente", () => {
  const ci = E4_02_REQUIRED_CI_COMMANDS.filter((command) => command !== "npm run e2e:p1-04").join("\n");
  assert.equal(
    validarContratoE4_02({ ci, gates: E4_02_PENDING_GATES, followUpIds: E4_02_FOLLOW_UP_IDS }),
    false,
  );
});
