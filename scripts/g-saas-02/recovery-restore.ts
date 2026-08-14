import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prepararRecoveryRestore } from "./recovery-restore-core";

const argumentos = new Set([
  "--project", "--source-backup", "--destination-database", "--confirm-destination", "--out",
]);

function argumento(nombre: string): string | undefined {
  const index = process.argv.indexOf(nombre);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function exigirArgumento(nombre: string): string {
  const value = argumento(nombre);
  if (!value) throw new Error(`${nombre} es obligatorio.`);
  return value;
}

function validarArgumentos(): void {
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (!argumentos.has(value)) throw new Error(`Argumento no permitido: ${value}`);
    index += 1;
  }
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
  const backupObservation = spawnSync(executable, [
    "firestore", "backups", "describe",
    `--project=${plan.projectId}`,
    `--location=${plan.location}`,
    `--backup=${plan.backupId}`,
    "--format=json",
    "--quiet",
  ], {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  if (backupObservation.status !== 0) {
    const evidence = {
      ...plan,
      startedAt,
      observedAt: new Date().toISOString(),
      status: "BACKUP_NOT_OBSERVED",
      backupDescribeExitCode: backupObservation.status,
      restoreInvoked: false,
      verificationRequired: false,
      note: "No se solicitó restore porque el backup no pudo observarse con gcloud.",
    };
    const out = argumento("--out");
    if (out) await writeFile(resolve(out), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    process.exitCode = 2;
    return;
  }
  const execution = spawnSync(executable, [...plan.command], {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  const evidence = {
    ...plan,
    startedAt,
    observedAt: new Date().toISOString(),
    status: execution.status === 0 ? "RESTORE_REQUESTED" : "RESTORE_COMMAND_FAILED",
    backupDescribeExitCode: backupObservation.status,
    restoreInvoked: true,
    commandExitCode: execution.status,
    verificationRequired: true,
    note: "La base destino debe verificarse por separado; no se declara restore exitoso solo por solicitarlo.",
  };
  const out = argumento("--out");
  if (out) await writeFile(resolve(out), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (execution.status !== 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
