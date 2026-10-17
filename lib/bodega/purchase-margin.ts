export interface PresentacionPrecioVenta {
  id: string
  nombre: string
  factorUnidadBase: number
  precioCOP: number
  activo: boolean
}

export interface MargenCompraPresentacion extends PresentacionPrecioVenta {
  costoPresentacionCOP: number | null
  utilidadBrutaCOP: number | null
  margenBrutoPorcentaje: number | null
}

export function proyectarMargenCompraPorPresentaciones(
  costoCompraUnidadBase: number,
  presentaciones: readonly PresentacionPrecioVenta[],
): MargenCompraPresentacion[] {
  return [];
}
