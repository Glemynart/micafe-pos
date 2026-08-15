import { writeFile } from "node:fs/promises";
import {
  describeRecoveryBackup,
  getRecoveryDatabase,
  getRecoveryDocument,
} from "./recovery-restore-api";
import {
  verificarRecovery,
  type RecoveryVerificationDocument,
} from "./recovery-verify-core";

const argumentos = new Set([
  "--project", "--source-backup", "--destination-database", "--tenant",
  "--restore-requested-at", "--restore-ready-at", "--out",
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringField(value: unknown, field: string): string | null {
  const record = asRecord(value);
  return typeof record?.[field] === "string" ? record[field] as string : null;
}

function nestedStringField(value: unknown, parentField: string, field: string): string | null {
  const record = asRecord(asRecord(value)?.[parentField]);
  return typeof record?.[field] === "string" ? record[field] as string : null;
}

function doubleNestedStringField(
  value: unknown,
  firstParentField: string,
  secondParentField: string,
  field: string,
): string | null {
  const first = asRecord(asRecord(value)?.[firstParentField]);
  const second = asRecord(first?.[secondParentField]);
  return typeof second?.[field] === "string" ? second[field] as string : null;
}

function fieldsOf(value: unknown): Record<string, unknown> | undefined {
  const fields = asRecord(asRecord(value)?.fields);
  return fields ?? undefined;
}

function observation(
  path: string,
  response: { ok: boolean; body: unknown },
): RecoveryVerificationDocument {
  return { path, exists: response.ok, fields: fieldsOf(response.body) };
}

async function main(): Promise<void> {
  validarArgumentos();
  const accessToken = process.env.FIREBASE_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new Error("FIREBASE_ACCESS_TOKEN es obligatorio; nunca se obtiene ni se imprime aquí.");

  const projectId = exigirArgumento("--project");
  const sourceBackup = exigirArgumento("--source-backup");
  const destinationDatabase = exigirArgumento("--destination-database");
  const tenantId = exigirArgumento("--tenant");
  const restoreRequestedAt = exigirArgumento("--restore-requested-at");
  const restoreReadyAt = exigirArgumento("--restore-ready-at");
  const documentPaths = [
    ["empresas", tenantId],
    ["suscripciones", tenantId],
    ["configuraciones", tenantId],
    ["planes", "mvp_comercial"],
    ["planes/mvp_comercial", "versiones/2"],
  ] as const;

  const [backup, database, ...documents] = await Promise.all([
    describeRecoveryBackup(sourceBackup, accessToken),
    getRecoveryDatabase(projectId, destinationDatabase, accessToken),
    ...documentPaths.flatMap(([collectionId, documentId]) => [
      getRecoveryDocument(projectId, "(default)", collectionId, documentId, accessToken),
      getRecoveryDocument(projectId, destinationDatabase, collectionId, documentId, accessToken),
    ]),
  ]);

  const sourceDocuments: RecoveryVerificationDocument[] = [];
  const destinationDocuments: RecoveryVerificationDocument[] = [];
  for (let index = 0; index < documentPaths.length; index += 1) {
    const path = `${documentPaths[index][0]}/${documentPaths[index][1]}`;
    sourceDocuments.push(observation(path, documents[index * 2]));
    destinationDocuments.push(observation(path, documents[index * 2 + 1]));
  }

  const result = verificarRecovery({
    projectId,
    sourceBackup,
    backupName: stringField(backup.body, "name"),
    backupState: stringField(backup.body, "state"),
    backupSnapshotTime: stringField(backup.body, "snapshotTime"),
    destinationDatabase,
    destinationDatabaseName: stringField(database.body, "name"),
    destinationLocation: stringField(database.body, "locationId"),
    destinationState: stringField(database.body, "state"),
    destinationSourceBackup: doubleNestedStringField(database.body, "sourceInfo", "backup", "backup"),
    destinationSourceProgress: nestedStringField(database.body, "sourceInfo", "progress"),
    tenantId,
    sourceDocuments,
    destinationDocuments,
    restoreRequestedAt,
    restoreReadyAt,
  });

  const output = {
    ...result,
    observedAt: new Date().toISOString(),
    projectId,
    tenantId,
    sourceBackup,
    destinationDatabase,
    backupHttpStatus: backup.status,
    destinationDatabaseHttpStatus: database.status,
    sourceDocumentHttpStatuses: documents.filter((_, index) => index % 2 === 0).map((_, index) => documents[index * 2]?.status ?? null),
    destinationDocumentHttpStatuses: documents.filter((_, index) => index % 2 === 1).map((_, index) => documents[index * 2 + 1]?.status ?? null),
  };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  const out = argumento("--out");
  if (out) await writeFile(out, serialized, "utf8");
  process.stdout.write(serialized);
  if (result.status !== "VERIFIED") process.exitCode = 2;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
