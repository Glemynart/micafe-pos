import { getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

export const B2_EVENTOS_PROJECT_ID = process.env.E2E_B2_EVENTOS_PROJECT_ID ?? "demo-b2-eventos-e2e"
export const B2_EVENTOS_RUN_ID = process.env.E2E_B2_EVENTOS_RUN_ID ?? "b2-eventos-local"
export const B2_PUBLIC_SLUG_A = process.env.E2E_B2_PUBLIC_SLUG ?? "b2-tenant-a"
export const B2_PUBLIC_SLUG_B = "b2-tenant-b"
export const B2_PUBLIC_SLUG_SUSPENDIDA = "b2-tenant-suspendida"
export const B2_PUBLIC_SLUG_AMBIGUA = "b2-tenant-ambigua"

const EMPRESAS = {
  a: "b2-eventos-empresa-a",
  b: "b2-eventos-empresa-b",
  suspendida: "b2-eventos-empresa-suspendida",
  ambiguaA: "b2-eventos-empresa-ambigua-a",
  ambiguaB: "b2-eventos-empresa-ambigua-b",
} as const

const EVENTOS = {
  a: "b2-evento-a-activo",
  aInactivo: "b2-evento-a-inactivo",
  b: "b2-evento-b-activo",
  suspendida: "b2-evento-suspendido-activo",
  legacy: "b2-evento-legacy-sin-empresa",
} as const

function exigirEmulador() {
  const host = process.env.FIRESTORE_EMULATOR_HOST
  if (!host?.startsWith("127.0.0.1:")) {
    throw new Error("B2 E2E requiere FIRESTORE_EMULATOR_HOST en localhost.")
  }
}

function dbEmulador() {
  exigirEmulador()
  const app = getApps().find((candidate) => candidate.name === "b2-eventos-e2e")
    ?? initializeApp({ projectId: B2_EVENTOS_PROJECT_ID }, "b2-eventos-e2e")
  return getFirestore(app)
}

function evento(empresaId: string, titulo: string, activo = true) {
  return {
    empresaId,
    titulo,
    descripcion: `${titulo} descripción`,
    fecha: "2099-01-01",
    hora: "10:00",
    categoria: "Taller",
    activo,
    creadoPor: "b2-e2e",
    runId: B2_EVENTOS_RUN_ID,
  }
}

export async function prepararFixtureB2() {
  const db = dbEmulador()
  await limpiarFixtureB2()

  await Promise.all([
    db.collection("empresas").doc(EMPRESAS.a).set({ empresaId: EMPRESAS.a, slug: B2_PUBLIC_SLUG_A, estado: "activa", nombre: "Tenant B2 A" }),
    db.collection("empresas").doc(EMPRESAS.b).set({ empresaId: EMPRESAS.b, slug: B2_PUBLIC_SLUG_B, estado: "trial", nombre: "Tenant B2 B" }),
    db.collection("empresas").doc(EMPRESAS.suspendida).set({ empresaId: EMPRESAS.suspendida, slug: B2_PUBLIC_SLUG_SUSPENDIDA, estado: "suspendida", nombre: "Tenant B2 Suspendido" }),
    db.collection("empresas").doc(EMPRESAS.ambiguaA).set({ empresaId: EMPRESAS.ambiguaA, slug: B2_PUBLIC_SLUG_AMBIGUA, estado: "activa", nombre: "Tenant B2 Ambiguo A" }),
    db.collection("empresas").doc(EMPRESAS.ambiguaB).set({ empresaId: EMPRESAS.ambiguaB, slug: B2_PUBLIC_SLUG_AMBIGUA, estado: "activa", nombre: "Tenant B2 Ambiguo B" }),
  ])

  await Promise.all([
    db.collection("eventos").doc(EVENTOS.a).set(evento(EMPRESAS.a, "Evento público A")),
    db.collection("eventos").doc(EVENTOS.aInactivo).set(evento(EMPRESAS.a, "Evento A inactivo", false)),
    db.collection("eventos").doc(EVENTOS.b).set(evento(EMPRESAS.b, "Evento público B")),
    db.collection("eventos").doc(EVENTOS.suspendida).set(evento(EMPRESAS.suspendida, "Evento suspendido")),
    db.collection("eventos").doc(EVENTOS.legacy).set({ titulo: "Evento legacy", activo: true, fecha: "2099-01-01", runId: B2_EVENTOS_RUN_ID }),
  ])
}

export async function limpiarFixtureB2() {
  const db = dbEmulador()
  await Promise.all(Object.values(EVENTOS).map((id) => db.collection("eventos").doc(id).delete()))
  await Promise.all(Object.values(EMPRESAS).map((id) => db.collection("empresas").doc(id).delete()))
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("tests/e2e/b2-eventos/fixtures/datos.ts")) {
  prepararFixtureB2().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
