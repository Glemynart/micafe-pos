import assert from "node:assert/strict";
import test from "node:test";
import { evaluarReleaseEvidence, type ReleaseEvidenceInput } from "./release-evidence-core";

const SHA = "a".repeat(40);
const APP_HOSTING_BUILD = "projects/micafe-pos/locations/us-central1/backends/micafe-pos/builds/build-123";
const APP_HOSTING_TRAFFIC_BUILD = "projects/882525811433/locations/us-central1/backends/micafe-pos/builds/build-123";

function input(overrides: Partial<ReleaseEvidenceInput> = {}): ReleaseEvidenceInput {
  return {
    projectId: "micafe-pos",
    targetSha: SHA,
    originMainSha: SHA,
    ci: { runId: "123", headSha: SHA, status: "completed", conclusion: "success" },
    appHosting: {
      projectId: "micafe-pos",
      locationId: "us-central1",
      backendId: "micafe-pos",
      backendName: "projects/micafe-pos/locations/us-central1/backends/micafe-pos",
      backendUri: "https://micafe-pos--micafe-pos.us-central1.hosted.app",
      backendReconciled: true,
      trafficReconciled: true,
      trafficUpdateTime: "2026-10-25T01:00:00Z",
      currentTrafficSplits: [{ build: APP_HOSTING_TRAFFIC_BUILD, canonicalBuild: APP_HOSTING_BUILD, percent: 100 }],
      builds: [{
        name: APP_HOSTING_BUILD,
        resourceName: APP_HOSTING_BUILD,
        state: "READY",
        sourceSha: SHA,
        imageDigest: "f".repeat(64),
        rolloutState: "SUCCEEDED",
      }],
    },
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
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.productionWrites, false);
  assert.equal(result.automatic.ciGreen, true);
  assert.equal(result.automatic.appHostingVerified, true);
  assert.equal(result.automatic.functionsHash, "f".repeat(40));
});

test("App Hosting requiere que el build servido proceda del SHA objetivo", () => {
  const result = evaluarReleaseEvidence(input({
    appHosting: {
      ...input().appHosting!,
      builds: [{ ...input().appHosting!.builds[0]!, sourceSha: "b".repeat(40) }],
    },
  }));
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.automatic.appHostingVerified, false);
  assert.equal(result.checks.find((check) => check.id === "APPHOSTING_SERVES_TARGET_SHA")?.status, "MISMATCH");
});

test("App Hosting no pasa si el tráfico no está reconciliado o no apunta al 100% a un único build", () => {
  const base = input().appHosting!;
  const result = evaluarReleaseEvidence(input({
    appHosting: {
      ...base,
      trafficReconciled: false,
      currentTrafficSplits: [
        { build: APP_HOSTING_TRAFFIC_BUILD, canonicalBuild: APP_HOSTING_BUILD, percent: 50 },
        { build: `${APP_HOSTING_TRAFFIC_BUILD}-other`, canonicalBuild: `${APP_HOSTING_BUILD}-other`, percent: 50 },
      ],
    },
  }));
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.checks.find((check) => check.id === "APPHOSTING_SERVES_TARGET_SHA")?.status, "FOLLOW_UP");
});

test("un proyecto o backend de staging nunca satisface el gate productivo", () => {
  const result = evaluarReleaseEvidence(input({
    projectId: "micafe-pos-staging",
    appHosting: {
      ...input().appHosting!,
      projectId: "micafe-pos-staging",
      backendName: "projects/micafe-pos-staging/locations/us-central1/backends/micafe-pos",
    },
  }));
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.checks.find((check) => check.id === "APPHOSTING_PRODUCTION_BACKEND_URI")?.status, "MISMATCH");
  assert.equal(result.checks.find((check) => check.id === "APPHOSTING_SERVES_TARGET_SHA")?.status, "MISMATCH");
});

test("App Hosting exige build READY y rollout SUCCEEDED", () => {
  const base = input().appHosting!;
  const result = evaluarReleaseEvidence(input({
    appHosting: {
      ...base,
      builds: [{ ...base.builds[0]!, state: "BUILDING", rolloutState: null }],
    },
  }));
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.checks.find((check) => check.id === "APPHOSTING_SERVES_TARGET_SHA")?.status, "FOLLOW_UP");
});

test("la URI de App Hosting debe ser HTTPS y parseable", () => {
  const base = input().appHosting!;
  const result = evaluarReleaseEvidence(input({
    appHosting: { ...base, backendUri: "https://" },
  }));
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.checks.find((check) => check.id === "APPHOSTING_PRODUCTION_BACKEND_URI")?.status, "FOLLOW_UP");
});

test("acepta el hostname principal que entrega App Hosting sin esquema", () => {
  const base = input().appHosting!;
  const result = evaluarReleaseEvidence(input({
    appHosting: { ...base, backendUri: "micafe-pos--micafe-pos.us-central1.hosted.app" },
  }));
  assert.equal(result.checks.find((check) => check.id === "APPHOSTING_PRODUCTION_BACKEND_URI")?.status, "PASS");
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

test("hashes múltiples quedan reconciliados cuando existe el mapa completo por Function", () => {
  const result = evaluarReleaseEvidence(input({
    functions: {
      count: 3,
      activeCount: 3,
      runtimes: ["nodejs22"],
      hashes: ["f".repeat(40), "e".repeat(40)],
      hashCounts: { ["f".repeat(40)]: 2, ["e".repeat(40)]: 1 },
      functionHashesByName: {
        primera: "f".repeat(40),
        segunda: "f".repeat(40),
        tercera: "e".repeat(40),
      },
    },
  }));
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.checks.find((check) => check.id === "FUNCTIONS_HASH_RECONCILIATION")?.status, "PASS");
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

test("Rules y Storage desplegadas con drift no se consideran evidencia independiente", () => {
  const result = evaluarReleaseEvidence(input({
    rules: {
      firestore: {
        service: "cloud.firestore",
        releaseName: "projects/micafe-pos/releases/cloud.firestore",
        rulesetName: "projects/micafe-pos/rulesets/firestore-old",
        localFile: "firestore.rules",
        localSourceSha256: "a".repeat(64),
        deployedSourceSha256: "b".repeat(64),
        sourceMatches: false,
      },
      storage: {
        service: "firebase.storage",
        releaseName: "projects/micafe-pos/releases/firebase.storage/bucket",
        rulesetName: "projects/micafe-pos/rulesets/storage-old",
        localFile: "storage.rules",
        localSourceSha256: "c".repeat(64),
        deployedSourceSha256: "d".repeat(64),
        sourceMatches: false,
      },
    },
  }));
  assert.equal(result.status, "INCOMPLETE");
  assert.equal(result.external.rules, "MISMATCH");
  assert.equal(result.external.storage, "MISMATCH");
  assert.match(result.checks.find((check) => check.id === "STORAGE_INDEPENDENT_ATTESTATION")?.message ?? "", /no coinciden/);
});

test("un punto de recovery observado no sustituye el ensayo de recuperación", () => {
  const result = evaluarReleaseEvidence(input({
    recovery: { pitrEnabled: true, backupSchedules: 0, backups: 0, location: "southamerica-east1" },
  }));
  assert.equal(result.checks.find((check) => check.id === "RECOVERY_POINT_OBSERVED")?.status, "PASS");
  assert.equal(result.external.recovery, "PASS");
});

test("una observación automática incompleta no se rellena con una referencia declarada", () => {
  const result = evaluarReleaseEvidence(input({
    rules: { firestore: null, storage: null },
    external: {
      rules: { reference: "rules://declared", independentlyVerified: true },
      storage: { reference: "storage://declared", independentlyVerified: true },
      smoke: { reference: "smoke://verified", independentlyVerified: true },
      recovery: { reference: "recovery://verified", independentlyVerified: true },
    },
  }));
  assert.equal(result.external.rules, "MISSING");
  assert.equal(result.external.storage, "MISSING");
});
