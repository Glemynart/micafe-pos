import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { crearEndpointsEmulador, detenerEmuladoresDemo, exigirProjectIdEmulador, obtenerEstadoPuertos, prepararParametrosDusemaEmulador } from "./emulator-preflight.mjs";

const projectId = process.env.E2E_R1A_PROJECT_ID ?? "demo-r1a-e2e";
exigirProjectIdEmulador(projectId, "demo-");
const runId = process.env.E2E_R1A_RUN_ID ?? `r1a-${Date.now()}`;
const evidenceDir = resolve(process.env.E2E_R1A_EVIDENCE_DIR ?? `artifacts/e2e/r1a/${runId}`);
mkdirSync(evidenceDir, { recursive: true });

function leerPepperLocal() {
  const secretFile = resolve("functions", ".secret.local");
  if (!existsSync(secretFile)) return undefined;
  const line = readFileSync(secretFile, "utf8")
    .split(/\r?\n/)
    .find((value) => value.startsWith("OPERATIONAL_PIN_PEPPER="));
  return line?.slice("OPERATIONAL_PIN_PEPPER=".length) || undefined;
}

const pepper = process.env.E2E_R1A_OPERATIONAL_PIN_PEPPER ?? leerPepperLocal() ?? "r1a-e2e-local-pepper";
const endpoints = crearEndpointsEmulador(process.env);

const env = {
  ...process.env,
  GCLOUD_PROJECT: projectId,
  E2E_R1A_PROJECT_ID: projectId,
  E2E_R1A_RUN_ID: runId,
  E2E_R1A_EVIDENCE_DIR: evidenceDir,
  E2E_R1A_PLAYWRIGHT_ARGS: JSON.stringify(process.argv.slice(2)),
  E2E_R1A_OPERATIONAL_PIN_PEPPER: pepper,
  OPERATIONAL_PIN_PEPPER: pepper,
  NEXT_PUBLIC_USE_EMULATORS: "1",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyDUMMY0000000000000000000000000000",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "000000000000",
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? `1:000000000000:web:${projectId}`,
  FIREBASE_FUNCTIONS_EMULATOR_HOST: endpoints.functions.endpoint,
  FIRESTORE_EMULATOR_HOST: endpoints.firestore.endpoint,
  FIREBASE_AUTH_EMULATOR_HOST: endpoints.auth.endpoint,
  NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT: String(endpoints.functions.port),
  NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: String(endpoints.firestore.port),
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT: String(endpoints.auth.port),
};

const compilacion = spawnSync(process.execPath, [
  resolve("functions", "node_modules", "typescript", "bin", "tsc"), "-p", "functions/tsconfig.json",
], {
  cwd: process.cwd(), env, encoding: "utf8",
});
writeFileSync(resolve(evidenceDir, "functions-build.log"), `${compilacion.stdout ?? ""}${compilacion.stderr ?? ""}`);
if (compilacion.stdout) process.stdout.write(compilacion.stdout);
if (compilacion.stderr) process.stderr.write(compilacion.stderr);
if (compilacion.status !== 0) {
  throw new Error("La compilación de Functions falló; R1-A E2E no permite ejecutar contra artefactos desactualizados.");
}

const estados = await obtenerEstadoPuertos(endpoints);
const permitirReutilizacion = process.env.E2E_R1A_REUSE_EMULATORS === "1";
const usarExistentes = permitirReutilizacion && estados.every(({ enUso }) => enUso);
if (estados.some(({ enUso }) => enUso) && !usarExistentes) {
  throw new Error(`R1-A E2E detectó puertos ocupados y no reutiliza emuladores sin E2E_R1A_REUSE_EMULATORS=1: ${JSON.stringify(estados)}`);
}

const command = process.execPath;
const emulatorConfigPath = resolve(`.firebase.r1a-${runId}.json`);
writeFileSync(emulatorConfigPath, `${JSON.stringify({
  functions: [{ source: "functions", codebase: "saas-auth" }],
  firestore: { rules: "firestore.rules", indexes: "firestore.indexes.json" },
  emulators: { functions: { port: endpoints.functions.port }, firestore: { port: endpoints.firestore.port }, auth: { port: endpoints.auth.port }, singleProjectMode: true },
}, null, 2)}\n`);
let result;
let limpiarParametrosDusema;
try {
  if (!usarExistentes) limpiarParametrosDusema = prepararParametrosDusemaEmulador();
  result = usarExistentes
    ? spawnSync(command, ["scripts/e2e/r1a-inner.mjs"], { cwd: process.cwd(), env, stdio: "inherit" })
    : spawnSync(command, [
      resolve("node_modules", "firebase-tools", "lib", "bin", "firebase.js"),
      "emulators:exec", "--only", "auth,firestore,functions", "--project", projectId, "--config", emulatorConfigPath,
      "node scripts/e2e/r1a-inner.mjs",
    ], { cwd: process.cwd(), env, stdio: "inherit" });
} finally {
  limpiarParametrosDusema?.();
  if (existsSync(emulatorConfigPath)) unlinkSync(emulatorConfigPath);
}

if (existsSync("firebase-debug.log")) copyFileSync("firebase-debug.log", resolve(evidenceDir, "firebase-emulator.log"));
if (result.error) writeFileSync(resolve(evidenceDir, "launcher-error.txt"), result.error.stack ?? String(result.error));
if (!usarExistentes) {
  // Firebase puede dejar el proceso Java unos milisegundos después de cerrar
  // Auth/Functions en Windows; esperar permite que el cleanup sea determinista.
  await new Promise((resolveCleanup) => setTimeout(resolveCleanup, 1_000));
  detenerEmuladoresDemo(projectId);
}
writeFileSync(resolve(evidenceDir, "emulator-preflight.json"), `${JSON.stringify({
  projectId,
  reusedExistingEmulators: usarExistentes,
  ports: Object.fromEntries(estados.map(({ nombre, endpoint, enUso }) => [nombre, { endpoint, enUso }])),
}, null, 2)}\n`);
process.exitCode = result.status ?? (result.error ? 1 : 0);
