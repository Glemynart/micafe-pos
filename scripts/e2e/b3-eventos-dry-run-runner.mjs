import { mkdirSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { createServer } from "node:net"
import { resolve } from "node:path"

const projectId = process.env.E2E_B3_EVENTOS_PROJECT_ID ?? "demo-b3-eventos-e2e"
const runId = process.env.E2E_B3_EVENTOS_RUN_ID ?? `b3-eventos-${Date.now()}`
const evidenceDir = resolve(process.env.E2E_B3_EVENTOS_EVIDENCE_DIR ?? `artifacts/e2e/b3-eventos/${runId}`)

if (!projectId.startsWith("demo-b3-eventos-")) throw new Error("B3 E2E solo admite proyectos demo-b3-eventos-*.")
if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("B3 E2E rechaza credenciales productivas.")
}

mkdirSync(evidenceDir, { recursive: true })
const reservarPuerto = () => new Promise((resolvePort, reject) => {
  const server = createServer()
  server.once("error", reject)
  server.listen(0, "127.0.0.1", () => {
    const address = server.address()
    if (!address || typeof address === "string") {
      server.close(() => reject(new Error("No se pudo reservar el puerto de Firestore Emulator.")))
      return
    }
    server.close(() => resolvePort(address.port))
  })
})
const firestorePort = await reservarPuerto()
const storagePort = await reservarPuerto()

const firebaseConfigPath = resolve(evidenceDir, "firebase-config.json")
writeFileSync(firebaseConfigPath, `${JSON.stringify({
  firestore: { rules: resolve("firestore.rules"), indexes: resolve("firestore.indexes.json") },
  storage: { rules: resolve("storage.rules") },
  emulators: {
    firestore: { host: "127.0.0.1", port: firestorePort },
    storage: { host: "127.0.0.1", port: storagePort },
  },
}, null, 2)}\n`)

const env = { ...process.env }
for (const key of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_SERVICE_ACCOUNT", "FIREBASE_CONFIG"]) delete env[key]
Object.assign(env, {
  GCLOUD_PROJECT: projectId,
  E2E_B3_EVENTOS_PROJECT_ID: projectId,
  E2E_B3_EVENTOS_RUN_ID: runId,
  E2E_B3_EVENTOS_EVIDENCE_DIR: evidenceDir,
  FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
  FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${storagePort}`,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.firebasestorage.app`,
})

const firebaseCli = resolve("node_modules", "firebase-tools", "lib", "bin", "firebase.js")
const result = spawnSync(process.execPath, [
  firebaseCli,
  "emulators:exec",
  "--only",
  "firestore,storage",
  "--config",
  firebaseConfigPath,
  "--project",
  projectId,
  "node scripts/e2e/b3-eventos-dry-run-inner.mjs",
], { cwd: process.cwd(), env, stdio: "inherit" })

writeFileSync(resolve(evidenceDir, "runner-metadata.json"), `${JSON.stringify({
  goal: "G-MVP-01",
  milestone: "M4",
  epic: "E4.2",
  projectId,
  runId,
  target: "Firebase Emulator Suite only",
  productionWrites: false,
  exitCode: result.status ?? 1,
  completedAt: new Date().toISOString(),
}, null, 2)}\n`)
process.exitCode = result.status ?? 1
