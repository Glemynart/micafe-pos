import * as dotenv from "dotenv"
import * as fs from "node:fs"
import { dirname, resolve } from "node:path"
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import {
  crearJournalPreparado,
  ejecutarCierreConJournal,
  hashManifest,
  planificarCierre,
  prepararRecoveryBundle,
  sha256,
  verificarRecoveryBundle,
  type CierreManifest,
  type EventoCierreRow,
  type JournalCierre,
  type StorageCierreRow,
} from "./eventos-legacy-closure-core"

dotenv.config({ path: ".env.local" })

function argumento(nombre: string): string | undefined {
  const index = process.argv.indexOf(nombre)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`${nombre} requiere un valor.`)
  return value
}

function cargarCuentaServicio(): object | undefined {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT
  if (inline) {
    const parsed = JSON.parse(inline) as { type?: unknown }
    if (parsed.type === "authorized_user") throw new Error("FIREBASE_SERVICE_ACCOUNT no puede ser una credencial authorized_user.")
    return parsed
  }
  const rutas = [process.env.FIREBASE_SERVICE_ACCOUNT_PATH, process.env.GOOGLE_APPLICATION_CREDENTIALS, "./service-account.local.json"]
    .filter(Boolean) as string[]
  for (const ruta of rutas) {
    if (!fs.existsSync(ruta)) continue
    const parsed = JSON.parse(fs.readFileSync(ruta, "utf8")) as { type?: unknown }
    if (parsed.type === "authorized_user") return undefined
    return parsed
  }
  return undefined
}

function crearDb(bucket?: string): Firestore {
  if (!getApps().length) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-b3-eventos-closure-e2e", storageBucket: bucket })
    } else {
      const cuenta = cargarCuentaServicio()
      initializeApp({
        credential: cuenta ? cert(cuenta) : applicationDefault(),
        projectId: process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT,
        storageBucket: bucket,
      })
    }
  }
  return getFirestore()
}

function escribirJson(path: string, value: unknown): void {
  const resolved = resolve(path)
  fs.mkdirSync(dirname(resolved), { recursive: true })
  const content = `${JSON.stringify(value, null, 2)}\n`
  fs.writeFileSync(resolved, content, "utf8")
  fs.writeFileSync(`${resolved}.sha256`, `${sha256(content)}  ${resolved}\n`, "utf8")
}

async function leerEventos(db: Firestore): Promise<EventoCierreRow[]> {
  const snapshot = await db.collection("eventos").get()
  return snapshot.docs
    .map((doc) => {
      const metadataSnapshot = doc as unknown as { createTime?: { toDate?: () => Date }; updateTime?: { toDate?: () => Date }; readTime?: { toDate?: () => Date } }
      return {
        id: doc.id,
        data: doc.data() as Record<string, unknown>,
        metadata: {
          documentPath: doc.ref.path,
          createTime: metadataSnapshot.createTime?.toDate?.()?.toISOString(),
          updateTime: metadataSnapshot.updateTime?.toDate?.()?.toISOString(),
          readTime: metadataSnapshot.readTime?.toDate?.()?.toISOString(),
        },
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

async function leerObjetosStorage(bucketName: string): Promise<StorageCierreRow[]> {
  const [files] = await getStorage().bucket(bucketName).getFiles()
  return files
    .filter((file) => /^(?:public\/)?eventos\//.test(file.name))
    .map((file) => {
      const metadata = file.metadata as Record<string, unknown>
      const numberSize = typeof metadata.size === "string" ? Number(metadata.size) : metadata.size
      return {
        bucket: bucketName,
        path: file.name,
        size: typeof numberSize === "number" ? numberSize : undefined,
        contentType: typeof metadata.contentType === "string" ? metadata.contentType : undefined,
        generation: typeof metadata.generation === "string" ? metadata.generation : undefined,
        metageneration: typeof metadata.metageneration === "string" ? metadata.metageneration : undefined,
        md5Hash: typeof metadata.md5Hash === "string" ? metadata.md5Hash : undefined,
        crc32c: typeof metadata.crc32c === "string" ? metadata.crc32c : undefined,
        updated: typeof metadata.updated === "string" ? metadata.updated : undefined,
        file,
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}

async function cargarBytes(bucket: string, rows: StorageCierreRow[]): Promise<StorageCierreRow[]> {
  const result: StorageCierreRow[] = []
  for (const row of rows) {
    const file = (row as StorageCierreRow & { file?: { download: () => Promise<[Buffer]> } }).file
    if (!file) throw new Error(`No hay manejador Storage para ${bucket}::${row.path}`)
    const [bytes] = await file.download()
    result.push({ ...row, bytes })
  }
  return result
}

function validarArgumentos(): { manifestPath: string; outputPath: string; journalPath: string; recoveryPath: string; execute: boolean } {
  const args = process.argv.slice(2)
  const permitidos = new Set(["--dry-run", "--execute", "--manifest", "--out", "--journal", "--recovery"])
  for (const arg of args) if (arg.startsWith("--") && !permitidos.has(arg)) throw new Error(`Argumento no soportado: ${arg}`)
  const execute = args.includes("--execute")
  if (execute === args.includes("--dry-run")) throw new Error("Use exactamente uno de --dry-run o --execute.")
  const manifestPath = argumento("--manifest")
  if (!manifestPath) throw new Error("--manifest es obligatorio.")
  if (execute) {
    const storageEmulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? process.env.STORAGE_EMULATOR_HOST
    const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? ""
    if (!process.env.FIRESTORE_EMULATOR_HOST || !storageEmulator) {
      throw new Error("La eliminaciÃ³n exige Firestore y Storage Emulator; no se permiten escrituras productivas.")
    }
    if (!projectId.startsWith("demo-b3-eventos-closure-")) {
      throw new Error("La eliminaciÃ³n solo admite proyectos demo-b3-eventos-closure-*.")
    }
  }
  if (execute && !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("La eliminaciÃ³n estÃ¡ deshabilitada fuera de Firebase Emulator; esta implementaciÃ³n no ejecuta escrituras productivas.")
  }
  return {
    manifestPath,
    outputPath: argumento("--out") ?? "artifacts/b3-eventos-closure/closure-plan.json",
    journalPath: argumento("--journal") ?? "artifacts/b3-eventos-closure/journal.json",
    recoveryPath: argumento("--recovery") ?? "artifacts/b3-eventos-closure/recovery-bundle.json",
    execute,
  }
}

async function main(): Promise<void> {
  const options = validarArgumentos()
  const manifest = JSON.parse(fs.readFileSync(resolve(options.manifestPath), "utf8")) as CierreManifest
  const bucket = manifest.bucket
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "desconocido"
  if (manifest.projectId !== projectId) throw new Error(`El proyecto del manifiesto (${manifest.projectId}) no coincide con el proyecto activo (${projectId}).`)
  const db = crearDb(bucket)
  const [eventos, storageRows] = await Promise.all([leerEventos(db), leerObjetosStorage(bucket)])
  const plan = planificarCierre(manifest, eventos, storageRows, options.execute ? "EXECUTE" : "DRY_RUN")
  const journal = crearJournalPreparado(plan)
  escribirJson(options.outputPath, plan)
  escribirJson(options.journalPath, journal)

  let recoveryVerification: ReturnType<typeof verificarRecoveryBundle> | undefined
  if (plan.safeToExecute) {
    const event = eventos.find((item) => item.id === manifest.eventos[0].eventoId)
    if (!event) throw new Error("El Evento desapareciÃ³ despuÃ©s de la revalidaciÃ³n.")
    const selected = new Set(manifest.assets.map((asset) => `${asset.bucket}::${asset.path}`))
    const selectedRows = storageRows.filter((row) => selected.has(`${row.bucket ?? bucket}::${row.path}`))
    const rowsWithBytes = await cargarBytes(bucket, selectedRows)
    const bundle = prepararRecoveryBundle(plan, manifest, event, rowsWithBytes)
    recoveryVerification = verificarRecoveryBundle(bundle)
    if (!recoveryVerification.ok) throw new Error(`Recovery no verificable: ${recoveryVerification.errors.join("; ")}`)
    escribirJson(options.recoveryPath, bundle)
  }

  let finalJournal: JournalCierre = journal
  if (options.execute) {
    const recovery = JSON.parse(fs.readFileSync(resolve(options.recoveryPath), "utf8"))
    const verified = verificarRecoveryBundle(recovery)
    if (!verified.ok) throw new Error("El bundle de recovery no pasÃ³ la verificaciÃ³n antes de ejecutar.")
    const storage = getStorage()
    finalJournal = await ejecutarCierreConJournal(plan, journal, {
      deleteEvent: async (eventId) => {
        const ref = db.collection("eventos").doc(eventId)
        const snapshot = await ref.get()
        if (!snapshot.exists) return false
        await ref.delete()
        return true
      },
      deleteAsset: async (bucketName, path) => {
        const file = storage.bucket(bucketName).file(path)
        const [exists] = await file.exists()
        if (!exists) return false
        await file.delete()
        return true
      },
      persistJournal: async (next) => escribirJson(options.journalPath, next),
    })
    escribirJson(options.journalPath, finalJournal)
  }

  escribirJson(options.outputPath.replace(/\.json$/i, "-evidence.json"), {
    ...plan,
    manifestPath: resolve(options.manifestPath),
    manifestSha256: hashManifest(manifest),
    recoveryPath: plan.safeToExecute ? resolve(options.recoveryPath) : undefined,
    recoveryVerification,
    journalPath: resolve(options.journalPath),
    journal: finalJournal,
    productionWrites: false,
  })
  process.stdout.write(`${JSON.stringify({
    projectId,
    modo: plan.modo,
    safeToExecute: plan.safeToExecute,
    wouldDelete: plan.wouldDelete,
    recoveryVerification,
    productionWrites: false,
    outputPath: resolve(options.outputPath),
  }, null, 2)}\n`)
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
