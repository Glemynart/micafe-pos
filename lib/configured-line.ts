import type { ImpuestoTipo } from '@/lib/impuestos-service'
import type { GrupoModificadorResuelto, SeleccionModificadorTemporal } from '@/lib/modifier-selection'

export interface ModificadorOpcionSnapshot {
  opcionId: string
  nombre: string
  precioDelta: number
  cocinaNombre?: string
}

export interface ModificadorGrupoSnapshot {
  grupoId: string
  opcionIds: string[]
  nombreGrupo?: string
  opciones?: ModificadorOpcionSnapshot[]
}

export interface ConfiguracionLineaSnapshot {
  schemaVersion: 1
  configurationKey: string
  precioBaseUnitario: number
  modificadores?: ModificadorGrupoSnapshot[]
}

export interface LineaFusionable {
  id: string
  schemaVersion?: number
  configurationKey?: string
  price: number
  cost: number
  category: string
  impuestoTipo?: ImpuestoTipo
}

function codificarId(id: string): string {
  return encodeURIComponent(id)
}

export function crearConfigurationKey(
  productoId: string,
  modificadores: ReadonlyArray<Pick<ModificadorGrupoSnapshot, 'grupoId' | 'opcionIds'>>,
): string {
  const grupos = modificadores
    .filter((grupo) => grupo.opcionIds.length > 0)
    .map((grupo) => ({
      grupoId: grupo.grupoId,
      opcionIds: [...new Set(grupo.opcionIds)].sort(),
    }))
    .sort((a, b) => a.grupoId.localeCompare(b.grupoId))

  const partes = grupos.map((grupo) =>
    `g:${codificarId(grupo.grupoId)}:${grupo.opcionIds.map(codificarId).join(',')}`,
  )

  return [`mod:v1`, `p:${codificarId(productoId)}`, ...partes].join('|')
}

export function crearConfiguracionSimple(
  productoId: string,
  precioBaseUnitario: number,
): ConfiguracionLineaSnapshot {
  return {
    schemaVersion: 1,
    configurationKey: crearConfigurationKey(productoId, []),
    precioBaseUnitario,
  }
}

export function crearConfiguracionModificadores(
  productoId: string,
  precioBaseUnitario: number,
  grupos: GrupoModificadorResuelto[],
  selecciones: SeleccionModificadorTemporal[],
): ConfiguracionLineaSnapshot {
  const seleccionPorGrupo = new Map(selecciones.map((seleccion) => [
    seleccion.grupoId,
    new Set(seleccion.opcionIds),
  ]))

  const modificadores = grupos.flatMap((grupo) => {
    const seleccionadas = seleccionPorGrupo.get(grupo.id)
    if (!seleccionadas || seleccionadas.size === 0) return []

    const opciones = grupo.opciones
      .filter((opcion) => seleccionadas.has(opcion.id))
      .map((opcion) => ({
        opcionId: opcion.id,
        nombre: opcion.nombre,
        precioDelta: opcion.precioDelta,
        ...(opcion.cocinaNombre ? { cocinaNombre: opcion.cocinaNombre } : {}),
      }))

    return [{
      grupoId: grupo.id,
      opcionIds: opciones.map((opcion) => opcion.opcionId),
      nombreGrupo: grupo.nombre,
      opciones,
    }]
  })

  return {
    schemaVersion: 1,
    configurationKey: crearConfigurationKey(productoId, modificadores),
    precioBaseUnitario,
    ...(modificadores.length > 0 ? { modificadores } : {}),
  }
}

export function sonLineasComercialmenteEquivalentes(
  existente: LineaFusionable,
  nueva: LineaFusionable,
): boolean {
  return existente.schemaVersion === 1 && nueva.schemaVersion === 1
    && typeof existente.configurationKey === 'string'
    && existente.configurationKey === nueva.configurationKey
    && existente.id === nueva.id
    && existente.price === nueva.price
    && existente.cost === nueva.cost
    && existente.category === nueva.category
    && existente.impuestoTipo === nueva.impuestoTipo
}
