import assert from "node:assert/strict"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import {
  crearJournalPreparado,
  ejecutarCierreConJournal,
  hashSnapshotCompleto,
  planificarCierre,
  prepararRecoveryBundle,
  recuperarBundle,
  verificarRecoveryBundle,
  type CierreManifest,
  type EventoCierreRow,
  type StorageCierreRow,
} from "../b3/eventos-legacy-closure-core"

const projectId = process.env.E2E_B3_CLOSURE_PROJECT_ID ?? "demo-b3-eventos-closure-e2e"
const runId = process.env.E2E_B3_CLOSURE_RUN_ID ?? "b3-closure-local"
const evidenceDir = resolve(process.env.E2E_B3_CLOSURE_EVIDENCE_DIR ?? `artifacts/e2e/b3-eventos-closure/${runId}`)
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`
const eventId = `closure-event-${runId}`
const canonicalId = `closure-canonical-${runId}`
const paths = ["eventos/closure-a.png", "eventos/closure-b.png", "eventos/closure-c.png"]

const app = getApps().find((candidate) => candidate.name === "b3-closure-e2e")
  ?? initializeApp({ projectId, storageBucket: bucketName }, "b3-closure-e2e")
const db = getFirestore(app)
const bucket = getStorage(app).bucket(bucketName)
const eventData = { titulo: "Evento de prueba sin valor comercial", activo: false, runId }

async function main(): Promise<void> {
await db.collection("eventos").doc(eventId).set(eventData)
await db.collection("eventos").doc(canonicalId).set({ empresaId: "tenant-canonico", titulo: "No tocar", activo: true, runId })
await Promise.all(paths.map((path, index) => bucket.file(path).save(Buffer.from(`closure:${index}:${runId}`), {
  metadata: { contentType: "image/png" },
})))

const files = await Promise.all(paths.map(async (path) => {
  const file = bucket.file(path)
  const [metadata] = await file.getMetadata()
  const [bytes] = await file.download()
  const size = typeof metadata.size === "string" ? Number(metadata.size) : metadata.size
  return {
    bucket: bucketName,
    path,
    size: typeof size === "number" ? size : undefined,
    contentType: typeof metadata.contentType === "string" ? metadata.contentType : undefined,
    generation: typeof metadata.generation === "string" ? metadata.generation : undefined,
    metageneration: typeof metadata.metageneration === "string" ? metadata.metageneration : undefined,
    md5Hash: typeof metadata.md5Hash === "string" ? metadata.md5Hash : undefined,
    crc32c: typeof metadata.crc32c === "string" ? metadata.crc32c : undefined,
    updated: typeof metadata.updated === "string" ? metadata.updated : undefined,
    bytes,
  } satisfies StorageCierreRow
}))

const manifest: CierreManifest = {
  schemaVersion: 1,
  contrato: "B3-B-eventos-legacy-closure",
  sourceReportSha256: "a".repeat(64),
  projectId,
  bucket: bucketName,
  decision: { razon: "PRUEBA_SIN_VALOR_COMERCIAL", evidencia: "fixture Emulator B3-026" },
  expectedCounts: { eventos: 1, assets: 3 },
  eventos: [{ eventoId: eventId, snapshotHash: hashSnapshotCompleto(eventData), motivo: "fixture de prueba", evidencia: "fixture Emulator B3-026" }],
  assets: files.map((file) => ({
    bucket: bucketName,
    path: file.path,
    fingerprint: {
      generation: file.generation,
      metageneration: file.metageneration,
      size: file.size,
      contentType: file.contentType,
      md5Hash: file.md5Hash,
      crc32c: file.crc32c,
      updated: file.updated,
    },
    motivo: "asset de prueba no referenciado",
    evidencia: "fixture Emulator B3-026",
  })) as CierreManifest["assets"],
}

const rows = [
  { id: eventId, data: eventData } satisfies EventoCierreRow,
  { id: canonicalId, data: { empresaId: "tenant-canonico", titulo: "No tocar", activo: true, runId } } satisfies EventoCierreRow,
]
const plan = planificarCierre(manifest, rows, files)
assert.equal(plan.safeToExecute, true)
assert.equal(plan.productionWrites, false)
assert.deepEqual(plan.wouldDelete.length, 4)
assert.equal(plan.excluded.eventosCanonicos, 1)

const drift = planificarCierre(manifest, [{ id: eventId, data: { ...eventData, titulo: "alterado" } }, rows[1]], files)
assert.equal(drift.safeToExecute, false)
assert.deepEqual(drift.wouldDelete, [])

const referenced = planificarCierre(manifest, [
  ...rows,
  { id: `closure-reference-${runId}`, data: { imagenUrl: `gs://${bucketName}/${paths[0]}` } },
], files)
assert.equal(referenced.safeToExecute, false)
assert.deepEqual(referenced.wouldDelete, [])

const bundle = prepararRecoveryBundle(plan, manifest, rows[0], files)
assert.equal(verificarRecoveryBundle(bundle).ok, true)
const journal = crearJournalPreparado(plan)
const firstRun = await ejecutarCierreConJournal(plan, journal, {
  deleteEvent: async (id) => {
    const ref = db.collection("eventos").doc(id)
    const snapshot = await ref.get()
    if (!snapshot.exists) return false
    await ref.delete()
    return true
  },
  deleteAsset: async (bucketId, path) => {
    const file = getStorage(app).bucket(bucketId).file(path)
    const [exists] = await file.exists()
    if (!exists) return false
    await file.delete()
    return true
  },
  persistJournal: async () => undefined,
})
assert.deepEqual(firstRun.entries.map((entry) => entry.estado), ["ELIMINADO", "ELIMINADO", "ELIMINADO", "ELIMINADO"])

const replay = await ejecutarCierreConJournal(plan, firstRun, {
  deleteEvent: async () => { throw new Error("replay no debe eliminar") },
  deleteAsset: async () => { throw new Error("replay no debe eliminar") },
  persistJournal: async () => undefined,
})
assert.deepEqual(replay.entries.map((entry) => entry.estado), firstRun.entries.map((entry) => entry.estado))

const recoveryResults = await recuperarBundle(bundle, {
  eventExists: async (id) => (await db.collection("eventos").doc(id).get()).exists,
  createEvent: async (id, data) => { await db.collection("eventos").doc(id).create(data) },
  assetExists: async (bucketId, path) => (await getStorage(app).bucket(bucketId).file(path).exists())[0],
  createAsset: async (bucketId, path, bytes, metadata) => { await getStorage(app).bucket(bucketId).file(path).save(bytes, { metadata }) },
})
assert.equal(recoveryResults.filter((item) => item.startsWith("RESTAURADO")).length, 4)
assert.equal((await db.collection("eventos").doc(canonicalId).get()).exists, true)

mkdirSync(evidenceDir, { recursive: true })
writeFileSync(resolve(evidenceDir, "closure-verification.json"), `${JSON.stringify({
  goal: "G-MVP-01",
  milestone: "M4",
  epic: "E4.2",
  contract: "B3-B-eventos-legacy-closure",
  projectId,
  targetCounts: { eventos: 1, assets: 3, total: 4 },
  checks: { allowlist: "PASS", canonicalExcluded: "PASS", drift: "PASS", references: "PASS", deletion: "PASS", replay: "PASS", recovery: "PASS" },
  productionWrites: false,
}, null, 2)}\n`)
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
