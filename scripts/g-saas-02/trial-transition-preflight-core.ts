export const HISTORIC_TRIAL_FIN = "2026-09-02" as const;
export const HISTORIC_PLAN_VERSION = 1 as const;
export const ANNUAL_PLAN_VERSION = 2 as const;
export const ANNUAL_PLAN_ID = "mvp_comercial" as const;
export const ANNUAL_PRICE = 1_800_000 as const;
export const ANNUAL_CURRENCY = "COP" as const;
export const ANNUAL_CAPABILITIES = [
  "sell",
  "inventory",
  "purchases",
  "clientes",
  "finanzas",
  "reservas",
  "waste",
  "shifts",
  "cuentas_cobro",
] as const;
export const HISTORIC_CAPABILITIES = [
  "sell",
  "inventory",
  "purchases",
  "clientes",
  "finanzas",
  "reservas",
  "waste",
] as const;

export type PreflightSeverity = "PASS" | "WAITING" | "BLOCKER";
export type PreflightStatus =
  | "ESPERAR_VENTANA"
  | "BLOQUEADO"
  | "LISTO_PARA_COMANDOS"
  | "LISTO_PARA_CIERRE_ANTICIPADO";

export interface TrialTransitionSnapshot {
  projectId: string;
  tenantId: string;
  asOf: string;
  empresa: {
    nombre?: unknown;
    estado?: unknown;
    paisFiscal?: unknown;
    revision?: unknown;
  } | null;
  suscripcionRaiz: {
    estado?: unknown;
    planId?: unknown;
    planVersion?: unknown;
    trialInicio?: unknown;
    trialFin?: unknown;
    revision?: unknown;
    snapshotContrato?: unknown;
  } | null;
  planAnual: {
    estado?: unknown;
    periodicidad?: unknown;
    precio?: { importe?: unknown; moneda?: unknown } | null;
    capacidades?: unknown;
  } | null;
  configuracion: { modulos?: { habilitados?: unknown } | null; revision?: unknown } | null;
  relaciones: readonly { id: string; estado?: unknown }[];
  operador: { uid?: unknown; estado?: unknown; facultades?: unknown } | null;
  release: {
    mainSha?: unknown;
    ciGreen?: unknown;
    functionsHash?: unknown;
    rulesVerified?: unknown;
    storageVerified?: unknown;
    vercelVerified?: unknown;
  };
  recoveryEvidenceRef?: string | null;
  recoveryVerified?: boolean;
  earlyClosureApproved?: boolean;
  decisionRef?: string | null;
  operatorAuthVerified?: boolean;
  operatorAuthUid?: string | null;
}

export interface PreflightFinding {
  code: string;
  severity: PreflightSeverity;
  message: string;
}

export interface TrialTransitionPreflightResult {
  contract: "G-SAAS-02-TRIAL-TRANSITION-PREFLIGHT";
  observedAt: string;
  projectId: string;
  tenantId: string;
  asOf: string;
  readOnly: true;
  productionWrites: false;
  commandExecutionAllowed: false;
  status: PreflightStatus;
  readyForCanonicalCommands: boolean;
  findings: readonly PreflightFinding[];
}

export function seleccionarOperadorAutenticado(
  operadores: readonly Record<string, unknown>[],
  operadorUid: string | null,
): Record<string, unknown> | null {
  if (!operadorUid) return null;
  return operadores.find((operador) => operador.uid === operadorUid && operador.estado === "ACTIVO") ?? null;
}

function fechaValida(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function mismoArray(actual: unknown, esperado: readonly string[]): boolean {
  return Array.isArray(actual)
    && actual.length === esperado.length
    && actual.every((value, index) => value === esperado[index]);
}

function esSha(value: unknown, length: number): value is string {
  return typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`, "i").test(value);
}

function agregar(findings: PreflightFinding[], code: string, severity: PreflightSeverity, message: string): void {
  findings.push({ code, severity, message });
}

export function evaluarTrialTransitionPreflight(snapshot: TrialTransitionSnapshot): TrialTransitionPreflightResult {
  const findings: PreflightFinding[] = [];
  const root = snapshot.suscripcionRaiz;
  const company = snapshot.empresa;
  const annualPlan = snapshot.planAnual;
  const config = snapshot.configuracion;
  const asOf = snapshot.asOf;

  if (snapshot.projectId !== "micafe-pos") {
    agregar(findings, "PROJECT_UNEXPECTED", "BLOCKER", "El proyecto no coincide con el proyecto productivo aprobado.");
  } else {
    agregar(findings, "PROJECT_CONFIRMED", "PASS", "El proyecto coincide con micafe-pos.");
  }

  if (!company || company.nombre !== "Cafe Atrato" || company.paisFiscal !== "CO") {
    agregar(findings, "TENANT_IDENTITY_INVALID", "BLOCKER", "La Empresa o el país fiscal no coinciden con Café Atrato aprobado.");
  } else {
    agregar(findings, "TENANT_IDENTITY_CONFIRMED", "PASS", "La identidad del tenant coincide con Café Atrato, CO.");
  }

  if (!root) {
    agregar(findings, "ROOT_SUBSCRIPTION_MISSING", "BLOCKER", "No existe la suscripción raíz histórica.");
  } else if (
    root.planId !== ANNUAL_PLAN_ID
    || root.planVersion !== HISTORIC_PLAN_VERSION
    || root.trialInicio !== "2026-08-03"
    || root.trialFin !== HISTORIC_TRIAL_FIN
    || root.snapshotContrato !== undefined
  ) {
    agregar(findings, "ROOT_HISTORICAL_SUBSCRIPTION_DRIFT", "BLOCKER", "La suscripción raíz mensual no conserva exactamente su contrato histórico.");
  } else {
    agregar(findings, "ROOT_HISTORICAL_SUBSCRIPTION_INTACT", "PASS", "La raíz conserva plan v1, fechas históricas y ausencia de snapshot contractual.");
  }

  if (!fechaValida(asOf)) {
    agregar(findings, "AS_OF_INVALID", "BLOCKER", "La fecha de evaluación no tiene formato comercial válido.");
  }
  const trialClosed = fechaValida(asOf) && asOf >= HISTORIC_TRIAL_FIN;
  const earlyClosure = snapshot.earlyClosureApproved === true;
  if (!trialClosed && earlyClosure) {
    if (!snapshot.decisionRef?.trim()) {
      agregar(findings, "EARLY_CLOSURE_DECISION_MISSING", "BLOCKER", "El cierre anticipado exige una referencia explícita de decisión del Product Owner.");
    } else if (root?.estado !== "trialing") {
      agregar(findings, "EARLY_CLOSURE_ROOT_NOT_TRIALING", "BLOCKER", "El cierre anticipado solo puede ejecutarse mientras la suscripción histórica siga en trialing.");
    } else {
      agregar(findings, "EARLY_CLOSURE_AUTHORIZED", "PASS", "Existe decisión explícita para cerrar anticipadamente el Trial histórico sin cambiar sus fechas ni su contrato.");
    }
  } else if (!trialClosed) {
    agregar(findings, "HISTORIC_TRIAL_STILL_OPEN", "WAITING", `El Trial mensual histórico permanece protegido hasta ${HISTORIC_TRIAL_FIN}.`);
  } else if (root?.estado !== "suspended") {
    agregar(findings, "ROOT_NOT_CANONICALLY_SUSPENDED", "BLOCKER", "Después del cierre histórico, la raíz todavía no está suspendida por el lifecycle canónico.");
  } else if (company?.estado !== "suspendida") {
    agregar(findings, "COMPANY_NOT_SUSPENDED", "BLOCKER", "Después del cierre histórico, la Empresa no está suspendida como exige el preflight.");
  } else {
    agregar(findings, "HISTORIC_TRIAL_CLOSED_CANONICALLY", "PASS", "La ventana histórica terminó y la raíz/Empresa están suspendidas.");
  }

  if (!annualPlan
    || annualPlan.estado !== "PUBLICADA"
    || annualPlan.periodicidad !== "ANUAL"
    || annualPlan.precio?.importe !== ANNUAL_PRICE
    || annualPlan.precio?.moneda !== ANNUAL_CURRENCY
    || !mismoArray(annualPlan.capacidades, ANNUAL_CAPABILITIES)) {
    agregar(findings, "ANNUAL_PLAN_INVALID", "BLOCKER", "El Plan anual no coincide con versión publicada, precio, moneda o nueve capacidades aprobadas.");
  } else {
    agregar(findings, "ANNUAL_PLAN_CONFIRMED", "PASS", "El Plan anual v2 publicado coincide con 1.800.000 COP y nueve capacidades.");
  }

  if (!config || !mismoArray(config.modulos?.habilitados, HISTORIC_CAPABILITIES)) {
    agregar(findings, "HISTORIC_CONFIGURATION_DRIFT", "BLOCKER", "La configuración histórica no conserva exactamente sus siete módulos antes de materializar la relación anual.");
  } else {
    agregar(findings, "HISTORIC_CONFIGURATION_INTACT", "PASS", "La configuración conserva los siete módulos históricos y no fue adelantada.");
  }

  if (snapshot.relaciones.length !== 0) {
    agregar(findings, "CONTRACTUAL_RELATION_ALREADY_EXISTS", "BLOCKER", "Ya existe una relación contractual; el preflight de primera materialización no puede continuar.");
  } else {
    agregar(findings, "NO_CONTRACTUAL_RELATION_EXISTS", "PASS", "No existe una relación contractual anual previa.");
  }

  const faculties = snapshot.operador?.facultades;
  if (snapshot.operador?.estado !== "ACTIVO" || !Array.isArray(faculties) || !faculties.includes("COMERCIAL_GOBERNAR") || !faculties.includes("LIFECYCLE_GOBERNAR")) {
    agregar(findings, "OPERATOR_AUTHORITY_INVALID", "BLOCKER", "El operador no está activo con facultades comerciales y de lifecycle.");
  } else {
    agregar(findings, "OPERATOR_AUTHORITY_CONFIRMED", "PASS", "Existe operador activo con facultades COMERCIAL_GOBERNAR y LIFECYCLE_GOBERNAR.");
  }

  if (snapshot.operatorAuthVerified !== true || snapshot.operatorAuthUid !== snapshot.operador?.uid) {
    agregar(findings, "OPERATOR_AUTHENTICATION_MISSING", "BLOCKER", "La identidad Firebase del operador no ha sido verificada contra la callable read-only de plataforma.");
  } else {
    agregar(findings, "OPERATOR_AUTHENTICATION_CONFIRMED", "PASS", "La identidad Firebase del operador fue verificada contra la callable read-only de plataforma.");
  }

  const release = snapshot.release;
  if (!esSha(release.mainSha, 40) || release.ciGreen !== true || !esSha(release.functionsHash, 40) || release.rulesVerified !== true || release.storageVerified !== true || release.vercelVerified !== true) {
    agregar(findings, "RELEASE_EVIDENCE_INCOMPLETE", "BLOCKER", "Falta evidencia completa de SHA, CI, Functions, Rules, Storage o Vercel.");
  } else {
    agregar(findings, "RELEASE_EVIDENCE_COMPLETE", "PASS", "La evidencia de release está completa y verificable.");
  }

  if (!snapshot.recoveryEvidenceRef || !snapshot.recoveryEvidenceRef.trim() || snapshot.recoveryVerified !== true) {
    agregar(findings, "RECOVERY_EVIDENCE_MISSING", "BLOCKER", "Falta una atestación independiente de recovery antes de cualquier escritura; la referencia de configuración por sí sola no basta.");
  } else {
    agregar(findings, "RECOVERY_EVIDENCE_PRESENT", "PASS", "Existe referencia de recovery para el preflight.");
  }

  const hasBlocker = findings.some((finding) => finding.severity === "BLOCKER");
  const hasWaiting = findings.some((finding) => finding.severity === "WAITING");
  const readyForCanonicalCommands = !hasBlocker && !hasWaiting;
  return {
    contract: "G-SAAS-02-TRIAL-TRANSITION-PREFLIGHT",
    observedAt: new Date().toISOString(),
    projectId: snapshot.projectId,
    tenantId: snapshot.tenantId,
    asOf: snapshot.asOf,
    readOnly: true,
    productionWrites: false,
    commandExecutionAllowed: false,
    status: !trialClosed
      ? earlyClosure ? readyForCanonicalCommands ? "LISTO_PARA_CIERRE_ANTICIPADO" : "BLOQUEADO" : "ESPERAR_VENTANA"
      : readyForCanonicalCommands ? "LISTO_PARA_COMANDOS" : "BLOQUEADO",
    readyForCanonicalCommands,
    findings,
  };
}
