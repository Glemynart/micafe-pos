import { resolve } from "node:path"
import { spawnSync } from "node:child_process"

if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("E2E Bodega Agenda rechaza credenciales de aplicación; solo usa Firestore Emulator.")
}

const projectId = "demo-bodega-agenda"
const runId = `agenda-${Date.now()}`
const firebase = resolve("node_modules/firebase-tools/lib/bin/firebase.js")
const env = {
  ...process.env,
  GCLOUD_PROJECT: projectId,
  E2E_BODEGA_AGENDA_RUN_ID: runId,
}
delete env.GOOGLE_APPLICATION_CREDENTIALS

const result = spawnSync(process.execPath, [
  firebase,
  "emulators:exec",
  "--only", "firestore",
  "--project", projectId,
  "--config", "firebase.json",
  "node --import tsx --test functions/src/bodega-vendedor/emulator/agenda-pedidos.test.ts",
], { cwd: process.cwd(), env, stdio: "inherit" })

if (result.error) console.error(result.error)
process.exitCode = result.status ?? 1
