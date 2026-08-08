import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

const projectId = process.env.E2E_B3_EVENTOS_PROJECT_ID ?? "demo-b3-eventos-e2e"
const runId = process.env.E2E_B3_EVENTOS_RUN_ID ?? "b3-eventos-local"
const evidenceDir = resolve(process.env.E2E_B3_EVENTOS_EVIDENCE_DIR ?? `artifacts/e2e/b3-eventos/${runId}`)
const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${projectId}.firebasestorage.app`
const expectedAssetPaths = [
  "eventos/b3-asset-compartido.png",
  "eventos/b3-asset-huerfano.png",
  "tenants/b3-empresa-activa/eventos/b3-evento-canonico/canonico.png",
]

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("La verificación B3-A solo admite Firestore Emulator.")
  const app = getApps().find((candidate) => candidate.name === "b3-eventos-verify")
    ?? initializeApp({ projectId, storageBucket: bucketName }, "b3-eventos-verify")
  const snapshot = await getFirestore(app).collection("eventos").where("runId", "==", runId).get()
  const legacy = snapshot.docs.filter((doc) => typeof doc.data().empresaId !== "string")
  const [files] = await getStorage(app).bucket(bucketName).getFiles()
  const assetPaths = files.map((file) => file.name).filter((path) => expectedAssetPaths.includes(path)).sort()
  const reporte = {
    projectId,
    runId,
    documentosInspeccionados: snapshot.size,
    legacySinEmpresaId: legacy.map((doc) => doc.id).sort(),
    storageObjectsInspected: assetPaths,
    storageAssetsExpected: [...expectedAssetPaths].sort(),
    productionWrites: false,
    verificado: legacy.length > 0 && JSON.stringify(assetPaths) === JSON.stringify([...expectedAssetPaths].sort()),
  }
  writeFileSync(resolve(evidenceDir, "no-write-verification.json"), `${JSON.stringify(reporte, null, 2)}\n`)
  if (!reporte.verificado) throw new Error("B3-A fixture changed or lost an asset.")
  if (legacy.length === 0) throw new Error("La verificación esperaba conservar documentos legacy sin empresaId.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
