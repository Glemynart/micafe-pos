import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prepararRecoveryRestore } from "./recovery-restore-core";
import {
  describeRecoveryBackup,
  requestRecoveryRestore,
} from "./recovery-restore-api";

const argumentos = new Set([
  "--project", "--source-backup", "--destination-database", "--confirm-destination", "--out",
]);

function argumento(nombre: string): string | undefined {
  const index = process.argv.indexOf(nombre);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function exigirArgumento(nombre: string): string {
  const value = argumento(nombre);
  if (!value) throw new Error(nombre + " es obligatorio.");
  return value;
}

function validarArgumentos(): void {
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (!argumentos.has(value)) throw new Error("Argumento no permitido: " + value);
    index += 1;
  }
}

function errorDeComando(value: { error?: Error; stderr?: string | Buffer }): string | undefined {
  if (value.error?.message) return value.error.message;
  const stderr = value.stderr?.toString().trim();
  return stderr || undefined;
}

async function escribirEvidencia(evidence: unknown): Promise<void> {
  const out = argumento("--out");
  if (out) await writeFile(resolve(out), JSON.stringify(evidence, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify(evidence, null, 2) + "\n");
}

async function main(): Promise<void> {
  validarArgumentos();
  const projectId = exigirArgumento("--project");
  const sourceBackup = exigirArgumento("--source-backup");
  const destinationDatabase = exigirArgumento("--destination-database");
  const confirmation = exigirArgumento("--confirm-destination");
  if (confirmation !== destinationDatabase) {
    throw new Error("--confirm-destination debe coincidir exactamente con el destino aislado.");
  }

  const plan = prepararRecoveryRestore({ projectId, sourceBackup, destinationDatabase });
  const startedAt = new Date().toISOString();
  const executable = process.platform === "win32" ? "gcloud.cmd" : "gcloud";
  const accessToken = process.env.FIREBASE_ACCESS_TOKEN?.trim() || undefined;
  const transport = accessToken ? "REST" : "GCLOUD";

  let backupObserved = false;
  let backupDescribeExitCode: number | null = null;
  let backupDescribeHttpStatus: number | null = null;
  let backupObservationError: string | undefined;

  if (accessToken) {
    const result = await describeRecoveryBackup(plan.sourceBackup, accessToken);
    backupObserved = result.ok;
    backupDescribeHttpStatus = result.status;
    backupObservationError = result.error;
  } else {
    const result = spawnSync(executable, [
      "firestore", "backups", "describe",
      "--project=" + plan.projectId,
      "--location=" + plan.location,
      "--backup=" + plan.backupId,
      "--format=json",
      "--quiet",
    ], {
      encoding: "utf8",
      windowsHide: true,
      shell: process.platform === "win32",
    });
    backupObserved = result.status === 0;
    backupDescribeExitCode = result.status;
    backupObservationError = errorDeComando(result);
  }

  if (!backupObserved) {
    const evidence = {
      ...plan,
      startedAt,
      observedAt: new Date().toISOString(),
      status: "BACKUP_NOT_OBSERVED",
      backupObservationTransport: transport,
      backupDescribeExitCode,
      backupDescribeHttpStatus,
      backupObservationError,
      restoreInvoked: false,
      verificationRequired: false,
      note: accessToken
        ? "No se solicitó restore porque el backup no pudo observarse mediante Firestore Admin REST."
        : "No se solicitó restore porque el backup no pudo observarse con gcloud.",
    };
    await escribirEvidencia(evidence);
    process.exitCode = 2;
    return;
  }

  let restoreSucceeded = false;
  let restoreCommandExitCode: number | null = null;
  let restoreHttpStatus: number | null = null;
  let restoreError: string | undefined;

  if (accessToken) {
    const result = await requestRecoveryRestore(
      plan.projectId,
      plan.sourceBackup,
      plan.destinationDatabase,
      accessToken,
    );
    restoreSucceeded = result.ok;
    restoreHttpStatus = result.status;
    restoreError = result.error;
  } else {
    const result = spawnSync(executable, [...plan.command], {
      encoding: "utf8",
      windowsHide: true,
      shell: process.platform === "win32",
    });
    restoreSucceeded = result.status === 0;
    restoreCommandExitCode = result.status;
    restoreError = errorDeComando(result);
  }

  const evidence = {
    ...plan,
    startedAt,
    observedAt: new Date().toISOString(),
    status: restoreSucceeded ? "RESTORE_REQUESTED" : "RESTORE_COMMAND_FAILED",
    backupObservationTransport: transport,
    backupDescribeExitCode,
    backupDescribeHttpStatus,
    restoreInvoked: true,
    restoreTransport: transport,
    restoreCommandExitCode,
    restoreHttpStatus,
    restoreError,
    verificationRequired: true,
    note: "La base destino debe verificarse por separado; no se declara restore exitoso solo por solicitarlo.",
  };
  await escribirEvidencia(evidence);
  if (!restoreSucceeded) process.exitCode = 2;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(message + "\n");
  process.exitCode = 1;
});
