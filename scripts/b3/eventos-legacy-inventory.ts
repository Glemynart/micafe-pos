import assert from "node:assert/strict"
import { createHash } from "node:crypto"

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

export type StorageObjectRow = {
  bucket?: string
  path: string
  size?: number
  contentType?: string
}

export type AssetReferenceType = "STORAGE_PATH" | "URL_EXTERNA" | "VALOR_INVALIDO"
export type AssetRouteClass = "LEGACY" | "CANONICA_TENANT" | "OTRA" | "NO_APLICA"
export type AssetReferenceStatus =
  | "REFERENCIADO_EXISTENTE"
  | "REFERENCIA_SIN_OBJETO"
  | "URL_EXTERNA_NO_VERIFICABLE"
  | "VALOR_NO_VERIFICABLE"
  | "REFERENCIA_COMPARTIDA"

export type AssetReference = {
  eventoId: string
  campo: "imagenUrl"
  tipo: AssetReferenceType
  referenciaHash: string
  bucket?: string
  path?: string
  host?: string
  ruta: AssetRouteClass
  estado: AssetReferenceStatus
}

export type InventarioAsset = {
  clave: string
  tipo: AssetReferenceType | "STORAGE_OBJECT"
  bucket?: string
  path?: string
  host?: string
  ruta: AssetRouteClass
  estado: AssetReferenceStatus | "OBJETO_NO_REFERENCIADO"
  eventoIds: string[]
  referenciasHashes: string[]
  motivos: string[]
}

export type InventarioAssets = {
  assets: InventarioAsset[]
  referencias: AssetReference[]
  totales: {
    referencias: number
    referenciasStorage: number
    referenciasStorageExistentes: number
    referenciasStorageAusentes: number
    referenciasExternasNoVerificables: number
    referenciasInvalidas: number
    assetsCompartidos: number
    objetosNoReferenciados: number
    eventosConAsset: number
    eventosSinAsset: number
  }
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
  assetRefs?: AssetReference[]
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
  assets?: InventarioAsset[]
  totalesAssets?: InventarioAssets["totales"]
  storageScan?: {
    estado: "ESCANEADO" | "NO_CONFIGURADO"
    bucket?: string
    objectCount: number
  }
}

function texto(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function hashReferencia(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function rutaAsset(path: string | undefined): AssetRouteClass {
  if (!path) return "NO_APLICA"
  const normalizado = path.replace(/^\/+/, "")
  if (/^(?:public\/)?eventos\//.test(normalizado)) return "LEGACY"
  if (/^tenants\/[^/]+\/eventos\/[^/]+\//.test(normalizado)) return "CANONICA_TENANT"
  return "OTRA"
}

export function esRutaAssetEvento(path: string): boolean {
  const normalizado = path.replace(/^\/+/, "")
  return /^(?:public\/)?eventos\//.test(normalizado)
    || /^tenants\/[^/]+\/eventos\/[^/]+\//.test(normalizado)
}

function decodificarPath(value: string): string | undefined {
  try {
    const decoded = decodeURIComponent(value).replace(/^\/+/, "")
    return decoded || undefined
  } catch {
    return undefined
  }
}

/**
 * Analiza una URL sin conservarla. Los tokens de descarga no forman parte de
 * la evidencia: solo se conserva un hash, el bucket/path reconocible y el
 * host de una URL externa.
 */
export function analizarReferenciaAsset(value: unknown): Omit<AssetReference, "eventoId" | "campo" | "estado"> | null {
  const referencia = texto(value)
  if (!referencia) return null
  const referenciaHash = hashReferencia(referencia)

  if (referencia.startsWith("gs://")) {
    const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(referencia)
    const path = match ? decodificarPath(match[2].split(/[?#]/, 1)[0]) : undefined
    if (match && path) {
      return { tipo: "STORAGE_PATH", referenciaHash, bucket: match[1], path, ruta: rutaAsset(path) }
    }
    return { tipo: "VALOR_INVALIDO", referenciaHash, ruta: "NO_APLICA" }
  }

  try {
    const url = new URL(referencia)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { tipo: "VALOR_INVALIDO", referenciaHash, ruta: "NO_APLICA" }
    }

    const firebaseMatch = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(url.pathname)
    if (firebaseMatch) {
      const path = decodificarPath(firebaseMatch[2])
      if (path) return { tipo: "STORAGE_PATH", referenciaHash, bucket: firebaseMatch[1], path, ruta: rutaAsset(path) }
      return { tipo: "VALOR_INVALIDO", referenciaHash, host: url.hostname, ruta: "NO_APLICA" }
    }

    if (url.hostname === "storage.googleapis.com") {
      const segmentos = url.pathname.split("/").filter(Boolean)
      const path = decodificarPath(segmentos.slice(1).join("/"))
      if (segmentos.length >= 2 && path) {
        return { tipo: "STORAGE_PATH", referenciaHash, bucket: segmentos[0], path, ruta: rutaAsset(path) }
      }
      return { tipo: "VALOR_INVALIDO", referenciaHash, host: url.hostname, ruta: "NO_APLICA" }
    }

    return { tipo: "URL_EXTERNA", referenciaHash, host: url.hostname, ruta: "NO_APLICA" }
  } catch {
    return { tipo: "VALOR_INVALIDO", referenciaHash, ruta: "NO_APLICA" }
  }
}

function claveStorage(bucket: string | undefined, path: string): string {
  return `${bucket ?? ""}::${path}`
}

function claveReferencia(asset: Omit<AssetReference, "eventoId" | "campo" | "estado">): string {
  if (asset.tipo === "STORAGE_PATH" && asset.path) return claveStorage(asset.bucket, asset.path)
  return `${asset.tipo}::${asset.referenciaHash}`
}

export function construirInventarioAssets(
  eventos: EventoLegacyRow[],
  storageObjects: StorageObjectRow[] | undefined,
): InventarioAssets {
  const referencias: AssetReference[] = []
  const referenciasPorClave = new Map<string, AssetReference[]>()
  const objetosPorClave = new Map<string, StorageObjectRow>()

  for (const objeto of storageObjects ?? []) {
    const path = texto(objeto.path)
    if (!path) continue
    const normalizado = { ...objeto, path }
    objetosPorClave.set(claveStorage(texto(objeto.bucket), path), normalizado)
  }

  for (const evento of [...eventos].sort((a, b) => a.id.localeCompare(b.id))) {
    const asset = analizarReferenciaAsset(evento.data.imagenUrl)
    if (!asset) continue
    const key = claveReferencia(asset)
    const candidatos = referenciasPorClave.get(key) ?? []
    const referencia: AssetReference = {
      ...asset,
      eventoId: evento.id,
      campo: "imagenUrl",
      estado: asset.tipo === "URL_EXTERNA"
        ? "URL_EXTERNA_NO_VERIFICABLE"
        : asset.tipo === "VALOR_INVALIDO"
          ? "VALOR_NO_VERIFICABLE"
          : objetosPorClave.has(key)
            ? "REFERENCIADO_EXISTENTE"
            : "REFERENCIA_SIN_OBJETO",
    }
    referencias.push(referencia)
    candidatos.push(referencia)
    referenciasPorClave.set(key, candidatos)
  }

  for (const candidatos of referenciasPorClave.values()) {
    const eventoIds = [...new Set(candidatos.map((item) => item.eventoId))].sort()
    if (eventoIds.length < 2) continue
    for (const referencia of candidatos) {
      if (referencia.tipo === "STORAGE_PATH" && referencia.estado === "REFERENCIADO_EXISTENTE") {
        referencia.estado = "REFERENCIA_COMPARTIDA"
      }
    }
  }

  const assets: InventarioAsset[] = []
  for (const [key, candidatos] of referenciasPorClave.entries()) {
    const primero = candidatos[0]
    const eventoIds = [...new Set(candidatos.map((item) => item.eventoId))].sort()
    const compartido = eventoIds.length > 1 && primero.tipo === "STORAGE_PATH" && primero.estado === "REFERENCIA_COMPARTIDA"
    assets.push({
      clave: key,
      tipo: primero.tipo,
      bucket: primero.bucket,
      path: primero.path,
      host: primero.host,
      ruta: primero.ruta,
      estado: compartido
        ? "REFERENCIA_COMPARTIDA"
        : primero.estado,
      eventoIds,
      referenciasHashes: candidatos.map((item) => item.referenciaHash).sort(),
      motivos: compartido
        ? ["El mismo asset Storage es referenciado por más de un evento; requiere revisión humana antes de cualquier migración."]
        : primero.tipo === "URL_EXTERNA"
          ? ["La referencia no permite verificar un objeto Storage sin seguir ni modificar la URL."]
          : primero.tipo === "VALOR_INVALIDO"
            ? ["El valor de imagenUrl no tiene un formato verificable."]
            : primero.estado === "REFERENCIA_SIN_OBJETO"
              ? ["La referencia Storage no coincide con ningún objeto del inventario leído."]
              : ["La referencia se observó sin modificar el documento ni el objeto Storage."],
    })
  }

  for (const [key, objeto] of objetosPorClave.entries()) {
    if (referenciasPorClave.has(key)) continue
    assets.push({
      clave: key,
      tipo: "STORAGE_OBJECT",
      bucket: texto(objeto.bucket),
      path: objeto.path,
      ruta: rutaAsset(objeto.path),
      estado: "OBJETO_NO_REFERENCIADO",
      eventoIds: [],
      referenciasHashes: [],
      motivos: ["El objeto existe en Storage, pero ningún documento de Eventos leído lo referencia explícitamente."],
    })
  }

  const referenciasStorage = referencias.filter((item) => item.tipo === "STORAGE_PATH")
  const contarEstado = (estado: AssetReferenceStatus) => referencias.filter((item) => item.estado === estado).length
  const eventosConAsset = new Set(referencias.map((item) => item.eventoId)).size
  return {
    assets: assets.sort((a, b) => a.clave.localeCompare(b.clave)),
    referencias: referencias.sort((a, b) => a.eventoId.localeCompare(b.eventoId) || a.referenciaHash.localeCompare(b.referenciaHash)),
    totales: {
      referencias: referencias.length,
      referenciasStorage: referenciasStorage.length,
      referenciasStorageExistentes: referenciasStorage.filter((item) => ["REFERENCIADO_EXISTENTE", "REFERENCIA_COMPARTIDA"].includes(item.estado)).length,
      referenciasStorageAusentes: contarEstado("REFERENCIA_SIN_OBJETO"),
      referenciasExternasNoVerificables: contarEstado("URL_EXTERNA_NO_VERIFICABLE"),
      referenciasInvalidas: contarEstado("VALOR_NO_VERIFICABLE"),
      assetsCompartidos: assets.filter((item) => item.estado === "REFERENCIA_COMPARTIDA").length,
      objetosNoReferenciados: assets.filter((item) => item.estado === "OBJETO_NO_REFERENCIADO").length,
      eventosConAsset,
      eventosSinAsset: Math.max(0, eventos.length - eventosConAsset),
    },
  }
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
  opciones: { storageObjects?: StorageObjectRow[]; storageBucket?: string } = {},
): ReporteInventarioEventos {
  const empresaIds = new Set(empresas.map((empresa) => empresa.id))
  const empresasPorId = new Map(empresas.map((empresa) => [empresa.id, empresa]))
  const mapeosPorEvento = indexarMapeos(mapeos)
  const idsEventos = new Set(eventos.map((evento) => evento.id))
  const inventario: InventarioEvento[] = []
  const assets = construirInventarioAssets(eventos, opciones.storageObjects)

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
        assetRefs: assets.referencias.filter((asset) => asset.eventoId === evento.id),
      })
      continue
    }

    const candidatos = mapeosPorEvento.get(evento.id) ?? []
    if (candidatos.length === 0) {
      inventario.push({
        eventoId: evento.id,
        estado: "LEGACY_SIN_MAPEO",
        motivos: ["Requiere mapeo explícito; no se permite inferencia."],
        assetRefs: assets.referencias.filter((asset) => asset.eventoId === evento.id),
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
        assetRefs: assets.referencias.filter((asset) => asset.eventoId === evento.id),
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
        assetRefs: assets.referencias.filter((asset) => asset.eventoId === evento.id),
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
      assetRefs: assets.referencias.filter((asset) => asset.eventoId === evento.id),
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
    assets: assets.assets,
    totalesAssets: assets.totales,
    storageScan: {
      estado: opciones.storageObjects === undefined ? "NO_CONFIGURADO" : "ESCANEADO",
      bucket: texto(opciones.storageBucket),
      objectCount: opciones.storageObjects?.length ?? 0,
    },
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
