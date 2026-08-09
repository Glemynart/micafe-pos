import assert from "node:assert/strict";
import test from "node:test";
import { classifyFiles } from "./changed-scope.mjs";

test("un cambio exclusivamente documental no ejecuta el perfil funcional", () => {
  const scope = classifyFiles(["docs/governance/CI-RELEASE-GATE.md", "ADR-SAAS-026-cierre-controlado-eventos-legacy.md"]);
  assert.equal(scope.documentationOnly, true);
  assert.equal(scope.runCore, false);
});

test("un cambio de Rules activa core y las certificaciones tenant-aware afectadas", () => {
  const scope = classifyFiles(["firestore.rules"]);
  assert.equal(scope.documentationOnly, false);
  assert.equal(scope.runCore, true);
  assert.equal(scope.p001, true);
  assert.equal(scope.p006, true);
  assert.equal(scope.p102, true);
  assert.equal(scope.p104, true);
  assert.equal(scope.b2, true);
});

test("un cambio de B3 no activa certificaciones de producto no relacionadas", () => {
  const scope = classifyFiles(["scripts/b3/eventos-legacy-inventory.ts"]);
  assert.equal(scope.b3, true);
  assert.equal(scope.p001, true);
  assert.equal(scope.p006, false);
  assert.equal(scope.p102, false);
  assert.equal(scope.p104, false);
});

test("un archivo desconocido usa el fallback seguro", () => {
  const scope = classifyFiles(["new-runtime-surface.ts"]);
  assert.equal(scope.runCore, true);
  assert.equal(scope.p001, true);
});
