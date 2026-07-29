import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import { resolve } from "node:path";

const projectId = process.env.E2E_R1A_PROJECT_ID ?? "demo-r1a-e2e";
const runId = process.env.E2E_R1A_RUN_ID ?? `r1a-${Date.now()}`;
const evidenceDir = resolve(process.env.E2E_R1A_EVIDENCE_DIR ?? `artifacts/e2e/r1a/${runId}`);
mkdirSync(evidenceDir, { recursive: true });

const env = {
  ...process.env,
  GCLOUD_PROJECT: projectId,
  E2E_R1A_PROJECT_ID: projectId,
  E2E_R1A_RUN_ID: runId,
  E2E_R1A_EVIDENCE_DIR: evidenceDir,
  E2E_R1A_OPERATIONAL_PIN_PEPPER: process.env.E2E_R1A_OPERATIONAL_PIN_PEPPER ?? "r1a-e2e-local-pepper",
  OPERATIONAL_PIN_PEPPER: process.env.E2E_R1A_OPERATIONAL_PIN_PEPPER ?? "r1a-e2e-local-pepper",
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
  throw new Error("R1-A E2E requiere Auth, Firestore y Functions en conjunto; no inicia sobre un conjunto parcial de puertos ocupados.");
}

const command = process.execPath;
const result = usarExistentes
  ? spawnSync(command, ["scripts/e2e/r1a-inner.mjs"], { cwd: process.cwd(), env, stdio: "inherit" })
  : spawnSync(command, [
    resolve("node_modules", "firebase-tools", "lib", "bin", "firebase.js"),
    "emulators:exec", "--only", "auth,firestore,functions", "--project", projectId,
    "node scripts/e2e/r1a-inner.mjs",
  ], { cwd: process.cwd(), env, stdio: "inherit" });

if (existsSync("firebase-debug.log")) copyFileSync("firebase-debug.log", resolve(evidenceDir, "firebase-emulator.log"));
if (result.error) writeFileSync(resolve(evidenceDir, "launcher-error.txt"), result.error.stack ?? String(result.error));
process.exitCode = result.status ?? (result.error ? 1 : 0);
