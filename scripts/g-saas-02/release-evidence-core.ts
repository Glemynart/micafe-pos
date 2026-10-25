export type ReleaseEvidenceStatus = "PASS" | "FOLLOW_UP" | "MISSING" | "DECLARED_NOT_VERIFIED" | "MISMATCH";

export interface CiObservation {
  runId: string;
  headSha: string;
  status: string;
  conclusion: string | null;
  url?: string | null;
}

export interface AppHostingTrafficSplitObservation {
  build: string;
  canonicalBuild: string | null;
  percent: number;
}

export interface AppHostingBuildObservation {
  name: string;
  resourceName: string;
  state: string;
  sourceSha: string | null;
  imageDigest: string | null;
  rolloutState: string | null;
}

export interface AppHostingObservation {
  projectId: string;
  locationId: string;
  backendId: string;
  backendName: string;
  backendUri: string | null;
  backendReconciled: boolean;
  trafficReconciled: boolean;
  trafficUpdateTime: string | null;
  currentTrafficSplits: readonly AppHostingTrafficSplitObservation[];
  builds: readonly AppHostingBuildObservation[];
}

export interface FunctionsObservation {
  count: number;
  activeCount: number;
  runtimes: readonly string[];
  hashes: readonly string[];
  hashCounts: Readonly<Record<string, number>>;
  functionHashesByName?: Readonly<Record<string, string>>;
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
  projectId: string;
  targetSha: string;
  originMainSha: string | null;
  ci: CiObservation | null;
  appHosting: AppHostingObservation | null;
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
  schemaVersion: 2;
  observedAt: string;
  projectId: string;
  targetSha: string;
  readOnly: true;
  productionWrites: false;
  status: "COMPLETE" | "INCOMPLETE" | "COLLECTION_ERROR";
  checks: readonly ReleaseEvidenceCheck[];
  automatic: {
    ciGreen: boolean;
    ci: CiObservation | null;
    appHostingVerified: boolean;
    appHosting: AppHostingObservation | null;
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

function isHttpsUri(value: string | null): boolean {
  if (!value) return false;
  try {
    const candidate = /^https:\/\//i.test(value) ? value : `https://${value}`;
    const uri = new URL(candidate);
    return uri.protocol === "https:"
      && uri.hostname.length > 0
      && uri.username.length === 0
      && uri.password.length === 0
      && uri.search.length === 0
      && uri.hash.length === 0
      && (uri.pathname === "/" || uri.pathname === "");
  } catch {
    return false;
  }
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

  const appHosting = input.appHosting;
  const appHostingTargetMatches = appHosting !== null
    && input.projectId === "micafe-pos"
    && appHosting.projectId === "micafe-pos"
    && appHosting.locationId === "us-central1"
    && appHosting.backendId === "micafe-pos"
    && appHosting.backendName === "projects/micafe-pos/locations/us-central1/backends/micafe-pos";
  const appHostingUriStatus: ReleaseEvidenceStatus = appHosting === null
    ? "MISSING"
    : !appHostingTargetMatches
      ? "MISMATCH"
      : appHosting.backendReconciled && isHttpsUri(appHosting.backendUri)
        ? "PASS"
        : "FOLLOW_UP";
  addCheck(
    checks,
    "APPHOSTING_PRODUCTION_BACKEND_URI",
    appHostingUriStatus,
    appHostingUriStatus === "PASS"
      ? "El backend productivo esperado de Firebase App Hosting existe, está reconciliado y expone su URI principal."
      : appHostingUriStatus === "MISMATCH"
        ? "La evidencia de App Hosting corresponde a otro proyecto, región o backend distinto del productivo aprobado."
        : appHostingUriStatus === "MISSING"
          ? "No se obtuvo evidencia del backend productivo de Firebase App Hosting."
          : "El backend productivo de Firebase App Hosting no está reconciliado o no expone una URI verificable.",
  );

  const activeTrafficSplits = appHosting?.currentTrafficSplits.filter((split) => split.percent > 0) ?? [];
  const servingBuild = activeTrafficSplits.length === 1 && activeTrafficSplits[0]?.percent === 100
    ? appHosting?.builds.find((build) => build.name === activeTrafficSplits[0]?.canonicalBuild)
    : undefined;
  const trafficTotal = appHosting?.currentTrafficSplits.reduce((total, split) => total + split.percent, 0) ?? 0;
  const appHostingTrafficValid = appHostingTargetMatches
    && appHosting?.trafficReconciled === true
    && activeTrafficSplits.length === 1
    && activeTrafficSplits[0]?.percent === 100
    && activeTrafficSplits[0]?.canonicalBuild !== null
    && trafficTotal === 100;
  let appHostingServingStatus: ReleaseEvidenceStatus;
  if (appHosting === null) appHostingServingStatus = "MISSING";
  else if (!appHostingTargetMatches) appHostingServingStatus = "MISMATCH";
  else if (!appHostingTrafficValid || !servingBuild || servingBuild.state !== "READY" || servingBuild.rolloutState !== "SUCCEEDED") {
    appHostingServingStatus = "FOLLOW_UP";
  } else if (!servingBuild.sourceSha) appHostingServingStatus = "MISSING";
  else if (servingBuild.sourceSha.toLowerCase() !== input.targetSha.toLowerCase()) appHostingServingStatus = "MISMATCH";
  else appHostingServingStatus = "PASS";
  addCheck(
    checks,
    "APPHOSTING_SERVES_TARGET_SHA",
    appHostingServingStatus,
    appHostingServingStatus === "PASS"
      ? "El rollout exitoso y la asignación actual del 100 % enlazan el build READY con el SHA objetivo exacto."
      : appHostingServingStatus === "MISMATCH"
        ? "App Hosting sirve otro SHA Git o el destino observado no es el backend productivo esperado."
        : appHostingServingStatus === "MISSING"
          ? "El build activo de App Hosting no expone un SHA Git verificable."
          : "Falta confirmar tráfico único al 100 %, reconciliación, estado READY o rollout exitoso del build activo.",
  );
  const appHostingVerified = appHostingUriStatus === "PASS" && appHostingServingStatus === "PASS";

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
  const functionHashesByName = functions?.functionHashesByName;
  const functionsPerFunctionReconciled = functions !== null
    && functionHashesByName !== undefined
    && Object.keys(functionHashesByName).length === functions.count
    && Object.values(functionHashesByName).every((hash) => hash.length > 0);
  addCheck(
    checks,
    "FUNCTIONS_HASH_DISTRIBUTION",
    functionsHashDistributionObserved ? "PASS" : "FOLLOW_UP",
    functionsHashDistributionObserved
      ? "La distribución de hashes desplegados de Functions fue observada y registrada."
      : "No fue posible observar la distribución de hashes desplegados de Functions.",
  );
  if (functionsHashDistributionObserved) {
    addCheck(
      checks,
      "FUNCTIONS_HASH_RECONCILIATION",
      functionsUniform || functionsPerFunctionReconciled ? "PASS" : "FOLLOW_UP",
      functionsUniform
        ? "El release de Functions usa un hash único observado."
        : functionsPerFunctionReconciled
          ? "Se observó y reconcilió el hash desplegado de cada Function; los hashes múltiples corresponden a Functions concretas."
          : "Las Functions observadas tienen hashes múltiples y falta el mapa completo Function → hash para reconciliar el release.",
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
    schemaVersion: 2,
    observedAt: new Date().toISOString(),
    projectId: input.projectId,
    targetSha: input.targetSha,
    readOnly: true,
    productionWrites: false,
    status,
    checks,
    automatic: {
      ciGreen,
      ci: input.ci,
      appHostingVerified,
      appHosting,
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
