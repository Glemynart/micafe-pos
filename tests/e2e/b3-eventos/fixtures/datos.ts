import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

export const B3_PROJECT_ID = process.env.E2E_B3_EVENTOS_PROJECT_ID ?? "demo-b3-eventos-e2e"
export const B3_RUN_ID = process.env.E2E_B3_EVENTOS_RUN_ID ?? "b3-eventos-local"
export const B3_EVIDENCE_DIR = resolve(process.env.E2E_B3_EVENTOS_EVIDENCE_DIR ?? `artifacts/e2e/b3-eventos/${B3_RUN_ID}`)

const EMPRESAS = {
  activa: "b3-empresa-activa",
  suspendida: "b3-empresa-suspendida",
} as const

const EVENTOS = {
  canonico: "b3-evento-canonico",
  canonicoHuerfano: "b3-evento-canonico-huerfano",
  legacyMapeado: "b3-evento-legacy-mapeado",
  legacySinMapeo: "b3-evento-legacy-sin-mapeo",
  legacyInvalido: "b3-evento-legacy-mapeo-invalido",
} as const

const ASSETS = {
  compartido: "eventos/b3-asset-compartido.png",
  canonico: "tenants/b3-empresa-activa/eventos/b3-evento-canonico/canonico.png",
  huerfano: "eventos/b3-asset-huerfano.png",
} as const

const BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? `${B3_PROJECT_ID}.firebasestorage.app`

function dbEmulador() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("B3 fixture solo admite Firestore Emulator.")
  const app = getApps().find((candidate) => candidate.name === "b3-eventos-e2e")
    ?? initializeApp({ projectId: B3_PROJECT_ID, storageBucket: BUCKET }, "b3-eventos-e2e")
  return getFirestore(app)
}

function storageEmulador() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("B3 fixture solo admite Firebase Emulator.")
  const app = getApps().find((candidate) => candidate.name === "b3-eventos-e2e")
    ?? initializeApp({ projectId: B3_PROJECT_ID, storageBucket: BUCKET }, "b3-eventos-e2e")
  return getStorage(app).bucket(BUCKET)
}

export async function prepararFixtureB3() {
  const db = dbEmulador()
  mkdirSync(B3_EVIDENCE_DIR, { recursive: true })
  await limpiarFixtureB3()

  await Promise.all([
    db.collection("empresas").doc(EMPRESAS.activa).set({ estado: "activa", slug: "b3-tenant-activa", runId: B3_RUN_ID }),
    db.collection("empresas").doc(EMPRESAS.suspendida).set({ estado: "suspendida", slug: "b3-tenant-suspendida", runId: B3_RUN_ID }),
    db.collection("eventos").doc(EVENTOS.canonico).set({ empresaId: EMPRESAS.activa, titulo: "Canónico", activo: true, runId: B3_RUN_ID }),
    db.collection("eventos").doc(EVENTOS.canonicoHuerfano).set({ empresaId: "empresa-inexistente", titulo: "Canónico huérfano", activo: true, runId: B3_RUN_ID }),
    db.collection("eventos").doc(EVENTOS.legacyMapeado).set({ titulo: "Legacy mapeable", activo: true, runId: B3_RUN_ID }),
    db.collection("eventos").doc(EVENTOS.legacySinMapeo).set({ titulo: "Legacy sin mapeo", activo: true, runId: B3_RUN_ID }),
    db.collection("eventos").doc(EVENTOS.legacyInvalido).set({ titulo: "Legacy inválido", activo: true, runId: B3_RUN_ID }),
  ])

  await Promise.all([
    db.collection("eventos").doc(EVENTOS.canonico).update({ imagenUrl: `gs://${BUCKET}/${ASSETS.canonico}` }),
    db.collection("eventos").doc(EVENTOS.legacyMapeado).update({ imagenUrl: `gs://${BUCKET}/${ASSETS.compartido}?token=fixture-a` }),
    db.collection("eventos").doc(EVENTOS.legacySinMapeo).update({ imagenUrl: `gs://${BUCKET}/${ASSETS.compartido}?token=fixture-b` }),
  ])

  const bucket = storageEmulador()
  await Promise.all(Object.values(ASSETS).map((path) => bucket.file(path).save(Buffer.from(`fixture:${path}`), {
    metadata: { contentType: "image/png" },
  })))

  writeFileSync(resolve(B3_EVIDENCE_DIR, "mapping.json"), `${JSON.stringify({
    schemaVersion: 1,
    mapeos: [
      { eventoId: EVENTOS.legacyMapeado, empresaId: EMPRESAS.activa, evidencia: "fixture autorizado B3-A" },
      { eventoId: EVENTOS.legacyInvalido, empresaId: "empresa-inexistente", evidencia: "fixture destino ausente" },
      { eventoId: "b3-evento-no-encontrado", empresaId: EMPRESAS.activa, evidencia: "fixture no encontrado" },
    ],
  }, null, 2)}\n`, "utf8")
}

export async function limpiarFixtureB3() {
  const db = dbEmulador()
  const bucket = storageEmulador()
  await Promise.all([
    ...Object.values(EVENTOS).map((id) => db.collection("eventos").doc(id).delete()),
    ...Object.values(EMPRESAS).map((id) => db.collection("empresas").doc(id).delete()),
    ...Object.values(ASSETS).map((path) => bucket.file(path).delete().catch(() => undefined)),
  ])
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("tests/e2e/b3-eventos/fixtures/datos.ts")) {
  prepararFixtureB3().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
