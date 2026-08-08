import assert from "node:assert/strict"

export const B3_EVENTOS_REPORT_SCHEMA_VERSION = 1

export type EventoLegacyRow = {
  id: string
  data: Record<string, unknown>
}

export type EmpresaRow = {
  id: string
  data: Record<string, unknown>
}

export type MapeoEventoLegacy = {
  eventoId: string
  empresaId: string
  evidencia: string
}

export type EstadoInventarioEvento =
  | "CANONICO"
  | "CANONICO_EMPRESA_INEXISTENTE"
  | "LEGACY_SIN_MAPEO"
  | "LEGACY_MAPEO_VALIDO"
  | "LEGACY_MAPEO_INVALIDO"
  | "LEGACY_MAPEO_CONFLICTIVO"

export type InventarioEvento = {
  eventoId: string
  estado: EstadoInventarioEvento
  empresaIdActual?: string
  empresaIdDestino?: string
  estadoEmpresaDestino?: string
  evidencia?: string
  motivos: string[]
}

export type ReporteInventarioEventos = {
  schemaVersion: typeof B3_EVENTOS_REPORT_SCHEMA_VERSION
  contrato: "B3-A-eventos-legacy-dry-run"
  modo: "DRY_RUN"
  projectId: string
  entorno: "EMULATOR" | "CONFIGURADO"
  productionWrites: false
  totales: {
    totalEventos: number
    canonicos: number
    canonicosEmpresaInexistente: number
    legacy: number
    legacySinMapeo: number
    legacyMapeoValido: number
    legacyMapeoInvalido: number
    legacyMapeoConflictivo: number
    mapeosNoEncontrados: number
  }
  eventos: InventarioEvento[]
  mapeosNoEncontrados: string[]
}

function texto(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function indexarMapeos(mapeos: MapeoEventoLegacy[]): Map<string, MapeoEventoLegacy[]> {
  const index = new Map<string, MapeoEventoLegacy[]>()
  for (const mapeo of mapeos) {
    const actual = index.get(mapeo.eventoId) ?? []
    actual.push(mapeo)
    index.set(mapeo.eventoId, actual)
  }
  return index
}

function validarEntradaMapeo(mapeo: MapeoEventoLegacy): string[] {
  const motivos: string[] = []
  if (!texto(mapeo.eventoId)) motivos.push("eventoId ausente")
  if (!texto(mapeo.empresaId)) motivos.push("empresaId ausente")
  if (!texto(mapeo.evidencia)) motivos.push("evidencia ausente")
  return motivos
}

export function construirReporteInventario(
  eventos: EventoLegacyRow[],
  empresas: EmpresaRow[],
  mapeos: MapeoEventoLegacy[],
  contexto: { projectId: string; entorno: ReporteInventarioEventos["entorno"] },
): ReporteInventarioEventos {
  const empresaIds = new Set(empresas.map((empresa) => empresa.id))
  const empresasPorId = new Map(empresas.map((empresa) => [empresa.id, empresa]))
  const mapeosPorEvento = indexarMapeos(mapeos)
  const idsEventos = new Set(eventos.map((evento) => evento.id))
  const inventario: InventarioEvento[] = []

  for (const evento of [...eventos].sort((a, b) => a.id.localeCompare(b.id))) {
    const empresaIdActual = texto(evento.data.empresaId)
    if (empresaIdActual) {
      inventario.push({
        eventoId: evento.id,
        estado: empresaIds.has(empresaIdActual) ? "CANONICO" : "CANONICO_EMPRESA_INEXISTENTE",
        empresaIdActual,
        motivos: empresaIds.has(empresaIdActual)
          ? ["El documento ya tiene empresaId; B3-A no propone modificarlo."]
          : ["El documento tiene empresaId, pero la empresa no existe en el catálogo leído."],
      })
      continue
    }

    const candidatos = mapeosPorEvento.get(evento.id) ?? []
    if (candidatos.length === 0) {
      inventario.push({
        eventoId: evento.id,
        estado: "LEGACY_SIN_MAPEO",
        motivos: ["Requiere mapeo explícito; no se permite inferencia."],
      })
      continue
    }

    const erroresEntrada = candidatos.flatMap(validarEntradaMapeo)
    const empresasDestino = new Set(candidatos.map((candidato) => candidato.empresaId))
    if (candidatos.length !== 1 || empresasDestino.size !== 1) {
      inventario.push({
        eventoId: evento.id,
        estado: "LEGACY_MAPEO_CONFLICTIVO",
        motivos: ["Existe más de una entrada de mapeo para el mismo evento."],
      })
      continue
    }

    const candidato = candidatos[0]
    const empresaDestino = empresasPorId.get(candidato.empresaId)
    if (erroresEntrada.length > 0 || !empresaDestino) {
      inventario.push({
        eventoId: evento.id,
        estado: "LEGACY_MAPEO_INVALIDO",
        empresaIdDestino: texto(candidato.empresaId),
        evidencia: texto(candidato.evidencia),
        motivos: [
          ...erroresEntrada,
          ...(!empresaDestino ? ["La empresa destino no existe en el catálogo leído."] : []),
        ],
      })
      continue
    }

    inventario.push({
      eventoId: evento.id,
      estado: "LEGACY_MAPEO_VALIDO",
      empresaIdDestino: candidato.empresaId,
      estadoEmpresaDestino: texto(empresaDestino.data.estado),
      evidencia: candidato.evidencia.trim(),
      motivos: ["Mapeo explícito validado; B3-A no escribe el documento."],
    })
  }

  const mapeosNoEncontrados = [...new Set(mapeos
    .map((mapeo) => mapeo.eventoId)
    .filter((eventoId) => !idsEventos.has(eventoId)))]
    .sort((a, b) => a.localeCompare(b))

  const contar = (estado: EstadoInventarioEvento) => inventario.filter((item) => item.estado === estado).length
  return {
    schemaVersion: B3_EVENTOS_REPORT_SCHEMA_VERSION,
    contrato: "B3-A-eventos-legacy-dry-run",
    modo: "DRY_RUN",
    projectId: contexto.projectId,
    entorno: contexto.entorno,
    productionWrites: false,
    totales: {
      totalEventos: inventario.length,
      canonicos: contar("CANONICO"),
      canonicosEmpresaInexistente: contar("CANONICO_EMPRESA_INEXISTENTE"),
      legacy: inventario.filter((item) => item.estado !== "CANONICO" && item.estado !== "CANONICO_EMPRESA_INEXISTENTE").length,
      legacySinMapeo: contar("LEGACY_SIN_MAPEO"),
      legacyMapeoValido: contar("LEGACY_MAPEO_VALIDO"),
      legacyMapeoInvalido: contar("LEGACY_MAPEO_INVALIDO"),
      legacyMapeoConflictivo: contar("LEGACY_MAPEO_CONFLICTIVO"),
      mapeosNoEncontrados: mapeosNoEncontrados.length,
    },
    eventos: inventario,
    mapeosNoEncontrados,
  }
}

export function parsearMapeos(raw: unknown): MapeoEventoLegacy[] {
  assert(raw && typeof raw === "object", "El manifiesto debe ser un objeto JSON.")
  const root = raw as { schemaVersion?: unknown; mapeos?: unknown }
  assert(root.schemaVersion === 1, "El manifiesto debe declarar schemaVersion=1.")
  assert(Array.isArray(root.mapeos), "El manifiesto debe contener el arreglo mapeos.")

  return root.mapeos.map((item, index) => {
    assert(item && typeof item === "object", `mapeos[${index}] debe ser un objeto.`)
    const value = item as Record<string, unknown>
    return {
      eventoId: texto(value.eventoId) ?? "",
      empresaId: texto(value.empresaId) ?? "",
      evidencia: texto(value.evidencia) ?? "",
    }
  })
}

export function serializarReporte(reporte: ReporteInventarioEventos): string {
  return `${JSON.stringify(reporte, null, 2)}\n`
}
