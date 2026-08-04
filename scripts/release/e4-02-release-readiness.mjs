import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  E4_02_FOLLOW_UP_IDS,
  E4_02_PENDING_GATES,
  E4_02_REQUIRED_CI_COMMANDS,
  validarContratoE4_02,
} from "./e4-02-contract.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../..");
const runId = process.env.E4_02_RUN_ID ?? `e4-02-${Date.now()}`;
const evidenceDir = resolve(process.env.E4_02_EVIDENCE_DIR ?? `artifacts/release/e4-02/${runId}`);
mkdirSync(evidenceDir, { recursive: true });

function readRepoFile(relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : null;
}

function result(id, status, category, description, evidence, followUp = null) {
  return { id, status, category, description, evidence, followUp };
}

function runGit(args) {
  const execution = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8", windowsHide: true });
  return execution.status === 0 ? execution.stdout.trim() : null;
}

function runNpmAudit(args) {
  const execution = spawnSync("npm", args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 120_000,
    shell: process.platform === "win32",
    windowsHide: true,
  });
  const raw = `${execution.stdout ?? ""}`.trim();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!parsed?.metadata?.vulnerabilities) {
    return {
      status: "FOLLOW_UP",
      exitCode: execution.status,
      error: execution.error?.message ?? "npm audit no devolvió metadata JSON interpretable.",
    };
  }

  const vulnerabilities = parsed.metadata.vulnerabilities;
  const total = Number(vulnerabilities.total ?? Object.entries(vulnerabilities)
    .filter(([severity]) => severity !== "total")
    .reduce((sum, [, value]) => sum + Number(value || 0), 0));
  return {
    status: total === 0 ? "PASS" : "FOLLOW_UP",
    exitCode: execution.status,
    vulnerabilities,
    total,
  };
}

const goal = readRepoFile("docs/goals/GOAL-MVP-COMERCIAL.md") ?? "";
const ci = readRepoFile(".github/workflows/ci.yml") ?? "";
const e4Runner = readRepoFile("scripts/e2e/e4-01-runner.mjs") ?? "";
const firebaseConfig = readRepoFile("firebase.json");
const storageRules = readRepoFile("storage.rules");
const securityPlan = readRepoFile("MASTER-SECURITY-PLAN.md") ?? "";
const packageJson = readRepoFile("package.json") ?? "";
const checks = [];

checks.push(result(
  "E4.2-GOAL-STRUCTURE",
  goal.includes("### M4 — Certificación comercial")
    && goal.includes("E4.2 Release readiness")
    && goal.includes("**Epic activo:** `E4.2 — Release readiness`" )
    ? "PASS"
    : "FAIL",
  "GOVERNANCE",
  "El Goal declara M4/E4.2 como el trabajo activo.",
  "docs/goals/GOAL-MVP-COMERCIAL.md",
));

const missingCiCommands = E4_02_REQUIRED_CI_COMMANDS.filter((command) => !ci.includes(command));
checks.push(result(
  "E4.2-CI-CORE-SUITES",
  missingCiCommands.length === 0 ? "PASS" : "FAIL",
  "CI",
  "La CI conserva las suites que forman el núcleo certificado.",
  missingCiCommands.length === 0 ? E4_02_REQUIRED_CI_COMMANDS : missingCiCommands,
  missingCiCommands.length === 0 ? null : "Restaurar la suite faltante antes de declarar el release gate verde.",
));

checks.push(result(
  "E4.2-E4-01-SAFETY",
  e4Runner.includes("productionWrites: false")
    && e4Runner.includes("credentialsRemoved: true")
    && e4Runner.includes("Firebase Emulator Suite only")
    ? "PASS"
    : "FAIL",
  "SAFETY",
  "E4.1 permanece restringido a Emulator y no acepta credenciales productivas.",
  "scripts/e2e/e4-01-runner.mjs",
));

checks.push(result(
  "E4.2-RELEASE-SCRIPTS",
  packageJson.includes("e4-02:readiness") && ci.includes("e4-02:readiness") ? "PASS" : "FAIL",
  "CI",
  "El runner de readiness está conectado al contrato de CI.",
  ["package.json", ".github/workflows/ci.yml"],
  packageJson.includes("e4-02:readiness") && ci.includes("e4-02:readiness")
    ? null
    : "Conectar el runner antes de fusionar E4.2.",
));

const storageConfigured = Boolean(storageRules) && Boolean(firebaseConfig?.includes('"storage"'));
checks.push(result(
  "E4.2-SEC-001-STORAGE-RULES",
  storageConfigured ? "PASS" : "FOLLOW_UP",
  "SECURITY",
  "Storage usado por imágenes tiene reglas versionadas y declaradas.",
  { firebaseConfig: Boolean(firebaseConfig?.includes('"storage"')), storageRules: Boolean(storageRules) },
  storageConfigured ? null : "Crear un PR/ADR separado para el contrato tenant-aware de Storage Rules.",
));

const securityPlanAligned = !securityPlan.includes("**Estado:** Borrador para aprobación")
  && !securityPlan.includes("Hoy el sistema es **single-tenant**");
checks.push(result(
  "E4.2-SEC-003-MASTER-PLAN",
  securityPlanAligned ? "PASS" : "FOLLOW_UP",
  "SECURITY",
  "El plan maestro de seguridad refleja el estado SaaS vigente.",
  "MASTER-SECURITY-PLAN.md",
  securityPlanAligned ? null : "Actualizar el plan maestro sin convertir la actualización documental en una mitigación implícita.",
));

const audits = {
  root: runNpmAudit(["audit", "--omit=dev", "--json"]),
  functions: runNpmAudit(["--prefix", "functions", "audit", "--omit=dev", "--json"]),
};
for (const [scope, audit] of Object.entries(audits)) {
  checks.push(result(
    `E4.2-SEC-002-DEPENDENCIES-${scope.toUpperCase()}`,
    audit.status,
    "SECURITY",
    `npm audit ${scope} no presenta vulnerabilidades conocidas o las registra como seguimiento.`,
    audit,
    audit.status === "PASS" ? null : "Abrir un PR separado de dependencias y evaluar compatibilidad antes de actualizar.",
  ));
}

checks.push(result(
  "E4.2-CI-001-UNCOVERED-SURFACES",
  "FOLLOW_UP",
  "COVERAGE",
  "Operator Portal, R1A, Storage, Electron y reservas/Wompi no forman parte del gate core actual.",
  {
    packageScripts: ["e2e:operator-portal", "e2e:r1a", "dist"],
    ciCovered: ["e2e:e4-01", "e2e:p0-01", "e2e:p0-06", "e2e:p1-02", "e2e:p1-04", "e2e:p0-10"],
  },
  "Planificar cada superficie como PR/gate separado; no ampliar E4.2 con funcionalidad.",
));

const followUpPrefixes = {
  "E4.2-SEC-001-STORAGE-RULES": "E4.2-SEC-001-STORAGE-RULES",
  "E4.2-SEC-002-DEPENDENCIES": "E4.2-SEC-002-DEPENDENCIES",
  "E4.2-SEC-003-MASTER-PLAN": "E4.2-SEC-003-MASTER-PLAN",
  "E4.2-CI-001-UNCOVERED-SURFACES": "E4.2-CI-001-UNCOVERED-SURFACES",
};
const followUpIds = E4_02_FOLLOW_UP_IDS.filter((id) => checks.some((check) => {
  const prefix = followUpPrefixes[id];
  return prefix && (check.id === prefix || check.id.startsWith(`${prefix}-`));
}));
const contractValid = validarContratoE4_02({ ci, gates: E4_02_PENDING_GATES, followUpIds });
checks.push(result(
  "E4.2-CONTRACT",
  contractValid ? "PASS" : "FAIL",
  "GOVERNANCE",
  "El contrato de E4.2 conserva suites, gates y seguimientos canónicos.",
  { requiredCiCommands: E4_02_REQUIRED_CI_COMMANDS, pendingGates: E4_02_PENDING_GATES, followUpIds },
));

const failedChecks = checks.filter((check) => check.status === "FAIL");
const followUps = checks.filter((check) => check.status === "FOLLOW_UP");
const evidence = {
  schemaVersion: 1,
  goal: "G-MVP-01",
  milestone: "M4",
  epic: "E4.2",
  runId,
  target: "release-readiness",
  environment: "Repositorio local/CI; sin Firebase ni producción",
  productionWrites: false,
  branch: runGit(["branch", "--show-current"]),
  commit: runGit(["rev-parse", "HEAD"]),
  mainRef: runGit(["rev-parse", "main"]),
  originMainRef: runGit(["rev-parse", "origin/main"]),
  status: failedChecks.length === 0 ? "PASS_WITH_PENDING_FOLLOW_UPS" : "FAIL",
  releaseDecision: failedChecks.length === 0 ? "CONDITIONAL" : "NOT_READY",
  checks,
  pendingGates: E4_02_PENDING_GATES,
  failedChecks: failedChecks.map((check) => check.id),
  followUps: followUps.map((check) => ({ id: check.id, followUp: check.followUp })),
  externalCiReference: process.env.E4_02_CI_URL ?? null,
  generatedAt: new Date().toISOString(),
};

writeFileSync(resolve(evidenceDir, "e4-02-release-readiness.json"), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(resolve(evidenceDir, "e4-02-release-readiness.md"), [
  "# E4.2 — Release readiness",
  "",
  `- Estado de la evidencia: **${evidence.status}**`,
  `- Decisión de release: **${evidence.releaseDecision}**`,
  `- Escrituras productivas: **${evidence.productionWrites ? "sí" : "no"}**`,
  "",
  "| Check | Estado | Categoría | Seguimiento |",
  "|---|---|---|---|",
  ...checks.map((check) => `| ${check.id} | ${check.status} | ${check.category} | ${check.followUp ?? "—"} |`),
  "",
  "Los estados FOLLOW_UP y PENDING_EXTERNAL no son fallos del runner: representan trabajo posterior o dependencias externas fuera del alcance de E4.2.",
  "",
].join("\n"));

for (const check of checks) {
  process.stdout.write(`[E4.2] ${check.id}: ${check.status}\n`);
}
process.stdout.write(`[E4.2] evidencia: ${resolve(evidenceDir, "e4-02-release-readiness.json")}\n`);
process.exitCode = failedChecks.length === 0 ? 0 : 1;
