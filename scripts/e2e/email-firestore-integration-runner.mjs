import { createServer } from "node:net";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectId = process.env.EMAIL_INTEGRATION_PROJECT_ID ?? "demo-mt-u4-rules";
if (!projectId.startsWith("demo-")) throw new Error("La integración Auth/Firestore solo admite un proyecto demo-.");
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("La integración Auth/Firestore rechaza credenciales productivas.");
}

function reservarPuerto() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("No se pudo reservar un puerto local.")));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });
}

const firestorePort = await reservarPuerto();
const authPort = await reservarPuerto();
const configPath = resolve("artifacts", "e2e", "email-firestore", `${projectId}-${process.pid}.firebase.json`);
mkdirSync(resolve("artifacts", "e2e", "email-firestore"), { recursive: true });
writeFileSync(configPath, `${JSON.stringify({
  firestore: { rules: resolve("firestore.rules"), indexes: resolve("firestore.indexes.json") },
  emulators: {
    firestore: { host: "127.0.0.1", port: firestorePort },
    auth: { host: "127.0.0.1", port: authPort },
  },
}, null, 2)}\n`);

const env = { ...process.env };
for (const key of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_SERVICE_ACCOUNT", "FIREBASE_CONFIG"]) delete env[key];
Object.assign(env, {
  GCLOUD_PROJECT: projectId,
  FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
  FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
});

const firebaseCli = resolve("node_modules", "firebase-tools", "lib", "bin", "firebase.js");
const result = spawnSync(process.execPath, [
  firebaseCli,
  "emulators:exec",
  "--only", "firestore,auth",
  "--config", configPath,
  "--project", projectId,
  "npm --prefix functions run test:email:integration",
], { cwd: process.cwd(), env, stdio: "inherit" });

rmSync(configPath, { force: true });
process.exitCode = result.status ?? (result.error ? 1 : 0);
