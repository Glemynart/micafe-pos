import { isAbsolute, relative, resolve } from "node:path"
import {
  sha256,
  validarManifiestoCierre,
  type CierreManifest,
  type PlanCierre,
  type ResultadoObjetivoCierre,
} from "./eventos-legacy-closure-core"

export const PRODUCTION_PROJECT_ID = "micafe-pos" as const
export const PRODUCTION_BUCKET = "micafe-pos.firebasestorage.app" as const
export const PRODUCTION_CONTRACT = "B3-B-eventos-legacy-production-closure" as const

export type ProductionJournalState = "PREPARADO" | "ELIMINADO" | "IDEMPOTENTE_NOOP" | "ABORTADO"

export type ProductionJournalEntry = {
  kind: "EVENTO" | "ASSET"
  key: string
  estado: ProductionJournalState
  motivo: string
  operationId: string
}

export type ProductionJournal = {
  schemaVersion: 1
  contrato: typeof PRODUCTION_CONTRACT
  operationId: string
  productionWrites: true
  entries: ProductionJournalEntry[]
}

export type ProductionHandlerResult = {
  estado: "ELIMINADO" | "IDEMPOTENTE_NOOP"
  motivo: string
}

export type ProductionHandlers = {
  deleteEvent: (target: ResultadoObjetivoCierre) => Promise<ProductionHandlerResult>
  deleteAsset: (target: ResultadoObjetivoCierre) => Promise<ProductionHandlerResult>
  persistJournal: (journal: ProductionJournal) => Promise<void>
}

export type ProductionRuntime = {
  ci?: string
  githubActions?: string
  stdinIsTTY: boolean
  stdoutIsTTY: boolean
  confirmation?: string
}

export function productionConfirmation(manifestSha256: string): string {
  return `CONFIRM B3-027 PRODUCTION project=${PRODUCTION_PROJECT_ID} bucket=${PRODUCTION_BUCKET} targets=4 manifestSha256=${manifestSha256}`
}

export function validarManifiestoProduccion(manifest: CierreManifest): void {
  validarManifiestoCierre(manifest)
  if (manifest.projectId !== PRODUCTION_PROJECT_ID) {
    throw new Error("El operador productivo solo admite el proyecto micafe-pos.")
  }
  if (manifest.bucket !== PRODUCTION_BUCKET) {
    throw new Error("El operador productivo solo admite el bucket micafe-pos.firebasestorage.app.")
  }
  for (const asset of manifest.assets) {
    if (!asset.fingerprint.generation) {
      throw new Error(`El asset ${asset.path} no tiene generation para una precondición segura.`)
    }
  }
}

export function validarRuntimeProduccion(runtime: ProductionRuntime, manifestSha256: string): void {
  const ci = runtime.ci === "true" || runtime.ci === "1" || runtime.githubActions === "true"
  if (ci) throw new Error("La herramienta productiva no puede ejecutarse desde CI.")
  if (!runtime.stdinIsTTY || !runtime.stdoutIsTTY) {
    throw new Error("La ejecución productiva exige una sesión interactiva con TTY.")
  }
  const expected = productionConfirmation(manifestSha256)
  if (runtime.confirmation !== expected) {
    throw new Error("La confirmación productiva no coincide con proyecto, bucket, cantidad y hash del manifiesto.")
  }
}

export function validarRutaArtifactoExterna(candidate: string, worktreeRoot: string): string {
  const artifactPath = resolve(candidate)
  const root = resolve(worktreeRoot)
  if (!isAbsolute(candidate)) throw new Error("Los artefactos productivos deben usar rutas absolutas.")
  const relativePath = relative(root, artifactPath)
  if (!relativePath || (!relativePath.startsWith("..") && !relativePath.includes(":"))) {
    throw new Error("El recovery, journal y evidencia productivos deben quedar fuera del worktree.")
  }
  return artifactPath
}

export function crearJournalProduccion(plan: PlanCierre): ProductionJournal {
  if (!plan.safeToExecute || plan.targets.length !== 4 || plan.targets.some((target) => target.estado !== "PREPARADO")) {
    throw new Error("No se puede preparar un journal productivo para un plan inseguro.")
  }
  const operationId = sha256(`${plan.projectId}:${plan.manifestSha256}:${plan.evidenceSha256}:production`)
  return {
    schemaVersion: 1,
    contrato: PRODUCTION_CONTRACT,
    operationId,
    productionWrites: true,
    entries: plan.targets.map((target) => ({
      kind: target.kind,
      key: target.key,
      estado: "PREPARADO" as const,
      motivo: "Target validado por preflight y recovery preparado.",
      operationId,
    })),
  }
}

export async function ejecutarCierreProduccion(
  plan: PlanCierre,
  journal: ProductionJournal,
  handlers: ProductionHandlers,
): Promise<ProductionJournal> {
  if (journal.productionWrites !== true || journal.contrato !== PRODUCTION_CONTRACT) {
    throw new Error("El journal productivo no cumple el contrato de producción.")
  }
  if (!plan.safeToExecute || plan.targets.length !== 4 || plan.targets.some((target) => target.estado !== "PREPARADO")) {
    throw new Error("El plan productivo no es seguro.")
  }

  const entries = journal.entries.map((entry) => ({ ...entry }))
  for (const target of plan.targets) {
    const entry = entries.find((candidate) => candidate.kind === target.kind && candidate.key === target.key)
    if (!entry) throw new Error(`Falta el journal de ${target.kind}:${target.key}`)
    if (entry.estado === "ELIMINADO" || entry.estado === "IDEMPOTENTE_NOOP") continue
    try {
      const result = target.kind === "EVENTO"
        ? await handlers.deleteEvent(target)
        : await handlers.deleteAsset(target)
      entry.estado = result.estado
      entry.motivo = result.motivo
      await handlers.persistJournal({ ...journal, entries: entries.map((candidate) => ({ ...candidate })) })
    } catch (error) {
      entry.estado = "ABORTADO"
      entry.motivo = error instanceof Error ? error.message : String(error)
      await handlers.persistJournal({ ...journal, entries: entries.map((candidate) => ({ ...candidate })) })
      break
    }
  }
  return { ...journal, entries }
}
