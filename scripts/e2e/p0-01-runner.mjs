import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";

const projectId = process.env.E2E_P0_01_PROJECT_ID ?? "demo-p0-01-e2e";
const runId = process.env.E2E_P0_01_RUN_ID ?? `p0-01-${Date.now()}`;
const evidenceDir = resolve(process.env.E2E_P0_01_EVIDENCE_DIR ?? `artifacts/e2e/p0-01/${runId}`);
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
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
});

const compilacion = spawnSync(process.execPath, [
  resolve("functions", "node_modules", "typescript", "bin", "tsc"),
  "-p",
  "functions/tsconfig.json",
], { cwd: process.cwd(), env, encoding: "utf8" });
writeFileSync(resolve(evidenceDir, "functions-build.log"), `${compilacion.stdout ?? ""}${compilacion.stderr ?? ""}`);
if (compilacion.stdout) process.stdout.write(compilacion.stdout);
if (compilacion.stderr) process.stderr.write(compilacion.stderr);
if (compilacion.status !== 0) throw new Error("La compilación de Functions falló; P0-01 E2E no usa artefactos desactualizados.");

function puertoEnUso(port) {
  return new Promise((resolvePort) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolvePort(true); });
    socket.once("error", () => resolvePort(false));
  });
}

const estados = await Promise.all([5001, 8085, 9099].map(puertoEnUso));
const usarExistentes = estados.every(Boolean);
if (estados.some(Boolean) && !usarExistentes) {
  throw new Error("P0-01 E2E requiere Auth, Firestore y Functions en conjunto; se rechazó un entorno parcial.");
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
process.exitCode = result.status ?? (result.error ? 1 : 0);
