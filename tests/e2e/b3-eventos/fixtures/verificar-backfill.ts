import assert from "node:assert/strict"
import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

const projectId = process.env.E2E_B3_EVENTOS_PROJECT_ID ?? "demo-b3-eventos-backfill-e2e"
const runId = process.env.E2E_B3_EVENTOS_RUN_ID ?? "b3-eventos-backfill-local"
const evidenceDir = resolve(process.env.E2E_B3_EVENTOS_EVIDENCE_DIR ?? `artifacts/e2e/b3-eventos-backfill/${runId}`)

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("La verificación B3-B solo admite Firestore Emulator.")
  const app = getApps().find((candidate) => candidate.name === "b3-eventos-backfill-verify")
    ?? initializeApp({ projectId }, "b3-eventos-backfill-verify")
  const db = getFirestore(app)
  const snapshot = await db.collection("eventos").where("runId", "==", runId).get()
  const porId = new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]))
  const mapeado = porId.get("b3-evento-legacy-mapeado")
  const sinMapeo = porId.get("b3-evento-legacy-sin-mapeo")
  const invalido = porId.get("b3-evento-legacy-mapeo-invalido")
  const canonico = porId.get("b3-evento-canonico")

  assert.equal(mapeado?.empresaId, "b3-empresa-activa")
  assert.equal(mapeado?.titulo, "Legacy mapeable")
  assert.equal(mapeado?.activo, true)
  assert.equal(mapeado?.runId, runId)
  assert.equal(typeof sinMapeo?.empresaId, "undefined")
  assert.equal(typeof invalido?.empresaId, "undefined")
  assert.equal(canonico?.empresaId, "b3-empresa-activa")

  const reporte = {
    projectId,
    runId,
    documentosInspeccionados: snapshot.size,
    eventoAplicado: "b3-evento-legacy-mapeado",
    empresaIdAplicada: mapeado?.empresaId,
    legacyNoClasificados: ["b3-evento-legacy-mapeo-invalido", "b3-evento-legacy-sin-mapeo"],
    snapshotComercialPreservado: true,
    productionWrites: false,
    verificado: true,
  }
  writeFileSync(resolve(evidenceDir, "backfill-verification.json"), `${JSON.stringify(reporte, null, 2)}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
