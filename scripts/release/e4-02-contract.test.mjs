import test from "node:test";
import assert from "node:assert/strict";
import {
  E4_02_FOLLOW_UP_IDS,
  E4_02_PENDING_GATES,
  E4_02_REQUIRED_CI_COMMANDS,
  validarContratoE4_02,
} from "./e4-02-contract.mjs";

test("E4.2 conserva las suites core y los seis gates externos", () => {
  assert.equal(E4_02_REQUIRED_CI_COMMANDS.length, 11);
  assert.equal(E4_02_PENDING_GATES.length, 6);
  assert.equal(new Set(E4_02_PENDING_GATES.map((gate) => gate.id)).size, 6);
});

test("E4.2 contrato válido exige registrar seguimientos técnicos", () => {
  const ci = E4_02_REQUIRED_CI_COMMANDS.join("\n");
  assert.equal(
    validarContratoE4_02({ ci, gates: E4_02_PENDING_GATES, followUpIds: E4_02_FOLLOW_UP_IDS }),
    true,
  );
});

test("E4.2 rechaza una suite core ausente", () => {
  const ci = E4_02_REQUIRED_CI_COMMANDS.filter((command) => command !== "npm run e2e:r1a").join("\n");
  assert.equal(
    validarContratoE4_02({ ci, gates: E4_02_PENDING_GATES, followUpIds: E4_02_FOLLOW_UP_IDS }),
    false,
  );
});
