import * as dotenv from "dotenv"
import * as fs from "node:fs"
import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { createHash } from "node:crypto"
import { dirname, resolve } from "node:path"
import { construirReporteInventario, parsearMapeos, serializarReporte, type MapeoEventoLegacy } from "./eventos-legacy-inventory"

dotenv.config({ path: ".env.local" })

function argumento(nombre: string): string | undefined {
  const index = process.argv.indexOf(nombre)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`${nombre} requiere un valor.`)
  return value
}

function cargarCuentaServicio(): object {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT
  if (inline) return JSON.parse(inline)
  const rutas = [process.env.FIREBASE_SERVICE_ACCOUNT_PATH, process.env.GOOGLE_APPLICATION_CREDENTIALS, "./service-account.local.json"]
    .filter(Boolean) as string[]
  for (const ruta of rutas) if (fs.existsSync(ruta)) return JSON.parse(fs.readFileSync(ruta, "utf8"))
  throw new Error("No se encontró una cuenta de servicio para la lectura dry-run.")
}

function crearDb() {
  if (!getApps().length) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-b3-eventos-e2e" })
    } else {
      initializeApp({ credential: cert(cargarCuentaServicio()) })
    }
  }
  return getFirestore()
}

function validarArgumentos(): { mappingPath?: string; outputPath: string } {
  const args = process.argv.slice(2)
  if (args.includes("--execute")) throw new Error("B3-A es exclusivamente dry-run y no admite --execute.")
  if (!args.includes("--dry-run")) throw new Error("B3-A requiere --dry-run explícito.")
  const permitidos = new Set(["--dry-run", "--mapping", "--out"])
  for (const arg of args) {
    if (arg.startsWith("--") && !permitidos.has(arg)) throw new Error(`Argumento no soportado: ${arg}`)
  }
  const outputPath = argumento("--out")
  return {
    mappingPath: argumento("--mapping"),
    outputPath: outputPath ?? "artifacts/b3-eventos/legacy-inventory.json",
  }
}

async function main(): Promise<void> {
  const { mappingPath, outputPath } = validarArgumentos()
  const mapeos: MapeoEventoLegacy[] = mappingPath
    ? parsearMapeos(JSON.parse(fs.readFileSync(mappingPath, "utf8")))
    : []
  const db = crearDb()
  const [eventos, empresas] = await Promise.all([
    leerColeccion(db, "eventos"),
    leerColeccion(db, "empresas"),
  ])
  const reporte = construirReporteInventario(
    eventos,
    empresas,
    mapeos,
    {
      projectId: process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "desconocido",
      entorno: process.env.FIRESTORE_EMULATOR_HOST ? "EMULATOR" : "CONFIGURADO",
    },
  )
  const contenido = serializarReporte({
    ...reporte,
    // generatedAt is evidence metadata only; the pure classifier remains deterministic.
    generatedAt: new Date().toISOString(),
  } as typeof reporte & { generatedAt: string })
  const resolvedOutputPath = resolve(outputPath)
  fs.mkdirSync(dirname(resolvedOutputPath), { recursive: true })
  fs.writeFileSync(resolvedOutputPath, contenido, "utf8")
  fs.writeFileSync(`${resolvedOutputPath}.sha256`, `${createHash("sha256").update(contenido).digest("hex")}  ${resolvedOutputPath}\n`, "utf8")
  process.stdout.write(`${JSON.stringify({ ...reporte.totales, outputPath: resolvedOutputPath, productionWrites: false }, null, 2)}\n`)
}

const PAGE_SIZE = 500

async function leerColeccion(db: FirebaseFirestore.Firestore, nombre: string) {
  const documentos: { id: string; data: FirebaseFirestore.DocumentData }[] = []
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined
  while (true) {
    let query = db.collection(nombre).orderBy("__name__").limit(PAGE_SIZE)
    if (cursor) query = query.startAfter(cursor)
    const snapshot = await query.get()
    if (snapshot.empty) break
    documentos.push(...snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() })))
    cursor = snapshot.docs[snapshot.docs.length - 1]
    if (snapshot.size < PAGE_SIZE) break
  }
  return documentos
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
