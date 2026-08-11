import assert from "node:assert/strict"
import test from "node:test"
import {
  crearJournalPreparado,
  ejecutarCierreConJournal,
  hashManifest,
  hashSnapshotCompleto,
  planificarCierre,
  prepararRecoveryBundle,
  recuperarBundle,
  verificarRecoveryBundle,
  type CierreManifest,
  type EventoCierreRow,
  type StorageCierreRow,
} from "./eventos-legacy-closure-core"

const bucket = "demo-b3-eventos-closure-e2e.firebasestorage.app"
const eventId = "legacy-event-test"
const assets = ["eventos/a.png", "eventos/b.png", "eventos/c.png"]

function manifest(event: EventoCierreRow, rows: StorageCierreRow[]): CierreManifest {
  return {
    schemaVersion: 1,
    contrato: "B3-B-eventos-legacy-closure",
    sourceReportSha256: "a".repeat(64),
    projectId: "demo-b3-eventos-closure-e2e",
    bucket,
    decision: { razon: "PRUEBA_SIN_VALOR_COMERCIAL", evidencia: "confirmacion-test" },
    expectedCounts: { eventos: 1, assets: 3 },
    eventos: [{ eventoId: event.id, snapshotHash: hashSnapshotCompleto(event.data), motivo: "prueba", evidencia: "confirmacion-test" }],
    assets: rows.map((row) => ({
      bucket,
      path: row.path,
      fingerprint: {
        generation: row.generation,
        metageneration: row.metageneration,
        size: row.size,
        contentType: row.contentType,
        md5Hash: row.md5Hash,
        crc32c: row.crc32c,
        updated: row.updated,
      },
      motivo: "asset de prueba no referenciado",
      evidencia: "confirmacion-test",
    })) as CierreManifest["assets"],
  }
}

function fixtures() {
  const eventTimestamp = {
    toDate: () => new Date("2026-08-08T00:00:00.000Z"),
    toJSON: () => ({ _seconds: 1786147200, _nanoseconds: 0 }),
  }
  const event: EventoCierreRow = { id: eventId, data: { titulo: "Evento de prueba", activo: false, creadoEn: eventTimestamp } }
  const rows: StorageCierreRow[] = assets.map((path, index) => ({
    bucket,
    path,
    size: index + 1,
    contentType: "image/png",
    generation: `${index + 1}`,
    metageneration: "1",
    md5Hash: `md5-${index}`,
    crc32c: `crc-${index}`,
    updated: "2026-08-08T00:00:00.000Z",
    bytes: Buffer.from(`asset-${index}`),
  }))
  return { event, rows, manifest: manifest(event, rows) }
}

test("planifica exactamente un Evento y tres assets, excluyendo canÃ³nicos", () => {
  const { event, rows, manifest } = fixtures()
  const canonical = { id: "canonical", data: { empresaId: "tenant-1", titulo: "No tocar" } }
  const plan = planificarCierre(manifest, [event, canonical], rows)
  assert.equal(plan.safeToExecute, true)
  assert.equal(plan.productionWrites, false)
  assert.equal(plan.wouldDelete.length, 4)
  assert.equal(plan.excluded.eventosCanonicos, 1)
  assert.deepEqual(plan.targets.map((target) => target.estado), ["PREPARADO", "PREPARADO", "PREPARADO", "PREPARADO"])
  assert.equal(plan.manifestSha256, hashManifest(manifest))
})

test("aborta ante drift del snapshot y no propone eliminaciones", () => {
  const { event, rows, manifest } = fixtures()
  const plan = planificarCierre(manifest, [{ ...event, data: { ...event.data, titulo: "alterado" } }], rows)
  assert.equal(plan.safeToExecute, false)
  assert.deepEqual(plan.wouldDelete, [])
  assert.equal(plan.targets[0].estado, "ABORTADO")
})

test("aborta ante una referencia nueva del asset", () => {
  const { event, rows, manifest } = fixtures()
  const referencingEvent = { id: "otro", data: { imagenUrl: `gs://${bucket}/${assets[0]}` } }
  const plan = planificarCierre(manifest, [event, referencingEvent], rows)
  assert.equal(plan.safeToExecute, false)
  assert.equal(plan.targets.find((target) => target.key.endsWith(assets[0]))?.estado, "ABORTADO")
  assert.deepEqual(plan.wouldDelete, [])
})

test("el journal permite replay idempotente por objetivo", async () => {
  const { event, rows, manifest } = fixtures()
  const plan = planificarCierre(manifest, [event], rows)
  const prepared = crearJournalPreparado(plan)
  const deleted = new Set<string>()
  let persisted = 0
  const handlers = {
    deleteEvent: async (id: string) => !deleted.has(`EVENTO:${id}`) && (deleted.add(`EVENTO:${id}`), true),
    deleteAsset: async (b: string, p: string) => !deleted.has(`ASSET:${b}::${p}`) && (deleted.add(`ASSET:${b}::${p}`), true),
    persistJournal: async () => { persisted += 1 },
  }
  const first = await ejecutarCierreConJournal(plan, prepared, handlers)
  assert.deepEqual(first.entries.map((entry) => entry.estado), ["ELIMINADO", "ELIMINADO", "ELIMINADO", "ELIMINADO"])
  const replay = await ejecutarCierreConJournal(plan, first, handlers)
  assert.deepEqual(replay.entries.map((entry) => entry.estado), ["ELIMINADO", "ELIMINADO", "ELIMINADO", "ELIMINADO"])
  assert.equal(persisted, 4)
})

test("verifica recovery y no sobrescribe identidades ocupadas", async () => {
  const { event, rows, manifest } = fixtures()
  const plan = planificarCierre(manifest, [event], rows)
  const bundle = prepararRecoveryBundle(plan, manifest, event, rows)
  assert.equal(verificarRecoveryBundle(bundle).ok, true)
  const serializedBundle = JSON.parse(JSON.stringify(bundle))
  assert.equal(verificarRecoveryBundle(serializedBundle).ok, true)
  const restored = new Set<string>()
  const results = await recuperarBundle(bundle, {
    eventExists: async (id) => restored.has(`EVENTO:${id}`),
    createEvent: async (id) => { restored.add(`EVENTO:${id}`) },
    assetExists: async (b, p) => restored.has(`ASSET:${b}::${p}`),
    createAsset: async (b, p) => { restored.add(`ASSET:${b}::${p}`) },
  })
  assert.equal(results.filter((item) => item.startsWith("RESTAURADO")).length, 4)
  const conflicts = await recuperarBundle(bundle, {
    eventExists: async () => true,
    createEvent: async () => { throw new Error("no debe sobrescribir") },
    assetExists: async () => true,
    createAsset: async () => { throw new Error("no debe sobrescribir") },
  })
  assert.equal(conflicts.filter((item) => item.startsWith("CONFLICTO_NO_SOBRESCRIBE")).length, 4)
})
