import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";

const projectId = process.env.E2E_P0_06_PROJECT_ID ?? "demo-p0-06-e2e";
const runId = process.env.E2E_P0_06_RUN_ID ?? `p0-06-${Date.now()}`;
const evidenceDir = resolve(process.env.E2E_P0_06_EVIDENCE_DIR ?? `artifacts/e2e/p0-06/${runId}`);
mkdirSync(evidenceDir, { recursive: true });

const env = { ...process.env };
delete env.GOOGLE_APPLICATION_CREDENTIALS;
Object.assign(env, {
  GCLOUD_PROJECT: projectId,
  E2E_P0_06_PROJECT_ID: projectId,
  E2E_P0_06_RUN_ID: runId,
  E2E_P0_06_EVIDENCE_DIR: evidenceDir,
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
});

function puertoEnUso(port) {
  return new Promise((resolvePort) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolvePort(true); });
    socket.once("error", () => resolvePort(false));
  });
}

const usarExistente = await puertoEnUso(8085);
const firebaseCli = resolve("node_modules", "firebase-tools", "lib", "bin", "firebase.js");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const command = usarExistente
  ? [npm, ["--prefix", "functions", "run", "test:p0-06:emulator"]]
  : [process.execPath, [firebaseCli, "emulators:exec", "--only", "firestore", "--project", projectId, "npm --prefix functions run test:p0-06:emulator"]];

const result = spawnSync(command[0], command[1], {
  cwd: process.cwd(),
  env,
  encoding: "utf8",
  stdio: "inherit",
  shell: usarExistente && process.platform === "win32",
});

if (existsSync("firebase-debug.log")) copyFileSync("firebase-debug.log", resolve(evidenceDir, "firebase-emulator.log"));
if (result.error) writeFileSync(resolve(evidenceDir, "launcher-error.txt"), result.error.stack ?? String(result.error));
writeFileSync(resolve(evidenceDir, "run-metadata.json"), `${JSON.stringify({
  runId,
  projectId,
  target: "firestore-emulator",
  reusedExistingEmulator: usarExistente,
  completedAt: new Date().toISOString(),
  exitCode: result.status ?? 1,
}, null, 2)}\n`);
process.exitCode = result.status ?? (result.error ? 1 : 0);
