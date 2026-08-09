import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  crearEndpointsEmulador,
  detenerEmuladoresDemo,
  exigirProjectIdEmulador,
  obtenerEstadoPuertos,
  esperarEmuladoresSaludables,
} from "./emulator-preflight.mjs";

const projectId = process.env.E2E_P0_01_PROJECT_ID ?? "demo-p0-01-e2e";
exigirProjectIdEmulador(projectId, "demo-p0-01-");
const runId = process.env.E2E_P0_01_RUN_ID ?? `p0-01-${Date.now()}`;
const evidenceDir = resolve(process.env.E2E_P0_01_EVIDENCE_DIR ?? `artifacts/e2e/p0-01/${runId}`);
const endpoints = crearEndpointsEmulador({
  ...process.env,
  FIREBASE_FUNCTIONS_EMULATOR_HOST: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001",
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8085",
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099",
});
function leerPepperLocal() {
  const secretFile = resolve("functions", ".secret.local");
  if (!existsSync(secretFile)) return undefined;
  const line = readFileSync(secretFile, "utf8")
    .split(/\r?\n/)
    .find((value) => value.startsWith("OPERATIONAL_PIN_PEPPER="));
  return line?.slice("OPERATIONAL_PIN_PEPPER=".length) || undefined;
}

// Firebase Emulator Suite resuelve defineSecret desde functions/.secret.local.
// Reutilizarlo evita que la fixture genere hashes incompatibles, sin copiar el
// secreto al repositorio ni a los artefactos de evidencia.
const pepper = process.env.E2E_P0_01_OPERATIONAL_PIN_PEPPER ?? leerPepperLocal() ?? "p0-01-e2e-local-pepper";

mkdirSync(evidenceDir, { recursive: true });

// El arnés nunca debe heredar una credencial administrativa de producción.
const env = { ...process.env };
delete env.GOOGLE_APPLICATION_CREDENTIALS;
Object.assign(env, {
  GCLOUD_PROJECT: projectId,
  E2E_P0_01_PROJECT_ID: projectId,
  E2E_P0_01_RUN_ID: runId,
  E2E_P0_01_EVIDENCE_DIR: evidenceDir,
  E2E_P0_01_OPERATIONAL_PIN_PEPPER: pepper,
  OPERATIONAL_PIN_PEPPER: pepper,
  NEXT_PUBLIC_USE_EMULATORS: "1",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  // El navegador necesita una configuraciÃ³n Web no vacÃ­a para inicializar
  // Firebase Auth. Estos valores son deliberadamente sintÃ©ticos y solo viven
  // en el proceso del E2E; nunca apuntan a un tenant ni a producciÃ³n.
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyDUMMY0000000000000000000000000000",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "000000000000",
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? `1:000000000000:web:${projectId}`,
  FIREBASE_FUNCTIONS_EMULATOR_HOST: endpoints.functions.endpoint,
  FIRESTORE_EMULATOR_HOST: endpoints.firestore.endpoint,
  FIREBASE_AUTH_EMULATOR_HOST: endpoints.auth.endpoint,
});

const skipFunctionsBuild = process.env.E2E_SKIP_FUNCTIONS_BUILD === "1";
const compilacion = skipFunctionsBuild ? { stdout: "", stderr: "", status: 0 } : spawnSync(process.execPath, [
  resolve("functions", "node_modules", "typescript", "bin", "tsc"),
  "-p",
  "functions/tsconfig.json",
], { cwd: process.cwd(), env, encoding: "utf8" });
writeFileSync(resolve(evidenceDir, "functions-build.log"), `${compilacion.stdout ?? ""}${compilacion.stderr ?? ""}`);
if (compilacion.stdout) process.stdout.write(compilacion.stdout);
if (compilacion.stderr) process.stderr.write(compilacion.stderr);
if (compilacion.status !== 0) throw new Error("La compilación de Functions falló; P0-01 E2E no usa artefactos desactualizados.");

if (skipFunctionsBuild) {
  if (!existsSync(resolve("functions", "lib", "functions", "src", "index.js"))) throw new Error("E2E_SKIP_FUNCTIONS_BUILD=1 requiere functions/lib/functions/src/index.js.");
  writeFileSync(resolve(evidenceDir, "functions-build.log"), "Skipped: functions/lib/functions/src/index.js fue construido por el job.\n");
}

const estados = await obtenerEstadoPuertos(endpoints);
const puertosEnUso = estados.filter((estado) => estado.enUso);
const usarExistentes = puertosEnUso.length === estados.length;
if (puertosEnUso.length > 0 && !usarExistentes) {
  throw new Error(`P0-01 E2E requiere Auth, Firestore y Functions en conjunto; entorno parcial: ${JSON.stringify(estados)}.`);
}
if (usarExistentes) {
  await esperarEmuladoresSaludables({ projectId, endpoints });
}

const firebaseCli = resolve("node_modules", "firebase-tools", "lib", "bin", "firebase.js");
const result = usarExistentes
  ? spawnSync(process.execPath, ["scripts/e2e/p0-01-inner.mjs"], { cwd: process.cwd(), env, stdio: "inherit" })
  : spawnSync(process.execPath, [
      firebaseCli,
      "emulators:exec",
      "--only",
      "auth,firestore,functions",
      "--project",
      projectId,
      "node scripts/e2e/p0-01-inner.mjs",
    ], { cwd: process.cwd(), env, stdio: "inherit" });

if (existsSync("firebase-debug.log")) copyFileSync("firebase-debug.log", resolve(evidenceDir, "firebase-emulator.log"));
if (result.error) writeFileSync(resolve(evidenceDir, "launcher-error.txt"), result.error.stack ?? String(result.error));
if (!usarExistentes) detenerEmuladoresDemo(projectId);
writeFileSync(resolve(evidenceDir, "emulator-preflight.json"), `${JSON.stringify({
  projectId,
  endpoints,
  reusedExistingEmulators: usarExistentes,
  ports: estados,
}, null, 2)}\n`);
process.exitCode = result.status ?? (result.error ? 1 : 0);
