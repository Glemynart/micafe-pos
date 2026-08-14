export const RECOVERY_PROJECT = "micafe-pos" as const;
export const RECOVERY_LOCATION = "southamerica-east1" as const;
export const RECOVERY_DATABASE_PREFIX = "gsaas02-recovery-" as const;

export type RecoveryRestoreInput = {
  projectId: string;
  sourceBackup: string;
  destinationDatabase: string;
};

export type RecoveryRestorePlan = {
  contract: "G-SAAS-02-RECOVERY-RESTORE";
  projectId: typeof RECOVERY_PROJECT;
  location: typeof RECOVERY_LOCATION;
  backupId: string;
  sourceBackup: string;
  destinationDatabase: string;
  command: readonly string[];
  productionWrites: true;
  sourceUntouched: true;
  applicationCutover: false;
  rollback: "ISOLATE_AND_REMOVE_DESTINATION_AFTER_EVIDENCE";
};

function exigir(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function esDatabaseId(value: string): boolean {
  return value.length >= 4
    && value.length <= 63
    && /^[a-z][a-z0-9-]*[a-z0-9]$/.test(value)
    && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function prepararRecoveryRestore(input: RecoveryRestoreInput): RecoveryRestorePlan {
  exigir(input.projectId === RECOVERY_PROJECT, "El restore solo permite el proyecto micafe-pos.");

  const source = /^projects\/([^/]+)\/locations\/([^/]+)\/backups\/([^/]+)$/.exec(input.sourceBackup);
  exigir(Boolean(source), "sourceBackup debe ser un recurso completo de backup de Firestore.");
  exigir(source?.[1] === RECOVERY_PROJECT, "El backup no pertenece al proyecto aprobado.");
  exigir(source?.[2] === RECOVERY_LOCATION, "El backup no está en southamerica-east1.");

  exigir(input.destinationDatabase !== "(default)", "Nunca se permite restaurar sobre (default).");
  exigir(input.destinationDatabase.startsWith(RECOVERY_DATABASE_PREFIX), "El destino debe usar el prefijo aislado aprobado.");
  exigir(esDatabaseId(input.destinationDatabase), "El identificador de destino no cumple las reglas de Firestore.");

  const command = [
    "firestore", "databases", "restore",
    `--project=${RECOVERY_PROJECT}`,
    `--source-backup=${input.sourceBackup}`,
    `--destination-database=${input.destinationDatabase}`,
    "--quiet",
  ] as const;

  return {
    contract: "G-SAAS-02-RECOVERY-RESTORE",
    projectId: RECOVERY_PROJECT,
    location: RECOVERY_LOCATION,
    backupId: source?.[3] ?? "",
    sourceBackup: input.sourceBackup,
    destinationDatabase: input.destinationDatabase,
    command,
    productionWrites: true,
    sourceUntouched: true,
    applicationCutover: false,
    rollback: "ISOLATE_AND_REMOVE_DESTINATION_AFTER_EVIDENCE",
  };
}
