import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { E4_01_PENDING_GATES, E4_01_STEP_DEFINITIONS, validarProyectoEmulador } from "./e4-01-contract.mjs";

const projectId = process.env.E2E_E4_01_PROJECT_ID ?? "demo-e4-01-certification";
const runId = process.env.E2E_E4_01_RUN_ID ?? `e4-01-${Date.now()}`;
const evidenceDir = resolve(process.env.E2E_E4_01_EVIDENCE_DIR ?? `artifacts/e2e/e4-01/${runId}`);

if (!validarProyectoEmulador(projectId, "demo-e4-01-")) {
  throw new Error("E4-01 solo admite un proyecto demo-e4-01-* para impedir cualquier ejecución productiva.");
}
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("E4-01 rechaza GOOGLE_APPLICATION_CREDENTIALS para impedir escrituras productivas.");
}

mkdirSync(evidenceDir, { recursive: true });

const safeEnvironment = { ...process.env };
for (const key of [
  "GOOGLE_APPLICATION_CREDENTIALS",
  "FIREBASE_CONFIG",
  "GCLOUD_PROJECT",
  "GOOGLE_CLOUD_PROJECT",
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_FUNCTIONS_EMULATOR_HOST",
  "NEXT_PUBLIC_USE_EMULATORS",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
]) {
  delete safeEnvironment[key];
}
Object.assign(safeEnvironment, {
  GCLOUD_PROJECT: projectId,
  E4_01_PROJECT_ID: projectId,
  E4_01_RUN_ID: runId,
  E4_01_EVIDENCE_DIR: evidenceDir,
});

const commands = [
  {
    id: "P0-01",
    runner: "scripts/e2e/p0-01-runner.mjs",
    projectId: "demo-p0-01-e4-01",
    env: {
      E2E_P0_01_PROJECT_ID: "demo-p0-01-e4-01",
      E2E_P0_01_RUN_ID: `${runId}-p0-01`,
    },
  },
  {
    id: "P0-06",
    runner: "scripts/e2e/p0-06-runner.mjs",
    projectId: "demo-p0-06-e4-01",
    env: {
      E2E_P0_06_PROJECT_ID: "demo-p0-06-e4-01",
      E2E_P0_06_RUN_ID: `${runId}-p0-06`,
    },
  },
  {
    id: "P1-02",
    runner: "scripts/e2e/p1-02-runner.mjs",
    projectId: "demo-p1-02-e4-01",
    env: {
      E2E_P1_02_PROJECT_ID: "demo-p1-02-e4-01",
      E2E_P1_02_RUN_ID: `${runId}-p1-02`,
    },
  },
  {
    id: "P1-04",
    runner: "scripts/e2e/p1-04-runner.mjs",
    projectId: "demo-p1-04-e4-01",
    env: {
      E2E_P1_04_PROJECT_ID: "demo-p1-04-e4-01",
      E2E_P1_04_RUN_ID: `${runId}-p1-04`,
    },
  },
  {
    id: "P0-10",
    runner: "scripts/e2e/p0-10-runner.mjs",
    projectId: "demo-p0-10-e4-01",
    env: {
      E2E_P0_10_PROJECT_ID: "demo-p0-10-e4-01",
      E2E_P0_10_RUN_ID: `${runId}-p0-10`,
    },
  },
];

function limpiarEmuladoresOrfanos() {
  if (process.platform !== "win32") return;
  const script = `$names = @('java.exe','java','node.exe','node'); Get-CimInstance Win32_Process | Where-Object { $names -contains $_.Name -and $_.CommandLine -and $_.CommandLine -match '(cloud-firestore-emulator|firebase.*emulators|auth-emulator)' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
  spawnSync("powershell.exe", ["-NoProfile", "-Command", script], { stdio: "ignore" });
}

for (const command of commands) {
  const definition = E4_01_STEP_DEFINITIONS.find((step) => step.id === command.id);
  if (!definition || command.runner !== definition.runner || !validarProyectoEmulador(command.projectId, definition.projectPrefix)) {
    throw new Error(`E4-01 contrato inválido para ${command.id}.`);
  }
}

function ejecutarPaso(command) {
  // Los runners históricos aceptan cualquier proceso que ocupe 8085. Se
  // limpia únicamente el proceso local identificable como Emulator para que
  // cada corte conserve su propio proyecto demo y no herede datos de otro.
  limpiarEmuladoresOrfanos();
  const stepDir = resolve(evidenceDir, "steps", command.id.toLowerCase());
  mkdirSync(stepDir, { recursive: true });
  const env = { ...safeEnvironment, ...command.env, E4_01_STEP_EVIDENCE_DIR: stepDir };
  const evidenceVariable = {
    "P0-06": "E2E_P0_06_EVIDENCE_DIR",
    "P1-02": "E2E_P1_02_EVIDENCE_DIR",
    "P1-04": "E2E_P1_04_EVIDENCE_DIR",
    "P0-10": "E2E_P0_10_EVIDENCE_DIR",
    "P0-01": "E2E_P0_01_EVIDENCE_DIR",
  }[command.id];
  if (evidenceVariable) env[evidenceVariable] = stepDir;
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, [resolve(command.runner)], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  writeFileSync(resolve(stepDir, "stdout.log"), stdout);
  writeFileSync(resolve(stepDir, "stderr.log"), stderr);
  const exitCode = result.error ? 1 : (result.status ?? 1);
  const paso = {
    id: command.id,
    runner: command.runner,
    projectId: command.projectId,
    target: "emulator",
    status: exitCode === 0 ? "PASS" : "FAIL",
    exitCode,
    startedAt,
    completedAt: new Date().toISOString(),
    evidenceDir: stepDir,
    error: result.error?.message,
  };
  process.stdout.write(`[E4.1] ${command.id}: ${paso.status}\n`);
  return paso;
}

const startedAt = new Date().toISOString();
const steps = commands.map(ejecutarPaso);
limpiarEmuladoresOrfanos();
const failedSteps = steps.filter((step) => step.status !== "PASS");
const evidence = {
  schemaVersion: 1,
  goal: "G-MVP-01",
  milestone: "M4",
  epic: "E4.1",
  runId,
  projectId,
  environment: "Firebase Emulator Suite only",
  productionWrites: false,
  credentialsRemoved: true,
  status: failedSteps.length === 0 ? "PASS" : "FAIL",
  startedAt,
  completedAt: new Date().toISOString(),
  steps,
  failedSteps: failedSteps.map(({ id, status, exitCode, evidenceDir: stepEvidenceDir }) => ({ id, status, exitCode, evidenceDir: stepEvidenceDir })),
  pendingGates: E4_01_PENDING_GATES,
  followUpFindings: failedSteps.length === 0
    ? []
    : [{
      id: "E4.1-RUN-FAILURE",
      type: "REQUIRES_PR_OR_ADR_ANALYSIS",
      description: "Una o más certificaciones del núcleo no pasaron; el fallo debe analizarse fuera de E4.1 y no se corrige ampliando este PR.",
      steps: failedSteps.map((step) => step.id),
    }],
};

writeFileSync(resolve(evidenceDir, "e4-01-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
writeFileSync(resolve(evidenceDir, "pending-gates.json"), `${JSON.stringify(E4_01_PENDING_GATES, null, 2)}\n`);
process.exitCode = failedSteps.length === 0 ? 0 : 1;
