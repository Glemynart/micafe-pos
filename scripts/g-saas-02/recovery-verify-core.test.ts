import assert from "node:assert/strict";
import test from "node:test";
import { verificarRecovery } from "./recovery-verify-core";

const sourceBackup = "projects/micafe-pos/locations/southamerica-east1/backups/backup-2026-08-15";
const sourceFields = { estado: { stringValue: "activa" }, revision: { integerValue: "2" } };

function input(overrides: Record<string, unknown> = {}) {
  const documents = [
    { path: "empresas/tenant-1", exists: true, fields: sourceFields },
    { path: "suscripciones/tenant-1", exists: true, fields: { estado: { stringValue: "trialing" } } },
  ];
  return {
    projectId: "micafe-pos",
    sourceBackup,
    backupName: sourceBackup,
    backupState: "READY",
    backupSnapshotTime: "2026-08-15T12:00:00.000Z",
    destinationDatabase: "gsaas02-recovery-20260815",
    destinationDatabaseName: "projects/micafe-pos/databases/gsaas02-recovery-20260815",
    destinationLocation: "southamerica-east1",
    destinationState: "READY",
    tenantId: "tenant-1",
    sourceDocuments: documents,
    destinationDocuments: documents.map((document) => ({ ...document, fields: structuredClone(document.fields) })),
    restoreRequestedAt: "2026-08-15T12:30:00.000Z",
    restoreReadyAt: "2026-08-15T13:00:00.000Z",
    ...overrides,
  } as Parameters<typeof verificarRecovery>[0];
}

test("verifica integridad, aislamiento, RPO y RTO del restore", () => {
  const result = verificarRecovery(input());
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.productionWrites, false);
  assert.equal(result.sourceUntouched, true);
  assert.equal(result.applicationCutover, false);
  assert.equal(result.destinationIsolated, true);
  assert.equal(result.integrityVerified, true);
  assert.equal(result.rpoHours, 0.5);
  assert.equal(result.rtoHours, 0.5);
});

test("bloquea si la base restaurada no está aislada", () => {
  const result = verificarRecovery(input({
    destinationDatabase: "(default)",
    destinationDatabaseName: "projects/micafe-pos/databases/(default)",
  }));
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.findings.some((finding) => finding.code === "DESTINATION_NOT_ISOLATED"));
});

test("bloquea una copia antigua o una divergencia de integridad", () => {
  const result = verificarRecovery(input({
    backupSnapshotTime: "2026-08-14T00:00:00.000Z",
    destinationDocuments: [
      { path: "empresas/tenant-1", exists: true, fields: { estado: { stringValue: "suspendida" } } },
      { path: "suscripciones/tenant-1", exists: false },
    ],
  }));
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.findings.some((finding) => finding.code === "INTEGRITY_MINIMUM_MISSING"));
  assert.ok(result.findings.some((finding) => finding.code === "RPO_OUTSIDE_TARGET"));
});

test("acepta la señal oficial de restore completado cuando la API no expone state", () => {
  const result = verificarRecovery(input({
    destinationState: null,
    destinationSourceBackup: sourceBackup,
    destinationSourceProgress: "COMPLETED",
  }));
  assert.equal(result.status, "VERIFIED");
  assert.ok(result.findings.some((finding) => finding.code === "DESTINATION_READY_OBSERVED"));
});

test("bloquea sourceInfo completado si apunta a otro backup", () => {
  const result = verificarRecovery(input({
    destinationState: null,
    destinationSourceBackup: "projects/micafe-pos/locations/southamerica-east1/backups/otro-backup",
    destinationSourceProgress: "COMPLETED",
  }));
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.findings.some((finding) => finding.code === "DESTINATION_NOT_READY"));
});
