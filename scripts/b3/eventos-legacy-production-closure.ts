import * as fs from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"
import type { Timestamp } from "@google-cloud/firestore"
import {
  construirInventarioAssets,
  type EventoLegacyRow,
} from "./eventos-legacy-inventory"
import {
  hashManifest,
  hashSnapshotCompleto,
  normalizarFingerprint,
  planificarCierre,
  prepararRecoveryBundle,
  sha256,
  verificarRecoveryBundle,
  type CierreManifest,
  type EventoCierreRow,
  type StorageCierreRow,
} from "./eventos-legacy-closure-core"
import {
  crearJournalProduccion,
  ejecutarCierreProduccion,
  PRODUCTION_BUCKET,
  PRODUCTION_PROJECT_ID,
  validarManifiestoProduccion,
  validarRutaArtifactoExterna,
  validarRuntimeProduccion,
  type ProductionHandlerResult,
  type ProductionJournal,
} from "./eventos-legacy-production-closure-core"

type StorageFileLike = {
  name: string
  metadata: Record<string, unknown>
  download: () => Promise<[Buffer]>
  getMetadata: () => Promise<[Record<string, unknown>]>
  delete: (options?: { ifGenerationMatch?: string | number }) => Promise<unknown>
}

type ParsedOptions = {
  manifestPath: string
  outputPath: string
  journalPath: string
  recoveryPath: string
  confirmation: string
}

const FINGERPRINT_FIELDS = ["generation", "metageneration", "size", "contentType", "md5Hash", "crc32c", "updated"] as const

function argumento(nombre: string): string | undefined {
  const index = process.argv.indexOf(nombre)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`${nombre} requiere un valor.`)
  return value
}

function parsearArgumentos(): ParsedOptions {
  const args = process.argv.slice(2)
  const permitidos = new Set(["--execute", "--manifest", "--out", "--journal", "--recovery", "--confirm-production"])
  for (const arg of args) {
    if (arg.startsWith("--") && !permitidos.has(arg)) throw new Error(`Argumento no soportado: ${arg}`)
  }
  if (!args.includes("--execute")) throw new Error("La herramienta productiva exige --execute explícito.")
  const manifestPath = argumento("--manifest")
  const outputPath = argumento("--out")
  const journalPath = argumento("--journal")
  const recoveryPath = argumento("--recovery")
  const confirmation = argumento("--confirm-production")
  if (!manifestPath || !outputPath || !journalPath || !recoveryPath || !confirmation) {
    throw new Error("--manifest, --out, --journal, --recovery y --confirm-production son obligatorios.")
  }
  return { manifestPath, outputPath, journalPath, recoveryPath, confirmation }
}

function encontrarRaizGit(start: string): string | undefined {
  let current = resolve(start)
  while (true) {
    if (fs.existsSync(join(current, ".git"))) return current
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

function escribirJsonAtomico(path: string, value: unknown): void {
  const resolved = resolve(path)
  fs.mkdirSync(dirname(resolved), { recursive: true })
  const content = `${JSON.stringify(value, null, 2)}\n`
  const temporary = `${resolved}.${process.pid}.tmp`
  fs.writeFileSync(temporary, content, "utf8")
  fs.renameSync(temporary, resolved)
  fs.writeFileSync(`${resolved}.sha256`, `${sha256(content)}  ${resolved}\n`, "utf8")
}

function metadataDate(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return (value.toDate as () => Date)().toISOString()
  }
  return undefined
}

async function leerEventos(db: Firestore): Promise<EventoCierreRow[]> {
  const snapshot = await db.collection("eventos").get()
  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      data: doc.data() as Record<string, unknown>,
      metadata: {
        documentPath: doc.ref.path,
        createTime: metadataDate((doc as unknown as { createTime?: unknown }).createTime),
        updateTime: metadataDate((doc as unknown as { updateTime?: unknown }).updateTime),
        readTime: metadataDate((doc as unknown as { readTime?: unknown }).readTime),
      },
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

async function leerStorage(bucketName: string): Promise<Array<StorageCierreRow & { file: StorageFileLike }>> {
  const [files] = await getStorage().bucket(bucketName).getFiles()
  return files
    .filter((file) => /^(?:public\/)?eventos\//.test(file.name))
    .map((file) => {
      const metadata = file.metadata as Record<string, unknown>
      const size = typeof metadata.size === "string" ? Number(metadata.size) : metadata.size
      return {
        bucket: bucketName,
        path: file.name,
        size: typeof size === "number" ? size : undefined,
        contentType: typeof metadata.contentType === "string" ? metadata.contentType : undefined,
        generation: typeof metadata.generation === "string" ? metadata.generation : undefined,
        metageneration: typeof metadata.metageneration === "string" ? metadata.metageneration : undefined,
        md5Hash: typeof metadata.md5Hash === "string" ? metadata.md5Hash : undefined,
        crc32c: typeof metadata.crc32c === "string" ? metadata.crc32c : undefined,
        updated: typeof metadata.updated === "string" ? metadata.updated : undefined,
        file: file as unknown as StorageFileLike,
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}

function esLegacy(data: Record<string, unknown>): boolean {
  return !Object.prototype.hasOwnProperty.call(data, "empresaId")
}

function fingerprintEquals(expected: Record<string, unknown>, actual: Record<string, unknown>): boolean {
  return FINGERPRINT_FIELDS.every((field) => {
    if (expected[field] === undefined) return true
    return String(expected[field]) === String(actual[field])
  })
}

function obtenerTargetAsset(key: string, manifest: CierreManifest): CierreManifest["assets"][number] {
  const separator = key.indexOf("::")
  const bucket = key.slice(0, separator)
  const path = key.slice(separator + 2)
  const target = manifest.assets.find((candidate) => candidate.bucket === bucket && candidate.path === path)
  if (!target) throw new Error(`Asset fuera del manifiesto: ${key}`)
  return target
}

async function cargarBytes(
  rows: Array<StorageCierreRow & { file: StorageFileLike }>,
  manifest: CierreManifest,
): Promise<StorageCierreRow[]> {
  const selected = new Set(manifest.assets.map((asset) => `${asset.bucket}::${asset.path}`))
  const result: StorageCierreRow[] = []
  for (const row of rows) {
    if (!selected.has(`${row.bucket}::${row.path}`)) continue
    const [bytes] = await row.file.download()
    result.push({ ...row, bytes })
  }
  if (result.length !== 3) throw new Error("El recovery productivo no contiene exactamente tres assets.")
  return result
}

function handlersProduccion(
  db: Firestore,
  manifest: CierreManifest,
  bucket: ReturnType<ReturnType<typeof getStorage>["bucket"]>,
): {
  deleteEvent: (target: { key: string; expectedHash?: string }) => Promise<ProductionHandlerResult>
  deleteAsset: (target: { key: string }) => Promise<ProductionHandlerResult>
} {
  return {
    deleteEvent: async (target) => {
      const eventId = manifest.eventos[0].eventoId
      if (target.key !== eventId) throw new Error("El target Evento no coincide con el manifiesto.")
      const ref = db.collection("eventos").doc(eventId)
      const snapshot = await ref.get()
      if (!snapshot.exists) throw new Error("El Evento ya no existe con journal PREPARADO; revisión manual requerida.")
      const data = snapshot.data() as Record<string, unknown>
      if (!esLegacy(data)) throw new Error("El Evento tiene empresaId y no puede eliminarse.")
      const expectedHash = target.expectedHash ?? manifest.eventos[0].snapshotHash
      const actualHash = hashSnapshotCompleto(data)
      if (actualHash !== expectedHash) throw new Error("Drift del snapshot del Evento.")
      const updateTime = (snapshot as unknown as { updateTime?: Timestamp }).updateTime
      if (!updateTime) throw new Error("Firestore no entregó lastUpdateTime para la precondición.")
      await ref.delete({ lastUpdateTime: updateTime })
      return { estado: "ELIMINADO", motivo: "Evento legacy eliminado con lastUpdateTime coincidente." }
    },
    deleteAsset: async (target) => {
      const expected = obtenerTargetAsset(target.key, manifest)
      const separator = target.key.indexOf("::")
      const bucketName = target.key.slice(0, separator)
      const path = target.key.slice(separator + 2)
      const events = await leerEventos(db)
      const inventory = construirInventarioAssets(
        events.map(({ id, data }) => ({ id, data }) as EventoLegacyRow),
        [],
      )
      const references = inventory.referencias.filter((reference) => reference.bucket === bucketName && reference.path === path)
      if (references.length > 0) throw new Error(`El asset tiene referencias nuevas: ${references.map((reference) => reference.eventoId).join(",")}`)
      if (bucketName !== PRODUCTION_BUCKET) throw new Error("El bucket del target no está permitido.")
      const file = bucket.file(path) as unknown as StorageFileLike
      let metadata: Record<string, unknown>
      try {
        ;[metadata] = await file.getMetadata()
      } catch {
        throw new Error("El asset ya no existe con journal PREPARADO; revisión manual requerida.")
      }
      const actual = normalizarFingerprint({
        generation: typeof metadata.generation === "string" ? metadata.generation : undefined,
        metageneration: typeof metadata.metageneration === "string" ? metadata.metageneration : undefined,
        size: typeof metadata.size === "string"
          ? Number(metadata.size)
          : typeof metadata.size === "number"
            ? metadata.size
            : undefined,
        contentType: typeof metadata.contentType === "string" ? metadata.contentType : undefined,
        md5Hash: typeof metadata.md5Hash === "string" ? metadata.md5Hash : undefined,
        crc32c: typeof metadata.crc32c === "string" ? metadata.crc32c : undefined,
        updated: typeof metadata.updated === "string" ? metadata.updated : undefined,
      })
      if (!fingerprintEquals(expected.fingerprint, actual)) throw new Error(`Drift del fingerprint Storage: ${path}`)
      if (!expected.fingerprint.generation) throw new Error(`El asset no tiene generation: ${path}`)
      await file.delete({ ifGenerationMatch: expected.fingerprint.generation })
      return { estado: "ELIMINADO", motivo: "Asset legacy eliminado con generation coincidente y sin referencias." }
    },
  }
}

function crearDb(): Firestore {
  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId: PRODUCTION_PROJECT_ID,
      storageBucket: PRODUCTION_BUCKET,
    })
  }
  return getFirestore()
}

async function main(): Promise<void> {
  const options = parsearArgumentos()
  const manifest = JSON.parse(fs.readFileSync(resolve(options.manifestPath), "utf8")) as CierreManifest
  validarManifiestoProduccion(manifest)
  const manifestSha256 = hashManifest(manifest)
  validarRuntimeProduccion({
    ci: process.env.CI,
    githubActions: process.env.GITHUB_ACTIONS,
    stdinIsTTY: Boolean(process.stdin.isTTY),
    stdoutIsTTY: Boolean(process.stdout.isTTY),
    confirmation: options.confirmation,
  }, manifestSha256)

  const worktreeRoot = encontrarRaizGit(process.cwd())
  if (!worktreeRoot) throw new Error("No se pudo determinar el worktree; se rechaza la ejecución productiva.")
  const outputPath = validarRutaArtifactoExterna(options.outputPath, worktreeRoot)
  const journalPath = validarRutaArtifactoExterna(options.journalPath, worktreeRoot)
  const recoveryPath = validarRutaArtifactoExterna(options.recoveryPath, worktreeRoot)

  const db = crearDb()
  const bucket = getStorage().bucket(PRODUCTION_BUCKET)
  const [events, storageRows] = await Promise.all([leerEventos(db), leerStorage(PRODUCTION_BUCKET)])
  const plan = planificarCierre(manifest, events, storageRows, "EXECUTE")
  escribirJsonAtomico(outputPath, plan)
  if (!plan.safeToExecute) throw new Error("El preflight productivo no es seguro; no se preparará ningún borrado.")

  const event = events.find((candidate) => candidate.id === manifest.eventos[0].eventoId)
  if (!event) throw new Error("El Evento desapareció antes de preparar recovery.")
  const recovery = prepararRecoveryBundle(plan, manifest, event, await cargarBytes(storageRows, manifest))
  const recoveryVerification = verificarRecoveryBundle(recovery)
  if (!recoveryVerification.ok) throw new Error(`Recovery no verificable: ${recoveryVerification.errors.join("; ")}`)
  escribirJsonAtomico(recoveryPath, recovery)

  const journal = crearJournalProduccion(plan)
  escribirJsonAtomico(journalPath, journal)
  const handlers = handlersProduccion(db, manifest, bucket)
  const finalJournal = await ejecutarCierreProduccion(plan, journal, {
    ...handlers,
    persistJournal: async (nextJournal: ProductionJournal) => escribirJsonAtomico(journalPath, nextJournal),
  })
  escribirJsonAtomico(journalPath, finalJournal)
  const evidence = {
    schemaVersion: 1,
    contrato: "B3-B-eventos-legacy-production-closure",
    modo: "EXECUTE",
    projectId: PRODUCTION_PROJECT_ID,
    bucket: PRODUCTION_BUCKET,
    productionWrites: true,
    manifestSha256,
    planSha256: sha256(JSON.stringify(plan)),
    recoveryPath,
    journalPath,
    recoveryVerification,
    journal: finalJournal,
  }
  escribirJsonAtomico(outputPath.replace(/\.json$/i, "-evidence.json"), evidence)
  process.stdout.write(`${JSON.stringify({
    projectId: PRODUCTION_PROJECT_ID,
    bucket: PRODUCTION_BUCKET,
    productionWrites: true,
    journal: finalJournal.entries.map(({ kind, key, estado }) => ({ kind, key, estado })),
    outputPath,
  }, null, 2)}\n`)
  if (finalJournal.entries.some((entry) => entry.estado === "ABORTADO")) {
    throw new Error("El cierre productivo terminó con ABORTADO; no se procesaron los targets restantes.")
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
