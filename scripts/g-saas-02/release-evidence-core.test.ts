import assert from "node:assert/strict";
import test from "node:test";
import { evaluarReleaseEvidence, type ReleaseEvidenceInput } from "./release-evidence-core";

const SHA = "a".repeat(40);

function input(overrides: Partial<ReleaseEvidenceInput> = {}): ReleaseEvidenceInput {
  return {
    targetSha: SHA,
    originMainSha: SHA,
    ci: { runId: "123", headSha: SHA, status: "completed", conclusion: "success" },
    vercel: { state: "success", targetUrl: "https://vercel.example/deploy" },
    functions: { count: 2, activeCount: 2, runtimes: ["nodejs22"], hashes: ["f".repeat(40)], hashCounts: { ["f".repeat(40)]: 2 } },
    external: {
      rules: { reference: "rules://evidence", independentlyVerified: true },
      storage: { reference: "storage://evidence", independentlyVerified: true },
      smoke: { reference: "smoke://evidence", independentlyVerified: true },
      recovery: { reference: "recovery://evidence", independentlyVerified: true },
    },
    ...overrides,
  };
}

test("release evidence completa solo cuando todos los gates son independientes", () => {
  const result = evaluarReleaseEvidence(input());
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.productionWrites, false);
  assert.equal(result.automatic.ciGreen, true);
  assert.equal(result.automatic.functionsHash, "f".repeat(40));
});

test("hashes múltiples de Functions quedan registrados para reconciliación", () => {
  const result = evaluarReleaseEvidence(input({
    functions: { count: 3, activeCount: 3, runtimes: ["nodejs22"], hashes: ["f".repeat(40), "e".repeat(40)], hashCounts: { ["f".repeat(40)]: 2, ["e".repeat(40)]: 1 } },
  }));
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.automatic.functionsUniform, false);
  assert.equal(result.checks.find((check) => check.id === "FUNCTIONS_HASH_DISTRIBUTION")?.status, "PASS");
  assert.equal(result.checks.find((check) => check.id === "FUNCTIONS_HASH_RECONCILIATION")?.status, "FOLLOW_UP");
});

test("una referencia declarada no se convierte en atestación independiente", () => {
  const result = evaluarReleaseEvidence(input({
    external: {
      rules: { reference: "rules://declared-only" },
      storage: { reference: null },
      smoke: { reference: "smoke://declared-only" },
      recovery: { reference: "recovery://declared-only" },
    },
  }));
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.external.rules, "DECLARED_NOT_VERIFIED");
  assert.equal(result.external.storage, "MISSING");
});

test("fallo de colección queda distinguido de un gate pendiente", () => {
  const result = evaluarReleaseEvidence(input({ collectionErrors: ["gh api no disponible"] }));
  assert.equal(result.status, "COLLECTION_ERROR");
  assert.equal(result.checks.at(-1)?.status, "FOLLOW_UP");
});
