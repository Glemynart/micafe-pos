import { spawnSync } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";

const projectId = "micafe-pos";
const env = {
  ...process.env,
  GCLOUD_PROJECT: projectId,
  OPERATIONAL_PIN_PEPPER: process.env.OPERATIONAL_PIN_PEPPER ?? "operator-portal-e2e-pepper",
};

const compilacion = spawnSync(process.execPath, [
  resolve("functions", "node_modules", "typescript", "bin", "tsc"), "-p", "functions/tsconfig.json",
], { cwd: process.cwd(), env, stdio: "inherit" });
if (compilacion.status !== 0) throw new Error("La compilación de Functions falló.");

function puertoEnUso(port) {
  return new Promise((resolvePort) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolvePort(true); });
    socket.once("error", () => resolvePort(false));
  });
}

const estados = await Promise.all([5001, 8085, 9099].map(puertoEnUso));
if (estados.some(Boolean) && !estados.every(Boolean)) throw new Error("E2E de Portal requiere Auth, Firestore y Functions en conjunto.");

const ejecutar = () => spawnSync(process.execPath, ["scripts/e2e/operator-portal-inner.mjs"], {
  cwd: process.cwd(), env, stdio: "inherit",
});
const result = estados.every(Boolean)
  ? ejecutar()
  : spawnSync(process.execPath, [
      resolve("node_modules", "firebase-tools", "lib", "bin", "firebase.js"),
      "emulators:exec", "--only", "auth,firestore,functions", "--project", projectId,
      "node scripts/e2e/operator-portal-inner.mjs",
    ], { cwd: process.cwd(), env, stdio: "inherit" });

process.exitCode = result.status ?? 1;
