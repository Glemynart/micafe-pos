import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import { resolve } from "node:path";
import { detenerEmuladoresDemo, exigirProjectIdEmulador, prepararParametrosDusemaEmulador } from "./emulator-preflight.mjs";

const projectId = process.env.OPERATOR_PORTAL_PROJECT_ID ?? "demo-operator-portal";
exigirProjectIdEmulador(projectId, "demo-");
const runId = process.env.OPERATOR_PORTAL_RUN_ID ?? `operator-portal-${Date.now()}`;
const evidenceDir = resolve(process.env.OPERATOR_PORTAL_EVIDENCE_DIR ?? `artifacts/e2e/operator-portal/${runId}`);
mkdirSync(evidenceDir, { recursive: true });

const env = {
  ...process.env,
  GCLOUD_PROJECT: projectId,
  OPERATOR_PORTAL_PROJECT_ID: projectId,
  OPERATOR_PORTAL_RUN_ID: runId,
  OPERATOR_PORTAL_EVIDENCE_DIR: evidenceDir,
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  NEXT_PUBLIC_USE_EMULATORS: "1",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyDUMMY0000000000000000000000000000",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "000000000000",
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? `1:000000000000:web:${projectId}`,
  OPERATIONAL_PIN_PEPPER: process.env.OPERATIONAL_PIN_PEPPER ?? "operator-portal-e2e-pepper",
};

function obtenerCodebasesFunctions() {
  const configuracion = JSON.parse(readFileSync(resolve("firebase.json"), "utf8"));
  if (!Array.isArray(configuracion.functions)) {
    throw new Error("firebase.json debe declarar los codebases de Functions como una lista.");
  }
  const codebases = configuracion.functions.map(({ source }) => source);
  if (codebases.some((source) => typeof source !== "string" || !source)) {
    throw new Error("Cada codebase de Functions debe declarar un source válido.");
  }
  return [...new Set(codebases)];
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const codebasesFunctions = obtenerCodebasesFunctions();
const compilaciones = codebasesFunctions.map((codebase) => ({
  codebase,
  resultado: spawnSync(npm, ["--prefix", codebase, "run", "build"], {
    cwd: process.cwd(), env, encoding: "utf8", shell: process.platform === "win32",
  }),
}));
const logCompilacion = compilaciones.map(({ codebase, resultado }) => [
  `===== ${codebase} =====`,
  resultado.stdout ?? "",
  resultado.stderr ?? "",
  resultado.error?.message ?? "",
].join("\n")).join("\n");
writeFileSync(resolve(evidenceDir, "functions-build.log"), `${logCompilacion}\n`);
if (logCompilacion) process.stdout.write(`${logCompilacion}\n`);
if (compilaciones.some(({ resultado }) => resultado.status !== 0 || resultado.error)) {
  writeFileSync(resolve(evidenceDir, "result.json"), `${JSON.stringify({ projectId, runId, exitCode: 1 }, null, 2)}\n`);
  throw new Error("La compilación de uno o más codebases de Functions falló.");
}

function puertoEnUso(port) {
  return new Promise((resolvePort) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolvePort(true); });
    socket.once("error", () => resolvePort(false));
  });
}

const estados = await Promise.all([5001, 8085, 9099].map(puertoEnUso));
const permitirReutilizacion = process.env.OPERATOR_PORTAL_REUSE_EMULATORS === "1";
const usarExistentes = permitirReutilizacion && estados.every(Boolean);
writeFileSync(resolve(evidenceDir, "emulator-preflight.json"), `${JSON.stringify({
  projectId,
  reusedExistingEmulators: usarExistentes,
  ports: { functions: estados[0], firestore: estados[1], auth: estados[2] },
}, null, 2)}\n`);

if (estados.some(Boolean) && !estados.every(Boolean)) {
  throw new Error(`E2E de Portal detecto puertos ocupados sin el conjunto completo de emuladores: ${JSON.stringify(estados)}`);
}
if (estados.every(Boolean) && !permitirReutilizacion) {
  throw new Error("E2E de Portal detecto emuladores ya iniciados; usa OPERATOR_PORTAL_REUSE_EMULATORS=1 para reutilizarlos de forma explicita.");
}

const ejecutar = () => spawnSync(process.execPath, ["scripts/e2e/operator-portal-inner.mjs"], {
  cwd: process.cwd(), env, stdio: "inherit",
});
let result;
let limpiarParametrosDusema;
try {
  if (!usarExistentes) limpiarParametrosDusema = prepararParametrosDusemaEmulador();
  result = usarExistentes
    ? ejecutar()
    : spawnSync(process.execPath, [
        resolve("node_modules", "firebase-tools", "lib", "bin", "firebase.js"),
        "emulators:exec", "--only", "auth,firestore,functions", "--project", projectId,
        "node scripts/e2e/operator-portal-inner.mjs",
      ], { cwd: process.cwd(), env, stdio: "inherit" });
} finally {
  limpiarParametrosDusema?.();
}

if (existsSync("firebase-debug.log")) copyFileSync("firebase-debug.log", resolve(evidenceDir, "firebase-emulator.log"));
if (result.error) writeFileSync(resolve(evidenceDir, "launcher-error.txt"), result.error.stack ?? String(result.error));
const exitCode = result.status ?? (result.error ? 1 : 0);
if (!usarExistentes) {
  await new Promise((resolveCleanup) => setTimeout(resolveCleanup, 1_000));
  detenerEmuladoresDemo(projectId);
}
writeFileSync(resolve(evidenceDir, "result.json"), `${JSON.stringify({
  projectId,
  runId,
  exitCode,
  reusedExistingEmulators: usarExistentes,
}, null, 2)}\n`);
process.exitCode = exitCode;
