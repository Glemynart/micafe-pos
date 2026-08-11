import { createHash } from "node:crypto"
import {
  construirInventarioAssets,
  esRutaAssetEvento,
  type EventoLegacyRow,
  type StorageObjectRow,
} from "./eventos-legacy-inventory"

export const B3_CLOSURE_SCHEMA_VERSION: 1 = 1
export const B3_CLOSURE_CONTRACT: "B3-B-eventos-legacy-closure" = "B3-B-eventos-legacy-closure"

export type EventoCierreManifest = {
  eventoId: string
  snapshotHash: string
  motivo: string
  evidencia: string
}

export type StorageFingerprint = {
  generation?: string
  metageneration?: string
  size?: number
  contentType?: string
  md5Hash?: string
  crc32c?: string
  updated?: string
}

export type AssetCierreManifest = {
  bucket: string
  path: string
  fingerprint: StorageFingerprint
  motivo: string
  evidencia: string
}

export type CierreManifest = {
  schemaVersion: typeof B3_CLOSURE_SCHEMA_VERSION
  contrato: typeof B3_CLOSURE_CONTRACT
  sourceReportSha256: string
  projectId: string
  bucket: string
  decision: {
    razon: string
    evidencia: string
  }
  expectedCounts: {
    eventos: 1
    assets: 3
  }
  eventos: [EventoCierreManifest]
  assets: [AssetCierreManifest, AssetCierreManifest, AssetCierreManifest]
}

export type EventoCierreRow = EventoLegacyRow & {
  metadata?: Record<string, unknown>
}

export type StorageCierreRow = StorageObjectRow & {
  generation?: string
  metageneration?: string
  md5Hash?: string
  crc32c?: string
  updated?: string
  bytes?: Buffer
}

export type EstadoObjetivoCierre =
  | "PREPARADO"
  | "ELIMINADO"
  | "IDEMPOTENTE_NOOP"
  | "OMITIDO"
  | "ABORTADO"

export type ResultadoObjetivoCierre = {
  kind: "EVENTO" | "ASSET"
  key: string
  estado: EstadoObjetivoCierre
  motivo: string
  expectedHash?: string
  actualHash?: string
  referencias: string[]
}

export type PlanCierre = {
  schemaVersion: typeof B3_CLOSURE_SCHEMA_VERSION
  contrato: typeof B3_CLOSURE_CONTRACT
  modo: "DRY_RUN" | "EXECUTE"
  projectId: string
  bucket: string
  productionWrites: false
  safeToExecute: boolean
  manifestSha256: string
  sourceReportSha256: string
  exactCounts: {
    eventos: 1
    assets: 3
    total: 4
  }
  targets: ResultadoObjetivoCierre[]
  wouldDelete: Array<{ kind: "EVENTO" | "ASSET"; key: string }>
  excluded: {
    eventosCanonicos: number
    assetsReferenciados: number
    targetsFueraDeAllowlist: number
  }
  checks: Array<{ check: string; status: "PASS" | "FAIL"; detalle: string }>
  evidenceSha256: string
}

export type EntradaJournal = {
  kind: "EVENTO" | "ASSET"
  key: string
  estado: EstadoObjetivoCierre
  motivo: string
  operationId: string
}

export type JournalCierre = {
  schemaVersion: typeof B3_CLOSURE_SCHEMA_VERSION
  contrato: typeof B3_CLOSURE_CONTRACT
  operationId: string
  productionWrites: false
  entries: EntradaJournal[]
}

export type RecoveryBundle = {
  schemaVersion: typeof B3_CLOSURE_SCHEMA_VERSION
  contrato: typeof B3_CLOSURE_CONTRACT
  operationId: string
  manifestSha256: string
  planSha256: string
  productionWrites: false
  evento: {
    eventoId: string
    metadata: Record<string, unknown>
    data: Record<string, unknown>
    dataSha256: string
  }
  assets: Array<{
    bucket: string
    path: string
    metadata: Record<string, unknown>
    fingerprint: StorageFingerprint
    bytesBase64: string
    bytesSha256: string
  }>
}

export type RecoveryVerification = {
  ok: boolean
  errors: string[]
  assetCount: number
  eventoDataSha256?: string
}

function stable(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return { __timestamp: (value as { toDate: () => Date }).toDate().toISOString() }
  }
  if (Buffer.isBuffer(value)) return { __bufferBase64: value.toString("base64") }
  if (Array.isArray(value)) return value.map(stable)
  const object = value as Record<string, unknown>
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, stable(object[key])]))
}

function rehidratarTimestampsSerializados(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(rehidratarTimestampsSerializados)

  const object = value as Record<string, unknown>
  const keys = Object.keys(object).sort()
  if (
    keys.length === 2 &&
    keys[0] === "_nanoseconds" &&
    keys[1] === "_seconds" &&
    typeof object._seconds === "number" &&
    typeof object._nanoseconds === "number"
  ) {
    const date = new Date(object._seconds * 1000 + Math.floor(object._nanoseconds / 1_000_000))
    if (!Number.isNaN(date.getTime())) return { toDate: () => date }
  }

  return Object.fromEntries(Object.keys(object).map((key) => [key, rehidratarTimestampsSerializados(object[key])]))
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

export function hashSnapshotCompleto(data: Record<string, unknown>): string {
  return sha256(JSON.stringify(stable(data)))
}

export function normalizarFingerprint(value: StorageFingerprint): StorageFingerprint {
  const result: StorageFingerprint = {}
  for (const key of ["generation", "metageneration", "size", "contentType", "md5Hash", "crc32c", "updated"] as const) {
    const item = value[key]
    if (item !== undefined && item !== null && item !== "") result[key] = item as never
  }
  return result
}

export function hashFingerprint(value: StorageFingerprint): string {
  return sha256(JSON.stringify(stable(normalizarFingerprint(value))))
}

function texto(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function tieneEmpresaId(data: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(data, "empresaId")
}

function esRutaLegacy(path: string): boolean {
  const normalizado = path.replace(/^\/+/, "")
  return /^(?:public\/)?eventos\//.test(normalizado) && !/^tenants\//.test(normalizado)
}

function keyAsset(bucket: string, path: string): string {
  return `${bucket}::${path}`
}

function manifestAsHashInput(manifest: CierreManifest): unknown {
  return stable(manifest)
}

export function hashManifest(manifest: CierreManifest): string {
  return sha256(JSON.stringify(manifestAsHashInput(manifest)))
}

export function validarManifiestoCierre(manifest: CierreManifest): void {
  if (manifest.schemaVersion !== B3_CLOSURE_SCHEMA_VERSION) throw new Error("schemaVersion de cierre no soportado.")
  if (manifest.contrato !== B3_CLOSURE_CONTRACT) throw new Error("contrato de cierre no soportado.")
  if (!/^[a-f0-9]{64}$/.test(manifest.sourceReportSha256)) throw new Error("sourceReportSha256 invÃ¡lido.")
  if (!texto(manifest.projectId) || !texto(manifest.bucket)) throw new Error("projectId y bucket son obligatorios.")
  if (manifest.expectedCounts.eventos !== 1 || manifest.expectedCounts.assets !== 3) {
    throw new Error("El manifiesto solo admite exactamente 1 Evento y 3 assets.")
  }
  if (manifest.eventos.length !== 1 || manifest.assets.length !== 3) {
    throw new Error("El allowlist de cierre debe contener exactamente cuatro targets.")
  }
  const evento = manifest.eventos[0]
  if (!texto(evento.eventoId) || !/^[a-f0-9]{64}$/.test(evento.snapshotHash) || !texto(evento.motivo) || !texto(evento.evidencia)) {
    throw new Error("El target Evento no tiene una identificaciÃ³n o evidencia completa.")
  }
  const claves = new Set<string>()
  for (const asset of manifest.assets) {
    if (!texto(asset.bucket) || !texto(asset.path) || !esRutaLegacy(asset.path)) {
      throw new Error("Cada asset debe ser un objeto Storage legacy de Eventos.")
    }
    if (asset.bucket !== manifest.bucket) throw new Error("El bucket del target no coincide con el bucket del manifiesto.")
    if (!texto(asset.motivo) || !texto(asset.evidencia)) throw new Error("Cada asset requiere motivo y evidencia.")
    const key = keyAsset(asset.bucket, asset.path)
    if (claves.has(key)) throw new Error(`Target Storage duplicado: ${key}`)
    claves.add(key)
  }
}

function resultado(kind: "EVENTO" | "ASSET", key: string, estado: EstadoObjetivoCierre, motivo: string, extra: Partial<ResultadoObjetivoCierre> = {}): ResultadoObjetivoCierre {
  return { kind, key, estado, motivo, referencias: [], ...extra }
}

export function planificarCierre(
  manifest: CierreManifest,
  eventos: EventoCierreRow[],
  storageObjects: StorageCierreRow[],
  modo: "DRY_RUN" | "EXECUTE" = "DRY_RUN",
): PlanCierre {
  validarManifiestoCierre(manifest)
  const manifestHash = hashManifest(manifest)
  const targetEvent = manifest.eventos[0]
  const event = eventos.find((item) => item.id === targetEvent.eventoId)
  const objectByKey = new Map(storageObjects.map((item) => [`${item.bucket ?? manifest.bucket}::${item.path}`, item]))
  const targets: ResultadoObjetivoCierre[] = []
  const checks: PlanCierre["checks"] = []
  let fatal = false

  if (!event) {
    targets.push(resultado("EVENTO", targetEvent.eventoId, "ABORTADO", "El Evento objetivo no existe en la revalidaciÃ³n final."))
    checks.push({ check: "evento-presente", status: "FAIL", detalle: targetEvent.eventoId })
    fatal = true
  } else if (tieneEmpresaId(event.data)) {
    targets.push(resultado("EVENTO", targetEvent.eventoId, "ABORTADO", "El objetivo ahora tiene empresaId y es canÃ³nico."))
    checks.push({ check: "evento-sin-empresaId", status: "FAIL", detalle: "El objetivo dejÃ³ de ser legacy." })
    fatal = true
  } else {
    const actualHash = hashSnapshotCompleto(event.data)
    const same = actualHash === targetEvent.snapshotHash
    targets.push(resultado("EVENTO", targetEvent.eventoId, same ? "PREPARADO" : "ABORTADO", same ? "Snapshot legacy coincide con el allowlist." : "Drift del snapshot del Evento.", {
      expectedHash: targetEvent.snapshotHash,
      actualHash,
    }))
    checks.push({ check: "evento-snapshot", status: same ? "PASS" : "FAIL", detalle: actualHash })
    fatal ||= !same
  }

  const inventory = construirInventarioAssets(
    eventos.map(({ id, data }) => ({ id, data })),
    storageObjects.map(({ bucket, path, size, contentType }) => ({ bucket, path, size, contentType })),
  )
  const referenced = new Map<string, string[]>()
  for (const reference of inventory.referencias) {
    if (reference.tipo !== "STORAGE_PATH" || !reference.bucket || !reference.path) continue
    const key = keyAsset(reference.bucket, reference.path)
    referenced.set(key, [...(referenced.get(key) ?? []), reference.eventoId])
  }

  for (const target of manifest.assets) {
    const key = keyAsset(target.bucket, target.path)
    const object = objectByKey.get(key)
    const refs = [...new Set(referenced.get(key) ?? [])].sort()
    if (!object) {
      targets.push(resultado("ASSET", key, "ABORTADO", "El objeto Storage objetivo no existe en la revalidaciÃ³n final.", { referencias: refs }))
      checks.push({ check: `asset-presente:${target.path}`, status: "FAIL", detalle: "no existe" })
      fatal = true
      continue
    }
    const actualFingerprint = normalizarFingerprint(object)
    const expectedFingerprint = normalizarFingerprint(target.fingerprint)
    const sameFingerprint = hashFingerprint(actualFingerprint) === hashFingerprint(expectedFingerprint)
    const legacyPath = esRutaAssetEvento(target.path) && esRutaLegacy(target.path)
    const safe = sameFingerprint && legacyPath && refs.length === 0
    const reason = !sameFingerprint
      ? "Drift del fingerprint Storage."
      : !legacyPath
        ? "El objeto no pertenece a una raÃ­z legacy de Eventos."
        : refs.length > 0
          ? "El objeto tiene referencias explÃ­citas y no puede eliminarse."
          : "Objeto legacy no referenciado y fingerprint coincidente."
    targets.push(resultado("ASSET", key, safe ? "PREPARADO" : "ABORTADO", reason, {
      expectedHash: hashFingerprint(expectedFingerprint),
      actualHash: hashFingerprint(actualFingerprint),
      referencias: refs,
    }))
    checks.push({ check: `asset-fingerprint:${target.path}`, status: sameFingerprint ? "PASS" : "FAIL", detalle: hashFingerprint(actualFingerprint) })
    checks.push({ check: `asset-referencias:${target.path}`, status: refs.length === 0 ? "PASS" : "FAIL", detalle: refs.join(",") || "ninguna" })
    fatal ||= !safe
  }

  const canonicalEvents = eventos.filter((item) => tieneEmpresaId(item.data)).length
  const referencedAssets = [...new Set([...referenced.values()].flat())].length
  checks.push({ check: "allowlist-exacto", status: "PASS", detalle: "1 Evento y 3 assets declarados; no se seleccionan objetivos por prefijo." })
  checks.push({ check: "canonicos-excluidos", status: "PASS", detalle: `${canonicalEvents} Evento(s) con empresaId no seleccionados.` })
  const safeToExecute = !fatal && targets.length === 4 && targets.every((item) => item.estado === "PREPARADO")
  const wouldDelete = safeToExecute
    ? targets.map(({ kind, key }) => ({ kind, key }))
    : []
  const base = {
    schemaVersion: B3_CLOSURE_SCHEMA_VERSION,
    contrato: B3_CLOSURE_CONTRACT,
    modo,
    projectId: manifest.projectId,
    bucket: manifest.bucket,
    productionWrites: false as const,
    safeToExecute,
    manifestSha256: manifestHash,
    sourceReportSha256: manifest.sourceReportSha256,
    exactCounts: { eventos: 1 as const, assets: 3 as const, total: 4 as const },
    targets,
    wouldDelete,
    excluded: { eventosCanonicos: canonicalEvents, assetsReferenciados: referencedAssets, targetsFueraDeAllowlist: 0 },
    checks,
  }
  return { ...base, evidenceSha256: sha256(JSON.stringify(stable(base))) }
}

export function crearJournalPreparado(plan: PlanCierre): JournalCierre {
  const operationId = sha256(`${plan.projectId}:${plan.manifestSha256}:${plan.evidenceSha256}`)
  return {
    schemaVersion: B3_CLOSURE_SCHEMA_VERSION,
    contrato: B3_CLOSURE_CONTRACT,
    operationId,
    productionWrites: false,
    entries: plan.targets.map((target) => ({
      kind: target.kind,
      key: target.key,
      estado: target.estado === "PREPARADO" ? "PREPARADO" : "ABORTADO",
      motivo: target.motivo,
      operationId: sha256(`${operationId}:${target.kind}:${target.key}`),
    })),
  }
}

export function prepararRecoveryBundle(
  plan: PlanCierre,
  manifest: CierreManifest,
  evento: EventoCierreRow,
  assets: StorageCierreRow[],
): RecoveryBundle {
  if (!plan.safeToExecute) throw new Error("No se puede preparar recovery para un plan abortado.")
  const expected = new Map(manifest.assets.map((asset) => [keyAsset(asset.bucket, asset.path), asset]))
  const bundle: RecoveryBundle = {
    schemaVersion: B3_CLOSURE_SCHEMA_VERSION,
    contrato: B3_CLOSURE_CONTRACT,
    operationId: crearJournalPreparado(plan).operationId,
    manifestSha256: plan.manifestSha256,
    planSha256: plan.evidenceSha256,
    productionWrites: false,
    evento: {
      eventoId: evento.id,
      metadata: evento.metadata ?? {},
      data: evento.data,
      dataSha256: hashSnapshotCompleto(evento.data),
    },
    assets: assets.map((asset) => {
      const bucket = asset.bucket ?? manifest.bucket
      const target = expected.get(keyAsset(bucket, asset.path))
      if (!target) throw new Error(`Asset fuera del allowlist al preparar recovery: ${bucket}::${asset.path}`)
      const bytes = asset.bytes ?? Buffer.alloc(0)
      return {
        bucket,
        path: asset.path,
        metadata: {
          size: asset.size,
          contentType: asset.contentType,
          generation: asset.generation,
          metageneration: asset.metageneration,
          md5Hash: asset.md5Hash,
          crc32c: asset.crc32c,
          updated: asset.updated,
        },
        fingerprint: normalizarFingerprint(asset),
        bytesBase64: bytes.toString("base64"),
        bytesSha256: sha256(bytes),
      }
    }).sort((a, b) => keyAsset(a.bucket, a.path).localeCompare(keyAsset(b.bucket, b.path))),
  }
  if (bundle.assets.length !== 3 || bundle.evento.eventoId !== manifest.eventos[0].eventoId) throw new Error("Recovery incompleto: el bundle no contiene exactamente los cuatro targets.")
  return bundle
}

export function verificarRecoveryBundle(bundle: RecoveryBundle): RecoveryVerification {
  const errors: string[] = []
  if (bundle.schemaVersion !== B3_CLOSURE_SCHEMA_VERSION || bundle.contrato !== B3_CLOSURE_CONTRACT) errors.push("Contrato de recovery invÃ¡lido.")
  if (bundle.productionWrites !== false) errors.push("El bundle no declara productionWrites:false.")
  const recoveryData = rehidratarTimestampsSerializados(bundle.evento.data) as Record<string, unknown>
  if (bundle.evento.dataSha256 !== hashSnapshotCompleto(recoveryData)) errors.push("Hash del documento Firestore no coincide.")
  for (const asset of bundle.assets) {
    const bytes = Buffer.from(asset.bytesBase64, "base64")
    if (sha256(bytes) !== asset.bytesSha256) errors.push(`Hash de bytes no coincide: ${asset.bucket}::${asset.path}`)
  }
  return {
    ok: errors.length === 0 && bundle.assets.length === 3,
    errors,
    assetCount: bundle.assets.length,
    eventoDataSha256: bundle.evento.dataSha256,
  }
}

export type ClosureHandlers = {
  deleteEvent: (eventId: string) => Promise<boolean>
  deleteAsset: (bucket: string, path: string) => Promise<boolean>
  persistJournal: (journal: JournalCierre) => Promise<void>
}

export async function ejecutarCierreConJournal(
  plan: PlanCierre,
  journal: JournalCierre,
  handlers: ClosureHandlers,
): Promise<JournalCierre> {
  if (!plan.safeToExecute) throw new Error("El plan no es ejecutable; ningÃºn target serÃ¡ eliminado.")
  const entries = journal.entries.map((entry) => ({ ...entry }))
  for (const target of plan.targets) {
    const entry = entries.find((item) => item.kind === target.kind && item.key === target.key)
    if (!entry) throw new Error(`Journal incompleto para ${target.kind}:${target.key}`)
    if (entry.estado === "ELIMINADO" || entry.estado === "IDEMPOTENTE_NOOP") continue
    try {
      const deleted = target.kind === "EVENTO"
        ? await handlers.deleteEvent(target.key)
        : await handlers.deleteAsset(target.key.split("::", 1)[0], target.key.slice(target.key.indexOf("::") + 2))
      entry.estado = deleted ? "ELIMINADO" : "ABORTADO"
      entry.motivo = deleted ? "EliminaciÃ³n confirmada en Emulator." : "Ausencia inesperada; no se autoriza continuar."
      await handlers.persistJournal({ ...journal, entries: entries.map((item) => ({ ...item })) })
      if (!deleted) break
    } catch (error) {
      entry.estado = "ABORTADO"
      entry.motivo = error instanceof Error ? error.message : String(error)
      await handlers.persistJournal({ ...journal, entries: entries.map((item) => ({ ...item })) })
      break
    }
  }
  return { ...journal, entries }
}

export type RecoveryHandlers = {
  eventExists: (eventId: string) => Promise<boolean>
  createEvent: (eventId: string, data: Record<string, unknown>) => Promise<void>
  assetExists: (bucket: string, path: string) => Promise<boolean>
  createAsset: (bucket: string, path: string, bytes: Buffer, metadata: Record<string, unknown>) => Promise<void>
}

export async function recuperarBundle(bundle: RecoveryBundle, handlers: RecoveryHandlers): Promise<string[]> {
  const verification = verificarRecoveryBundle(bundle)
  if (!verification.ok) throw new Error(`Recovery invÃ¡lido: ${verification.errors.join("; ")}`)
  const results: string[] = []
  if (await handlers.eventExists(bundle.evento.eventoId)) {
    results.push(`CONFLICTO_NO_SOBRESCRIBE:EVENTO:${bundle.evento.eventoId}`)
  } else {
    await handlers.createEvent(bundle.evento.eventoId, bundle.evento.data)
    results.push(`RESTAURADO:EVENTO:${bundle.evento.eventoId}`)
  }
  for (const asset of bundle.assets) {
    if (await handlers.assetExists(asset.bucket, asset.path)) {
      results.push(`CONFLICTO_NO_SOBRESCRIBE:ASSET:${asset.bucket}::${asset.path}`)
      continue
    }
    await handlers.createAsset(asset.bucket, asset.path, Buffer.from(asset.bytesBase64, "base64"), asset.metadata)
    results.push(`RESTAURADO:ASSET:${asset.bucket}::${asset.path}`)
  }
  return results
}
