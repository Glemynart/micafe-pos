import assert from "node:assert/strict";
import test from "node:test";
import { prepararRecoveryRestore } from "./recovery-restore-core";

const sourceBackup = "projects/micafe-pos/locations/southamerica-east1/backups/backup-2026-08-14";

test("prepara restore aislado y conserva intacta la base origen", () => {
  const plan = prepararRecoveryRestore({
    projectId: "micafe-pos",
    sourceBackup,
    destinationDatabase: "gsaas02-recovery-20260814",
  });

  assert.equal(plan.productionWrites, true);
  assert.equal(plan.sourceUntouched, true);
  assert.equal(plan.applicationCutover, false);
  assert.equal(plan.backupId, "backup-2026-08-14");
  assert.equal(plan.destinationDatabase, "gsaas02-recovery-20260814");
  assert.deepEqual(plan.command, [
    "firestore", "databases", "restore",
    "--project=micafe-pos",
    `--source-backup=${sourceBackup}`,
    "--destination-database=gsaas02-recovery-20260814",
    "--quiet",
  ]);
});

test("rechaza restore sobre la base por defecto", () => {
  assert.throws(
    () => prepararRecoveryRestore({ projectId: "micafe-pos", sourceBackup, destinationDatabase: "(default)" }),
    /Nunca se permite restaurar/,
  );
});

test("rechaza backup de otro proyecto o ubicación", () => {
  assert.throws(
    () => prepararRecoveryRestore({
      projectId: "micafe-pos",
      sourceBackup: "projects/otro/locations/southamerica-east1/backups/backup-1",
      destinationDatabase: "gsaas02-recovery-20260814",
    }),
    /no pertenece al proyecto/,
  );
  assert.throws(
    () => prepararRecoveryRestore({
      projectId: "micafe-pos",
      sourceBackup: "projects/micafe-pos/locations/us-central1/backups/backup-1",
      destinationDatabase: "gsaas02-recovery-20260814",
    }),
    /no está en southamerica-east1/,
  );
});

test("rechaza destinos fuera del prefijo aislado o identificadores inválidos", () => {
  assert.throws(
    () => prepararRecoveryRestore({ projectId: "micafe-pos", sourceBackup, destinationDatabase: "restore-test" }),
    /prefijo aislado/,
  );
  assert.throws(
    () => prepararRecoveryRestore({ projectId: "micafe-pos", sourceBackup, destinationDatabase: `gsaas02-recovery-${"a".repeat(64)}` }),
    /reglas de Firestore/,
  );
});
