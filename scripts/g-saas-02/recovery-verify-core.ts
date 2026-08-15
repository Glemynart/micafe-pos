import { createHash } from "node:crypto";

export const RECOVERY_VERIFY_PROJECT = "micafe-pos" as const;
export const RECOVERY_VERIFY_LOCATION = "southamerica-east1" as const;
export const RECOVERY_VERIFY_DATABASE_PREFIX = "gsaas02-recovery-" as const;
export const RECOVERY_MAX_RPO_HOURS = 24;
export const RECOVERY_MAX_RTO_HOURS = 4;

export type RecoveryVerificationDocument = {
  path: string;
  exists: boolean;
  fields?: Record<string, unknown>;
};

export type RecoveryVerificationInput = {
  projectId: string;
  sourceBackup: string;
  backupName?: string | null;
  backupState?: string | null;
  backupSnapshotTime?: string | null;
  destinationDatabase: string;
  destinationDatabaseName?: string | null;
  destinationLocation?: string | null;
  destinationState?: string | null;
  destinationSourceBackup?: string | null;
  destinationSourceProgress?: string | null;
  tenantId: string;
  sourceDocuments: RecoveryVerificationDocument[];
  destinationDocuments: RecoveryVerificationDocument[];
  restoreRequestedAt: string;
  restoreReadyAt: string;
};

export type RecoveryVerificationFinding = {
  code: string;
  severity: "PASS" | "BLOCKER";
  message: string;
};

export type RecoveryVerificationResult = {
  contract: "G-SAAS-02-RECOVERY-VERIFICATION";
  status: "VERIFIED" | "BLOCKED";
  productionWrites: false;
  sourceUntouched: true;
  applicationCutover: false;
  destinationIsolated: boolean;
  integrityVerified: boolean;
  rpoHours: number | null;
  rtoHours: number | null;
  findings: RecoveryVerificationFinding[];
};

function agregar(
  findings: RecoveryVerificationFinding[],
  code: string,
  severity: RecoveryVerificationFinding["severity"],
  message: string,
): void {
  findings.push({ code, severity, message });
}

function esBackup(input: string): boolean {
  return /^projects\/[^/]+\/locations\/[^/]+\/backups\/[^/]+$/.test(input);
}

function horasEntre(inicio: string, fin: string): number | null {
  const inicioMs = Date.parse(inicio);
  const finMs = Date.parse(fin);
  if (!Number.isFinite(inicioMs) || !Number.isFinite(finMs) || finMs < inicioMs) return null;
  return (finMs - inicioMs) / 3_600_000;
}

function ordenar(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordenar);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, ordenar(nested)]),
  );
}

export function huellaCampos(fields: Record<string, unknown> | undefined): string {
  return createHash("sha256")
    .update(JSON.stringify(ordenar(fields ?? {})))
    .digest("hex");
}

function compararDocumentos(
  source: RecoveryVerificationDocument[],
  destination: RecoveryVerificationDocument[],
): { ok: boolean; missing: string[]; mismatched: string[] } {
  const destinationByPath = new Map(destination.map((document) => [document.path, document]));
  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const sourceDocument of source) {
    const destinationDocument = destinationByPath.get(sourceDocument.path);
    if (!sourceDocument.exists || !destinationDocument?.exists) {
      missing.push(sourceDocument.path);
      continue;
    }
    if (huellaCampos(sourceDocument.fields) !== huellaCampos(destinationDocument.fields)) {
      mismatched.push(sourceDocument.path);
    }
  }
  return { ok: missing.length === 0 && mismatched.length === 0, missing, mismatched };
}

export function verificarRecovery(input: RecoveryVerificationInput): RecoveryVerificationResult {
  const findings: RecoveryVerificationFinding[] = [];
  const source = /^projects\/([^/]+)\/locations\/([^/]+)\/backups\/([^/]+)$/.exec(input.sourceBackup);
  const expectedDestinationName = `projects/${RECOVERY_VERIFY_PROJECT}/databases/${input.destinationDatabase}`;
  const destinationIsolated = input.destinationDatabase !== "(default)"
    && input.destinationDatabase.startsWith(RECOVERY_VERIFY_DATABASE_PREFIX)
    && input.destinationDatabase !== "(default)";

  if (input.projectId === RECOVERY_VERIFY_PROJECT && source?.[1] === RECOVERY_VERIFY_PROJECT) {
    agregar(findings, "PROJECT_CONFIRMED", "PASS", "El proyecto y el backup pertenecen a micafe-pos.");
  } else {
    agregar(findings, "PROJECT_INVALID", "BLOCKER", "El proyecto o el backup no coincide con micafe-pos.");
  }

  if (source?.[2] === RECOVERY_VERIFY_LOCATION) {
    agregar(findings, "BACKUP_LOCATION_CONFIRMED", "PASS", "El backup está en southamerica-east1.");
  } else {
    agregar(findings, "BACKUP_LOCATION_INVALID", "BLOCKER", "El backup no está en southamerica-east1.");
  }

  if (input.backupName === input.sourceBackup && input.backupState === "READY") {
    agregar(findings, "BACKUP_READY_OBSERVED", "PASS", "El backup completo y listo fue observado mediante la API de Firestore.");
  } else {
    agregar(findings, "BACKUP_NOT_READY", "BLOCKER", "El backup no existe, no coincide o no está en estado READY.");
  }

  if (destinationIsolated) {
    agregar(findings, "DESTINATION_ISOLATED", "PASS", "El destino usa el prefijo aislado aprobado y no es (default).");
  } else {
    agregar(findings, "DESTINATION_NOT_ISOLATED", "BLOCKER", "El destino no cumple el aislamiento aprobado.");
  }

  const destinationStateReady = input.destinationState === "READY" || input.destinationState === "ACTIVE";
  const destinationRestoreCompleted = input.destinationSourceBackup === input.sourceBackup
    && input.destinationSourceProgress === "COMPLETED";
  if (
    input.destinationDatabaseName === expectedDestinationName
    && input.destinationLocation === RECOVERY_VERIFY_LOCATION
    && (destinationStateReady || destinationRestoreCompleted)
  ) {
    agregar(findings, "DESTINATION_READY_OBSERVED", "PASS", "La base restaurada está lista en la ubicación aprobada.");
  } else {
    agregar(findings, "DESTINATION_NOT_READY", "BLOCKER", "La base restaurada no está lista, no coincide o está en otra ubicación.");
  }

  const documentComparison = compararDocumentos(input.sourceDocuments, input.destinationDocuments);
  if (documentComparison.ok) {
    agregar(findings, "INTEGRITY_MINIMUM_CONFIRMED", "PASS", "Los documentos mínimos del tenant coinciden por huella entre origen y destino.");
  } else {
    agregar(
      findings,
      "INTEGRITY_MINIMUM_MISSING",
      "BLOCKER",
      `La integridad mínima no coincide; faltantes=${documentComparison.missing.length}, divergencias=${documentComparison.mismatched.length}.`,
    );
  }

  const rpoHours = input.backupSnapshotTime ? horasEntre(input.backupSnapshotTime, input.restoreRequestedAt) : null;
  if (rpoHours !== null && rpoHours <= RECOVERY_MAX_RPO_HOURS) {
    agregar(findings, "RPO_WITHIN_TARGET", "PASS", `El RPO observado es ${rpoHours.toFixed(3)} horas.`);
  } else {
    agregar(findings, "RPO_OUTSIDE_TARGET", "BLOCKER", "El RPO no pudo medirse o supera 24 horas.");
  }

  const rtoHours = horasEntre(input.restoreRequestedAt, input.restoreReadyAt);
  if (rtoHours !== null && rtoHours <= RECOVERY_MAX_RTO_HOURS) {
    agregar(findings, "RTO_WITHIN_TARGET", "PASS", `El RTO observado es ${rtoHours.toFixed(3)} horas.`);
  } else {
    agregar(findings, "RTO_OUTSIDE_TARGET", "BLOCKER", "El RTO no pudo medirse o supera 4 horas.");
  }

  const hasBlocker = findings.some((finding) => finding.severity === "BLOCKER");
  return {
    contract: "G-SAAS-02-RECOVERY-VERIFICATION",
    status: hasBlocker ? "BLOCKED" : "VERIFIED",
    productionWrites: false,
    sourceUntouched: true,
    applicationCutover: false,
    destinationIsolated,
    integrityVerified: documentComparison.ok,
    rpoHours,
    rtoHours,
    findings,
  };
}
