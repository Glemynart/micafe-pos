import assert from "node:assert/strict"
import test from "node:test"
import { join } from "node:path"
import {
  hashManifest,
  hashSnapshotCompleto,
  planificarCierre,
  type CierreManifest,
  type EventoCierreRow,
  type PlanCierre,
  type StorageCierreRow,
} from "./eventos-legacy-closure-core"
import {
  crearJournalProduccion,
  ejecutarCierreProduccion,
  productionConfirmation,
  PRODUCTION_BUCKET,
  PRODUCTION_PROJECT_ID,
  validarManifiestoProduccion,
  validarRutaArtifactoExterna,
  validarRuntimeProduccion,
  type ProductionJournal,
} from "./eventos-legacy-production-closure-core"

const eventId = "legacy-production-test"
const assetPaths = ["eventos/a.png", "eventos/b.png", "eventos/c.png"]

function fixtures(): { event: EventoCierreRow; rows: StorageCierreRow[]; manifest: CierreManifest } {
  const event: EventoCierreRow = {
    id: eventId,
    data: { titulo: "Evento sintético", activo: false },
  }
  const rows = assetPaths.map((path, index): StorageCierreRow => ({
    bucket: PRODUCTION_BUCKET,
    path,
    size: index + 1,
    contentType: "image/png",
    generation: `${index + 1}`,
    metageneration: "1",
    md5Hash: `md5-${index}`,
    crc32c: `crc-${index}`,
    updated: "2026-08-08T00:00:00.000Z",
  }))
  const manifest: CierreManifest = {
    schemaVersion: 1,
    contrato: "B3-B-eventos-legacy-closure",
    sourceReportSha256: "a".repeat(64),
    projectId: PRODUCTION_PROJECT_ID,
    bucket: PRODUCTION_BUCKET,
    decision: { razon: "PRUEBA_SINTETICA", evidencia: "test" },
    expectedCounts: { eventos: 1, assets: 3 },
    eventos: [{
      eventoId: event.id,
      snapshotHash: hashSnapshotCompleto(event.data),
      motivo: "fixture sintético",
      evidencia: "test",
    }],
    assets: rows.map((row) => ({
      bucket: PRODUCTION_BUCKET,
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
      motivo: "fixture sintético",
      evidencia: "test",
    })) as unknown as CierreManifest["assets"],
  }
  return { event, rows, manifest }
}

test("acepta únicamente el proyecto, bucket y confirmación productivos canónicos", () => {
  const { manifest } = fixtures()
  validarManifiestoProduccion(manifest)
  assert.equal(productionConfirmation(hashManifest(manifest)), productionConfirmation(hashManifest(manifest)))
  assert.throws(() => validarRuntimeProduccion({
    stdinIsTTY: true,
    stdoutIsTTY: true,
    confirmation: "CONFIRMACIÓN INCORRECTA",
  }, hashManifest(manifest)), /confirmación productiva/i)
  assert.throws(() => validarRuntimeProduccion({
    ci: "true",
    stdinIsTTY: true,
    stdoutIsTTY: true,
    confirmation: productionConfirmation(hashManifest(manifest)),
  }, hashManifest(manifest)), /CI/i)
})

test("rechaza manifiestos de otro proyecto, bucket o sin generation", () => {
  const { manifest } = fixtures()
  assert.throws(() => validarManifiestoProduccion({ ...manifest, projectId: "otro-proyecto" }), /proyecto micafe-pos/i)
  assert.throws(() => validarManifiestoProduccion({
    ...manifest,
    bucket: "otro-bucket",
    assets: manifest.assets.map((asset) => ({ ...asset, bucket: "otro-bucket" })) as unknown as CierreManifest["assets"],
  }), /bucket micafe-pos/i)
  const withoutGeneration = {
    ...manifest,
    assets: manifest.assets.map((asset, index) => index === 0
      ? { ...asset, fingerprint: { ...asset.fingerprint, generation: undefined } }
      : asset),
  } as CierreManifest
  assert.throws(() => validarManifiestoProduccion(withoutGeneration), /generation/i)
})

test("mantiene los artefactos fuera del worktree", () => {
  const root = process.cwd()
  assert.throws(() => validarRutaArtifactoExterna("artifact.json", root), /rutas absolutas/i)
  assert.throws(() => validarRutaArtifactoExterna(join(root, "artifact.json"), root), /fuera del worktree/i)
  const outside = validarRutaArtifactoExterna(join(root, "..", "b3-production-artifact.json"), root)
  assert.match(outside, /b3-production-artifact\.json$/i)
})

function productionPlan(): PlanCierre {
  const { event, rows, manifest } = fixtures()
  return planificarCierre(manifest, [event], rows, "EXECUTE")
}

test("el journal productivo conserva idempotencia y persiste después de cada target", async () => {
  const plan = productionPlan()
  assert.equal(plan.productionWrites, false)
  assert.equal(plan.safeToExecute, true)
  const prepared = crearJournalProduccion(plan)
  assert.equal(prepared.productionWrites, true)
  const calls: string[] = []
  const persisted: ProductionJournal[] = []
  const result = await ejecutarCierreProduccion(plan, prepared, {
    deleteEvent: async (target) => {
      calls.push(`EVENTO:${target.key}`)
      return { estado: "ELIMINADO", motivo: "fixture" }
    },
    deleteAsset: async (target) => {
      calls.push(`ASSET:${target.key}`)
      return { estado: "ELIMINADO", motivo: "fixture" }
    },
    persistJournal: async (journal) => { persisted.push(journal) },
  })
  assert.equal(calls.length, 4)
  assert.equal(persisted.length, 4)
  assert.deepEqual(result.entries.map((entry) => entry.estado), ["ELIMINADO", "ELIMINADO", "ELIMINADO", "ELIMINADO"])

  const replayCalls: string[] = []
  const replay = await ejecutarCierreProduccion(plan, result, {
    deleteEvent: async (target) => {
      replayCalls.push(`EVENTO:${target.key}`)
      return { estado: "IDEMPOTENTE_NOOP", motivo: "no esperado" }
    },
    deleteAsset: async (target) => {
      replayCalls.push(`ASSET:${target.key}`)
      return { estado: "IDEMPOTENTE_NOOP", motivo: "no esperado" }
    },
    persistJournal: async () => {},
  })
  assert.deepEqual(replay.entries.map((entry) => entry.estado), result.entries.map((entry) => entry.estado))
  assert.deepEqual(replayCalls, [])
})

test("aborta en drift operativo y no continúa con targets posteriores", async () => {
  const plan = productionPlan()
  const prepared = crearJournalProduccion(plan)
  const calls: string[] = []
  const persisted: ProductionJournal[] = []
  const result = await ejecutarCierreProduccion(plan, prepared, {
    deleteEvent: async (target) => {
      calls.push(`EVENTO:${target.key}`)
      throw new Error("drift sintético")
    },
    deleteAsset: async (target) => {
      calls.push(`ASSET:${target.key}`)
      return { estado: "ELIMINADO", motivo: "no esperado" }
    },
    persistJournal: async (journal) => { persisted.push(journal) },
  })
  assert.deepEqual(calls, [`EVENTO:${eventId}`])
  assert.equal(result.entries[0].estado, "ABORTADO")
  assert.deepEqual(result.entries.slice(1).map((entry) => entry.estado), ["PREPARADO", "PREPARADO", "PREPARADO"])
  assert.equal(persisted.length, 1)
})
