import type { ModificadorGrupoSnapshot } from '@/lib/configured-line'

/**
 * Detalle comercial derivado exclusivamente del snapshot U4 de una línea.
 * No resuelve IDs ni consulta el catálogo de modificadores.
 */
export interface ModificadorTicketSnapshot {
  nombre: string
  precioDelta: number
}

function opcionesSeleccionadas(modificadores?: ModificadorGrupoSnapshot[]): Array<{
  nombre: string
  precioDelta: number
  cocinaNombre?: string
}> {
  if (!Array.isArray(modificadores)) return []

  return modificadores.flatMap((grupo) => {
    if (!Array.isArray(grupo.opciones)) return []
    return grupo.opciones.filter((opcion) => (
      typeof opcion.nombre === 'string'
      && opcion.nombre.trim().length > 0
      && Number.isFinite(opcion.precioDelta)
    ))
  })
}

/** Proyección para tickets: nombre comercial y adicional efectivo congelado. */
export function proyectarModificadoresTicket(
  modificadores?: ModificadorGrupoSnapshot[],
): ModificadorTicketSnapshot[] | undefined {
  const opciones = opcionesSeleccionadas(modificadores).map((opcion) => ({
    nombre: opcion.nombre,
    precioDelta: opcion.precioDelta,
  }))

  return opciones.length > 0 ? opciones : undefined
}

/** Proyección para cocina: prioriza el nombre operativo, sin precios ni IDs. */
export function proyectarModificadoresCocina(
  modificadores?: ModificadorGrupoSnapshot[],
): string[] {
  return opcionesSeleccionadas(modificadores).map((opcion) => (
    opcion.cocinaNombre?.trim() || opcion.nombre
  ))
}
