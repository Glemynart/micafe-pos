import { rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"

const projectId = "demo-bodega-u4-u5-ui"
const runId = `bodega-ui-${Date.now()}`
const config = resolve(`.firebase.bodega-${runId}.json`)
writeFileSync(config, JSON.stringify({
  functions: [{ source: "functions", codebase: "saas-auth" }],
  firestore: { rules: "firestore.rules", indexes: "firestore.indexes.json" },
  emulators: { functions: { host: "127.0.0.1", port: 5001 }, firestore: { host: "127.0.0.1", port: 8085 }, auth: { host: "127.0.0.1", port: 9099 }, singleProjectMode: true },
}, null, 2))

const env = {
  ...process.env,
  GCLOUD_PROJECT: projectId,
  E2E_BODEGA_PROJECT_ID: projectId,
  E2E_BODEGA_RUN_ID: runId,
  E2E_BODEGA_OUTPUT_DIR: resolve(process.env.TEMP ?? ".", `bodega-u4-u5-${runId}`),
  E2E_R1A_PROJECT_ID: projectId,
  E2E_R1A_RUN_ID: runId,
  OPERATIONAL_PIN_PEPPER: "bodega-u4-u5-local-pepper",
  NEXT_PUBLIC_USE_EMULATORS: "1",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyDUMMY0000000000000000000000000000",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.firebasestorage.app`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  NEXT_PUBLIC_FIREBASE_APP_ID: `1:000000000000:web:${projectId}`,
  FIREBASE_FUNCTIONS_EMULATOR_HOST: "127.0.0.1:5001",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT: "5001",
  NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: "8085",
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT: "9099",
}

const occupied = spawnSync(process.platform === "win32" ? "powershell.exe" : "sh", process.platform === "win32" ? ["-NoProfile", "-Command", "@(5001,8085,9099,3010) | ForEach-Object { if (Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue) { Write-Output $_ } }"] : ["-c", "true"], { encoding: "utf8" })
if (occupied.stdout.trim()) throw new Error(`E2E Bodega requiere puertos libres; ocupados: ${occupied.stdout.trim()}`)

try {
  const build = spawnSync(process.execPath, [resolve("functions/node_modules/typescript/bin/tsc"), "-p", "functions/tsconfig.json"], { cwd: process.cwd(), env, stdio: "inherit" })
  if (build.status !== 0) throw new Error("Build Functions falló antes de E2E Bodega.")
  const firebase = resolve("node_modules/firebase-tools/lib/bin/firebase.js")
  const result = spawnSync(process.execPath, [firebase, "emulators:exec", "--only", "auth,firestore,functions", "--project", projectId, "--config", config, "node scripts/e2e/bodega-u4-u5-inner.mjs"], { cwd: process.cwd(), env, stdio: "inherit" })
  process.exitCode = result.status ?? (result.error ? 1 : 0)
} finally {
  rmSync(config, { force: true })
}
