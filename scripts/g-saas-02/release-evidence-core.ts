export type ReleaseEvidenceStatus = "PASS" | "FOLLOW_UP" | "MISSING" | "DECLARED_NOT_VERIFIED" | "MISMATCH";

export interface CiObservation {
  runId: string;
  headSha: string;
  status: string;
  conclusion: string | null;
  url?: string | null;
}

export interface VercelObservation {
  state: string;
  targetUrl?: string | null;
  updatedAt?: string | null;
}

export interface FunctionsObservation {
  count: number;
  activeCount: number;
  runtimes: readonly string[];
  hashes: readonly string[];
  hashCounts: Readonly<Record<string, number>>;
}

export interface ExternalGateObservation {
  reference?: string | null;
  independentlyVerified?: boolean;
}

export interface RulesReleaseObservation {
  service: "cloud.firestore" | "firebase.storage";
  releaseName: string;
  rulesetName: string;
  updatedAt?: string | null;
  localFile: "firestore.rules" | "storage.rules";
  localSourceSha256: string;
  deployedSourceSha256: string;
  sourceMatches: boolean;
}

export interface RulesObservation {
  firestore: RulesReleaseObservation | null;
  storage: RulesReleaseObservation | null;
}

export interface RecoveryObservation {
  pitrEnabled: boolean;
  backupSchedules: number;
  backups: number;
  location?: string | null;
}

export interface ReleaseEvidenceInput {
  targetSha: string;
  originMainSha: string | null;
  ci: CiObservation | null;
  vercel: VercelObservation | null;
  functions: FunctionsObservation | null;
  rules?: RulesObservation | null;
  recovery?: RecoveryObservation | null;
  external: {
    rules: ExternalGateObservation;
    storage: ExternalGateObservation;
    smoke: ExternalGateObservation;
    recovery: ExternalGateObservation;
  };
  collectionErrors?: readonly string[];
}

export interface ReleaseEvidenceCheck {
  id: string;
  status: ReleaseEvidenceStatus;
  message: string;
}

export interface ReleaseEvidenceResult {
  contract: "G-SAAS-02-RELEASE-EVIDENCE";
  observedAt: string;
  targetSha: string;
  readOnly: true;
  productionWrites: false;
  status: "COMPLETE" | "INCOMPLETE" | "COLLECTION_ERROR";
  checks: readonly ReleaseEvidenceCheck[];
  automatic: {
    ciGreen: boolean;
    ci: CiObservation | null;
    vercelVerified: boolean;
    vercel: VercelObservation | null;
    functions: FunctionsObservation | null;
    functionsHash: string | null;
    functionsUniform: boolean;
    rules: RulesObservation | null;
    recovery: RecoveryObservation | null;
  };
  external: {
    rules: ReleaseEvidenceStatus;
    storage: ReleaseEvidenceStatus;
    smoke: ReleaseEvidenceStatus;
    recovery: ReleaseEvidenceStatus;
  };
  collectionErrors: readonly string[];
}

function isSha(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function externalStatus(gate: ExternalGateObservation): ReleaseEvidenceStatus {
  if (gate.independentlyVerified === true) return "PASS";
  if (gate.reference?.trim()) return "DECLARED_NOT_VERIFIED";
  return "MISSING";
}

function rulesStatus(
  observation: RulesReleaseObservation | null | undefined,
  fallback: ExternalGateObservation,
  automaticObservationPresent: boolean,
): ReleaseEvidenceStatus {
  if (observation) return observation.sourceMatches ? "PASS" : "MISMATCH";
  if (automaticObservationPresent) return "MISSING";
  return externalStatus(fallback);
}

function rulesMessage(
  name: "Rules" | "Storage",
  status: ReleaseEvidenceStatus,
): string {
  if (status === "PASS") return `${name} desplegadas coinciden con la fuente versionada observada.`;
  if (status === "MISMATCH") return `${name} desplegadas no coinciden con la fuente versionada de origin/main.`;
  if (status === "DECLARED_NOT_VERIFIED") return `Existe una referencia declarada de ${name}, pero no fue verificada independientemente.`;
  return `Falta evidencia independiente de ${name}.`;
}

function addCheck(
  checks: ReleaseEvidenceCheck[],
  id: string,
  status: ReleaseEvidenceStatus,
  message: string,
): void {
  checks.push({ id, status, message });
}

export function evaluarReleaseEvidence(input: ReleaseEvidenceInput): ReleaseEvidenceResult {
  const checks: ReleaseEvidenceCheck[] = [];
  const targetShaValid = isSha(input.targetSha);
  const originMatches = targetShaValid && input.originMainSha === input.targetSha;

  addCheck(
    checks,
    "ORIGIN_MAIN_MATCH",
    originMatches ? "PASS" : "FOLLOW_UP",
    originMatches
      ? "origin/main coincide con el SHA objetivo."
      : "origin/main no coincide con el SHA objetivo o no fue observado.",
  );

  const ciGreen = input.ci !== null
    && input.ci.headSha === input.targetSha
    && input.ci.status === "completed"
    && input.ci.conclusion === "success";
  addCheck(
    checks,
    "CI_GREEN_FOR_TARGET",
    ciGreen ? "PASS" : "FOLLOW_UP",
    ciGreen
      ? "La ejecución CI completada y exitosa corresponde al SHA objetivo."
      : "No existe una ejecución CI exitosa y completada para el SHA objetivo.",
  );

  const vercelVerified = input.vercel?.state === "success";
  addCheck(
    checks,
    "VERCEL_STATUS_FOR_TARGET",
    vercelVerified ? "PASS" : "FOLLOW_UP",
    vercelVerified
      ? "GitHub reporta el deployment Vercel del SHA objetivo como exitoso."
      : "No existe un estado Vercel exitoso observado para el SHA objetivo.",
  );

  const functions = input.functions;
  const functionsActive = functions !== null
    && functions.count > 0
    && functions.activeCount === functions.count
    && functions.runtimes.length === 1
    && functions.runtimes[0] === "nodejs22";
  addCheck(
    checks,
    "FUNCTIONS_ACTIVE_NODE22",
    functionsActive ? "PASS" : "FOLLOW_UP",
    functionsActive
      ? "Todas las Functions observadas están activas y usan Node.js 22."
      : "El inventario de Functions está ausente, mezclado o no está completamente activo en Node.js 22.",
  );

  const functionHashes = functions?.hashes ?? [];
  const functionsUniform = functionHashes.length === 1;
  const functionsHashDistributionObserved = functionHashes.length > 0;
  addCheck(
    checks,
    "FUNCTIONS_HASH_DISTRIBUTION",
    functionsHashDistributionObserved ? "PASS" : "FOLLOW_UP",
    functionsHashDistributionObserved
      ? "La distribución de hashes desplegados de Functions fue observada y registrada."
      : "No fue posible observar la distribución de hashes desplegados de Functions.",
  );
  if (functionsHashDistributionObserved && !functionsUniform) {
    addCheck(
      checks,
      "FUNCTIONS_HASH_RECONCILIATION",
      "FOLLOW_UP",
      "Las Functions observadas tienen hashes múltiples; debe reconciliarse el release por Function antes de certificarlo.",
    );
  }

  const automaticRulesObservationPresent = input.rules !== null && input.rules !== undefined;
  const rulesStatusValue = rulesStatus(input.rules?.firestore, input.external.rules, automaticRulesObservationPresent);
  const storageStatusValue = rulesStatus(input.rules?.storage, input.external.storage, automaticRulesObservationPresent);
  const externalStatuses = {
    rules: rulesStatusValue,
    storage: storageStatusValue,
    smoke: externalStatus(input.external.smoke),
    recovery: externalStatus(input.external.recovery),
  } as const;
  addCheck(checks, "RULES_INDEPENDENT_ATTESTATION", rulesStatusValue, rulesMessage("Rules", rulesStatusValue));
  addCheck(checks, "STORAGE_INDEPENDENT_ATTESTATION", storageStatusValue, rulesMessage("Storage", storageStatusValue));
  for (const name of ["smoke", "recovery"] as const) {
    const status = externalStatuses[name];
    addCheck(
      checks,
      `${name.toUpperCase()}_INDEPENDENT_ATTESTATION`,
      status,
      status === "PASS"
        ? `Existe evidencia independiente de ${name}.`
        : status === "DECLARED_NOT_VERIFIED"
          ? `Existe una referencia declarada de ${name}, pero no fue verificada independientemente.`
          : `Falta evidencia independiente de ${name}.`,
    );
  }

  if (input.recovery) {
    const hasRecoveryPoint = input.recovery.pitrEnabled
      || input.recovery.backupSchedules > 0
      || input.recovery.backups > 0;
    addCheck(
      checks,
      "RECOVERY_POINT_OBSERVED",
      hasRecoveryPoint ? "PASS" : "MISSING",
      hasRecoveryPoint
        ? "Se observó al menos un mecanismo o punto de recuperación configurado."
        : "No se observó PITR, una programación de backups ni un backup disponible.",
    );
  }

  const collectionErrors = input.collectionErrors ?? [];
  for (const error of collectionErrors) {
    addCheck(checks, "READ_ONLY_COLLECTION", "FOLLOW_UP", error);
  }

  const allPass = checks.length > 0 && checks.every((check) => check.status === "PASS");
  const status = collectionErrors.length > 0
    ? "COLLECTION_ERROR"
    : allPass
      ? "COMPLETE"
      : "INCOMPLETE";

  return {
    contract: "G-SAAS-02-RELEASE-EVIDENCE",
    observedAt: new Date().toISOString(),
    targetSha: input.targetSha,
    readOnly: true,
    productionWrites: false,
    status,
    checks,
    automatic: {
      ciGreen,
      ci: input.ci,
      vercelVerified,
      vercel: input.vercel,
      functions: input.functions,
      functionsHash: functionsUniform ? functionHashes[0] ?? null : null,
      functionsUniform,
      rules: input.rules ?? null,
      recovery: input.recovery ?? null,
    },
    external: externalStatuses,
    collectionErrors,
  };
}
