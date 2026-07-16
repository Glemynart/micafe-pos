import type { ModificadorGrupo } from '@/lib/modificador-grupos-service'
import type { ProductoModificadorGrupo } from '@/lib/producto-modificador-grupos-service'

export interface OpcionModificadorResuelta {
  id: string
  nombre: string
  precioDelta: number
  default: boolean
  cocinaNombre?: string
}

export interface GrupoModificadorResuelto {
  id: string
  nombre: string
  descripcion?: string
  orden: number
  minSeleccion: number
  maxSeleccion: number
  opciones: OpcionModificadorResuelta[]
  inconsistencias: string[]
}

export interface SeleccionModificadorTemporal {
  grupoId: string
  opcionIds: string[]
}

export type SeleccionesModificador = Record<string, string[]>

export function resolverGruposProducto(
  productoId: string,
  grupos: ModificadorGrupo[],
  relaciones: ProductoModificadorGrupo[],
): GrupoModificadorResuelto[] {
  const gruposPorId = new Map(grupos.filter((grupo) => grupo.activo).map((grupo) => [grupo.id, grupo]))

  return relaciones
    .filter((relacion) => relacion.productoId === productoId && relacion.activo)
    .map((relacion) => {
      const grupo = gruposPorId.get(relacion.grupoId)
      if (!grupo) {
        return {
          id: relacion.grupoId,
          nombre: 'Grupo no disponible',
          orden: relacion.orden,
          minSeleccion: 0,
          maxSeleccion: 0,
          opciones: [],
          inconsistencias: ['El grupo fue desactivado o ya no está disponible.'],
        }
      }

      const opcionesPermitidas = relacion.opcionesPermitidas
        ? new Set(relacion.opcionesPermitidas)
        : null
      const esOpcionElegible = (opcion: typeof grupo.opciones[number]) => {
          const override = relacion.opcionOverrides?.[opcion.id]
          return opcion.activo && (!opcionesPermitidas || opcionesPermitidas.has(opcion.id)) && override?.activo !== false
        }
      const opciones = grupo.opciones
        .filter(esOpcionElegible)
        .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
        .map((opcion) => ({
          id: opcion.id,
          nombre: opcion.nombre,
          precioDelta: relacion.opcionOverrides?.[opcion.id]?.precioDelta ?? opcion.precioDelta,
          default: opcion.default === true,
          ...(opcion.cocinaNombre ? { cocinaNombre: opcion.cocinaNombre } : {}),
        }))

      const minSeleccion = relacion.minSeleccion ?? grupo.minSeleccion
      const maxSeleccion = relacion.maxSeleccion ?? grupo.maxSeleccion
      const defaults = opciones.filter((opcion) => opcion.default).length
      const inconsistencias: string[] = []

      if (opciones.length === 0) inconsistencias.push('No hay opciones activas disponibles para este grupo.')
      if (maxSeleccion < minSeleccion) inconsistencias.push('La selección mínima es mayor que la máxima.')
      if (maxSeleccion > opciones.length) inconsistencias.push('El máximo supera las opciones disponibles.')
      if (defaults > maxSeleccion) inconsistencias.push('Las opciones predeterminadas superan el máximo permitido.')
      if (grupo.opciones.some((opcion) => opcion.default && !esOpcionElegible(opcion))) {
        inconsistencias.push('Una opción predeterminada no está disponible para este producto.')
      }
      if (opciones.some((opcion) => !Number.isFinite(opcion.precioDelta))) {
        inconsistencias.push('Una opción tiene un precio adicional inválido.')
      }

      return {
        id: grupo.id,
        nombre: grupo.nombre,
        descripcion: grupo.descripcion,
        orden: relacion.orden,
        minSeleccion,
        maxSeleccion,
        opciones,
        inconsistencias,
      }
    })
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
}

export function crearSeleccionesIniciales(grupos: GrupoModificadorResuelto[]): SeleccionesModificador {
  return Object.fromEntries(grupos.map((grupo) => [
    grupo.id,
    grupo.opciones.filter((opcion) => opcion.default).map((opcion) => opcion.id),
  ]))
}

export function validarSelecciones(
  grupos: GrupoModificadorResuelto[],
  selecciones: SeleccionesModificador,
): Record<string, string> {
  const errores: Record<string, string> = {}

  for (const grupo of grupos) {
    if (grupo.inconsistencias.length > 0) {
      errores[grupo.id] = grupo.inconsistencias[0]
      continue
    }

    const opcionIds = selecciones[grupo.id] ?? []
    const opcionesValidas = new Set(grupo.opciones.map((opcion) => opcion.id))
    if (new Set(opcionIds).size !== opcionIds.length || opcionIds.some((id) => !opcionesValidas.has(id))) {
      errores[grupo.id] = 'La selección contiene opciones no disponibles.'
    } else if (opcionIds.length < grupo.minSeleccion) {
      errores[grupo.id] = `Selecciona al menos ${grupo.minSeleccion}.`
    } else if (opcionIds.length > grupo.maxSeleccion) {
      errores[grupo.id] = `Selecciona como máximo ${grupo.maxSeleccion}.`
    }
  }

  return errores
}

export function calcularPrecioModificadores(
  grupos: GrupoModificadorResuelto[],
  selecciones: SeleccionesModificador,
): number {
  return grupos.reduce((total, grupo) => {
    const seleccionadas = new Set(selecciones[grupo.id] ?? [])
    return total + grupo.opciones
      .filter((opcion) => seleccionadas.has(opcion.id))
      .reduce((subtotal, opcion) => subtotal + opcion.precioDelta, 0)
  }, 0)
}

export function serializarSelecciones(selecciones: SeleccionesModificador): SeleccionModificadorTemporal[] {
  return Object.entries(selecciones)
    .filter(([, opcionIds]) => opcionIds.length > 0)
    .map(([grupoId, opcionIds]) => ({ grupoId, opcionIds: [...opcionIds] }))
}
