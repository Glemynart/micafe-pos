import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("Purchase cut Emulator runner rejects application credentials.");
}

const projectId = "demo-purchase-cut";
const runId = `purchase-cut-${Date.now()}`;
const firebase = resolve("node_modules/firebase-tools/lib/bin/firebase.js");
const env = {
  ...process.env,
  GCLOUD_PROJECT: projectId,
  E2E_PURCHASE_CUT_PROJECT_ID: projectId,
  E2E_PURCHASE_CUT_RUN_ID: runId,
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
};
delete env.GOOGLE_APPLICATION_CREDENTIALS;

const result = spawnSync(process.execPath, [
  firebase,
  "emulators:exec",
  "--only", "firestore",
  "--project", projectId,
  "--config", "firebase.json",
  "node --import tsx --test functions/src/finanzas/purchase-cut.emulator.test.ts",
], { cwd: process.cwd(), env, stdio: "inherit" });

if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;
