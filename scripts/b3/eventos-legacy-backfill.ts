import * as dotenv from "dotenv"
import * as fs from "node:fs"
import { createHash } from "node:crypto"
import { dirname, resolve } from "node:path"
import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore, type DocumentData, type Firestore, type Transaction } from "firebase-admin/firestore"
import {
  construirReporteInventario,
  parsearMapeos,
  type EmpresaRow,
  type EventoLegacyRow,
  type MapeoEventoLegacy,
  type ReporteInventarioEventos,
} from "./eventos-legacy-inventory"

dotenv.config({ path: ".env.local" })

export const B3_BACKFILL_SCHEMA_VERSION = 1

export type EstadoBackfillEvento =
  | "PREPARADO"
  | "APLICADO"
  | "IDEMPOTENTE_NOOP"
  | "OMITIDO_NO_LEGACY"
  | "CONFLICTO_CONCURRENCIA"
  | "EVENTO_NO_ENCONTRADO"
  | "EMPRESA_DESTINO_INEXISTENTE"

export type PlanBackfillEvento = {
  eventoId: string
  empresaIdDestino: string
  evidencia: string
}

export type ResultadoBackfillEvento = {
  eventoId: string
  empresaIdDestino: string
  estado: EstadoBackfillEvento
  evidencia: string
  motivo: string
  snapshotHashAntes?: string
  snapshotHashDespues?: string
  escrituraRealizada: boolean
}

export type ReporteBackfillEventos = {
  schemaVersion: typeof B3_BACKFILL_SCHEMA_VERSION
  contrato: "B3-B-eventos-legacy-backfill"
  modo: "DRY_RUN" | "EXECUTE"
  projectId: string
  entorno: "EMULATOR" | "CONFIGURADO"
  productionWrites: false
  emulatorWrites: boolean
  totales: {
    candidatos: number
    preparados: number
    aplicados: number
    idempotentes: number
    omitidos: number
    conflictos: number
    errores: number
  }
  eventos: ResultadoBackfillEvento[]
}

type ContextoBackfill = {
  projectId: string
  entorno: ReporteBackfillEventos["entorno"]
  execute: boolean
}

const PAGE_SIZE = 500

function texto(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

/**
 * Normaliza únicamente para comparar evidencia. No muta ni reescribe el
 * documento y excluye exclusivamente el campo que B3-B añade.
 */
function normalizarSnapshot(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(normalizarSnapshot)
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }
  const objeto = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(objeto)
      .sort()
      .map((key) => [key, normalizarSnapshot(objeto[key])]),
  )
}

export function hashSnapshotSinEmpresaId(data: DocumentData): string {
  const snapshot = Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => key !== "empresaId")
      .map(([key, value]) => [key, normalizarSnapshot(value)]),
  )
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")
}

export function seleccionarPlanBackfill(
  reporte: ReporteInventarioEventos,
  mapeos: MapeoEventoLegacy[] = [],
): PlanBackfillEvento[] {
  const mapeosPorEvento = new Map<string, MapeoEventoLegacy[]>()
  for (const mapeo of mapeos) {
    if (!mapeo.eventoId || !mapeo.empresaId || !mapeo.evidencia) continue
    mapeosPorEvento.set(mapeo.eventoId, [...(mapeosPorEvento.get(mapeo.eventoId) ?? []), mapeo])
  }
  return reporte.eventos
    .flatMap((evento): PlanBackfillEvento[] => {
      if (evento.estado === "LEGACY_MAPEO_VALIDO"
        && typeof evento.empresaIdDestino === "string"
        && evento.empresaIdDestino.length > 0
        && typeof evento.evidencia === "string"
        && evento.evidencia.length > 0) {
        return [{
          eventoId: evento.eventoId,
          empresaIdDestino: evento.empresaIdDestino,
          evidencia: evento.evidencia,
        }]
      }

      // En un replay, un documento ya canónico solo entra si el manifiesto lo
      // referencia explícitamente. La transacción decidirá no-op o conflicto;
      // nunca se infiere ni se sobrescribe la propiedad actual.
      if (evento.estado === "CANONICO" || evento.estado === "CANONICO_EMPRESA_INEXISTENTE") {
        const candidatos = mapeosPorEvento.get(evento.eventoId) ?? []
        // Un replay ambiguo se omite; B3-A ya clasifica múltiples mapeos de
        // legacy como conflictivos y B3-B conserva esa misma regla.
        if (candidatos.length === 1) {
          const mapeo = candidatos[0]
          return [{
            eventoId: evento.eventoId,
            empresaIdDestino: mapeo.empresaId,
            evidencia: mapeo.evidencia,
          }]
        }
      }
      return []
    })
    .sort((a, b) => a.eventoId.localeCompare(b.eventoId))
}

function resultadoBase(
  plan: PlanBackfillEvento,
  estado: EstadoBackfillEvento,
  motivo: string,
  escrituraRealizada = false,
): ResultadoBackfillEvento {
  return {
    eventoId: plan.eventoId,
    empresaIdDestino: plan.empresaIdDestino,
    estado,
    evidencia: plan.evidencia,
    motivo,
    escrituraRealizada,
  }
}

async function aplicarEnTransaccion(
  db: Firestore,
  plan: PlanBackfillEvento,
): Promise<ResultadoBackfillEvento> {
  const eventoRef = db.collection("eventos").doc(plan.eventoId)
  const empresaRef = db.collection("empresas").doc(plan.empresaIdDestino)

  const resultado = await db.runTransaction(async (transaction: Transaction) => {
    const [eventoSnapshot, empresaSnapshot] = await transaction.getAll(eventoRef, empresaRef)
    if (!eventoSnapshot.exists) {
      return resultadoBase(plan, "EVENTO_NO_ENCONTRADO", "El documento no existe al momento de la transacción.")
    }
    if (!empresaSnapshot.exists) {
      return resultadoBase(plan, "EMPRESA_DESTINO_INEXISTENTE", "La empresa destino ya no existe al momento de la transacción.")
    }

    const data = eventoSnapshot.data() ?? {}
    const empresaIdActual = texto(data.empresaId)
    const snapshotHash = hashSnapshotSinEmpresaId(data)
    if (empresaIdActual === plan.empresaIdDestino) {
      return {
        ...resultadoBase(plan, "IDEMPOTENTE_NOOP", "El evento ya tiene el empresaId destino; no se reescribe.", false),
        snapshotHashAntes: snapshotHash,
        snapshotHashDespues: snapshotHash,
      }
    }
    if (empresaIdActual) {
      return resultadoBase(
        plan,
        "CONFLICTO_CONCURRENCIA",
        `El evento ya pertenece a ${empresaIdActual}; no se sobrescribe con otro tenant.`,
      )
    }

    // Únicamente se añade empresaId. El snapshot comercial y todos los demás
    // campos del documento se conservan sin reconstrucción ni dual-write.
    transaction.update(eventoRef, { empresaId: plan.empresaIdDestino })
    return {
      ...resultadoBase(plan, "APLICADO", "Mapeo explícito aplicado en una transacción.", true),
      snapshotHashAntes: snapshotHash,
      snapshotHashDespues: snapshotHash,
    }
  })

  if (resultado.estado !== "APLICADO") return resultado
  const verificacion = await eventoRef.get()
  if (!verificacion.exists) {
    throw new Error(`El evento ${plan.eventoId} desapareció durante la verificación.`)
  }
  const hashDespues = hashSnapshotSinEmpresaId(verificacion.data() ?? {})
  if (hashDespues !== resultado.snapshotHashAntes) {
    throw new Error(`El snapshot del evento ${plan.eventoId} cambió durante el backfill.`)
  }
  return { ...resultado, snapshotHashDespues: hashDespues }
}

async function inspeccionarSinEscritura(
  db: Firestore,
  plan: PlanBackfillEvento,
): Promise<ResultadoBackfillEvento> {
  const eventoSnapshot = await db.collection("eventos").doc(plan.eventoId).get()
  const empresaSnapshot = await db.collection("empresas").doc(plan.empresaIdDestino).get()
  if (!eventoSnapshot.exists) return resultadoBase(plan, "EVENTO_NO_ENCONTRADO", "El documento no existe.")
  if (!empresaSnapshot.exists) return resultadoBase(plan, "EMPRESA_DESTINO_INEXISTENTE", "La empresa destino no existe.")

  const data = eventoSnapshot.data() ?? {}
  const empresaIdActual = texto(data.empresaId)
  const snapshotHash = hashSnapshotSinEmpresaId(data)
  if (empresaIdActual === plan.empresaIdDestino) {
    return {
      ...resultadoBase(plan, "IDEMPOTENTE_NOOP", "El evento ya tiene el empresaId destino; no se escribiría.", false),
      snapshotHashAntes: snapshotHash,
      snapshotHashDespues: snapshotHash,
    }
  }
  if (empresaIdActual) {
    return resultadoBase(plan, "CONFLICTO_CONCURRENCIA", `El evento ya pertenece a ${empresaIdActual}; no se sobrescribiría.`)
  }
  return {
    ...resultadoBase(plan, "PREPARADO", "El mapeo es válido y se escribiría únicamente empresaId.", false),
    snapshotHashAntes: snapshotHash,
    snapshotHashDespues: snapshotHash,
  }
}

export async function ejecutarBackfill(
  db: Firestore,
  plan: PlanBackfillEvento[],
  contexto: ContextoBackfill,
): Promise<ReporteBackfillEventos> {
  if (contexto.execute && (contexto.entorno !== "EMULATOR" || !contexto.projectId.startsWith("demo-b3-eventos-"))) {
    throw new Error("B3-B solo permite --execute en un proyecto demo-b3-eventos-* conectado a Firestore Emulator; las escrituras productivas requieren una autorización y ejecución separadas.")
  }

  const eventos: ResultadoBackfillEvento[] = []
  for (const item of plan) {
    eventos.push(contexto.execute
      ? await aplicarEnTransaccion(db, item)
      : await inspeccionarSinEscritura(db, item))
  }

  const contar = (estados: EstadoBackfillEvento[]) => eventos.filter((item) => estados.includes(item.estado)).length
  return {
    schemaVersion: B3_BACKFILL_SCHEMA_VERSION,
    contrato: "B3-B-eventos-legacy-backfill",
    modo: contexto.execute ? "EXECUTE" : "DRY_RUN",
    projectId: contexto.projectId,
    entorno: contexto.entorno,
    productionWrites: false,
    emulatorWrites: contexto.execute,
    totales: {
      candidatos: plan.length,
      preparados: contar(["PREPARADO"]),
      aplicados: contar(["APLICADO"]),
      idempotentes: contar(["IDEMPOTENTE_NOOP"]),
      omitidos: contar(["OMITIDO_NO_LEGACY", "EVENTO_NO_ENCONTRADO", "EMPRESA_DESTINO_INEXISTENTE"]),
      conflictos: contar(["CONFLICTO_CONCURRENCIA"]),
      errores: contar([]),
    },
    eventos,
  }
}

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
  throw new Error("No se encontró una cuenta de servicio para la lectura B3-B.")
}

function crearDb(): Firestore {
  if (!getApps().length) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-b3-eventos-e2e" })
    } else {
      initializeApp({ credential: cert(cargarCuentaServicio()) })
    }
  }
  return getFirestore()
}

function validarArgumentos(): { mappingPath: string; outputPath: string; execute: boolean } {
  const args = process.argv.slice(2)
  const execute = args.includes("--execute")
  const dryRun = args.includes("--dry-run")
  if (execute && dryRun) throw new Error("Use exactamente uno de --dry-run o --execute.")
  if (!execute && !dryRun) throw new Error("B3-B requiere --dry-run o --execute explícito.")
  const permitidos = new Set(["--dry-run", "--execute", "--mapping", "--out"])
  for (const arg of args) {
    if (arg.startsWith("--") && !permitidos.has(arg)) throw new Error(`Argumento no soportado: ${arg}`)
  }
  const mappingPath = argumento("--mapping")
  if (!mappingPath) throw new Error("B3-B requiere un manifiesto explícito mediante --mapping.")
  return {
    mappingPath,
    outputPath: argumento("--out") ?? "artifacts/b3-eventos/backfill-report.json",
    execute,
  }
}

async function leerColeccion(db: Firestore, nombre: string): Promise<{ id: string; data: DocumentData }[]> {
  const documentos: { id: string; data: DocumentData }[] = []
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

async function main(): Promise<void> {
  const { mappingPath, outputPath, execute } = validarArgumentos()
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "desconocido"
  if (execute && (!process.env.FIRESTORE_EMULATOR_HOST || !projectId.startsWith("demo-b3-eventos-"))) {
    throw new Error("B3-B bloquea cualquier --execute fuera de un proyecto demo-b3-eventos-* con FIRESTORE_EMULATOR_HOST; no se permiten escrituras productivas en este PR.")
  }
  const mapeos: MapeoEventoLegacy[] = parsearMapeos(JSON.parse(fs.readFileSync(mappingPath, "utf8")))
  const db = crearDb()
  const [eventos, empresas] = await Promise.all([
    leerColeccion(db, "eventos"),
    leerColeccion(db, "empresas"),
  ])
  const inventario = construirReporteInventario(
    eventos as EventoLegacyRow[],
    empresas as EmpresaRow[],
    mapeos,
    {
      projectId,
      entorno: process.env.FIRESTORE_EMULATOR_HOST ? "EMULATOR" : "CONFIGURADO",
    },
  )
  const plan = seleccionarPlanBackfill(inventario, mapeos)
  const reporte = await ejecutarBackfill(db, plan, {
    projectId: inventario.projectId,
    entorno: inventario.entorno,
    execute,
  })
  const contenido = `${JSON.stringify({
    ...reporte,
    inventario: {
      totales: inventario.totales,
      eventos: inventario.eventos,
      mapeosNoEncontrados: inventario.mapeosNoEncontrados,
    },
    generadoEn: new Date().toISOString(),
  }, null, 2)}\n`
  const resolvedOutputPath = resolve(outputPath)
  fs.mkdirSync(dirname(resolvedOutputPath), { recursive: true })
  fs.writeFileSync(resolvedOutputPath, contenido, "utf8")
  fs.writeFileSync(`${resolvedOutputPath}.sha256`, `${createHash("sha256").update(contenido).digest("hex")}  ${resolvedOutputPath}\n`, "utf8")
  process.stdout.write(`${JSON.stringify({ ...reporte.totales, outputPath: resolvedOutputPath, productionWrites: false }, null, 2)}\n`)
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/b3/eventos-legacy-backfill.ts")) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
