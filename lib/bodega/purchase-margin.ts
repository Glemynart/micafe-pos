export interface PresentacionPrecioVenta {
  id: string
  nombre: string
  factorUnidadBase: number
  precioCOP: number
  /** Exact package cost when the supplier cost cannot be represented per unit. */
  costoPresentacionCOP?: number | null
  activo: boolean
}

export interface MargenCompraPresentacion extends Omit<PresentacionPrecioVenta, "activo"> {
  costoPresentacionCOP: number | null
  utilidadBrutaCOP: number | null
  margenBrutoPorcentaje: number | null
}

export function proyectarMargenCompraPorPresentaciones(
  costoCompraUnidadBase: number,
  presentaciones: readonly PresentacionPrecioVenta[],
): MargenCompraPresentacion[] {
  const costoCompraValido = Number.isSafeInteger(costoCompraUnidadBase) && costoCompraUnidadBase > 0;

  return presentaciones
    .filter((presentacion) =>
      presentacion.activo
      && Number.isSafeInteger(presentacion.factorUnidadBase)
      && presentacion.factorUnidadBase > 0
      && Number.isSafeInteger(presentacion.precioCOP)
      && presentacion.precioCOP > 0,
    )
    .map((presentacion) => {
      const costoDirecto = presentacion.costoPresentacionCOP;
      const costoCalculado = Number.isSafeInteger(costoDirecto) && (costoDirecto as number) > 0
        ? costoDirecto
        : costoCompraValido
          ? costoCompraUnidadBase * presentacion.factorUnidadBase
          : Number.NaN;
      const costoPresentacionCOP: number | null = Number.isSafeInteger(costoCalculado) ? Number(costoCalculado) : null;
      const utilidadCalculada = costoPresentacionCOP === null
        ? Number.NaN
        : presentacion.precioCOP - costoPresentacionCOP;
      const utilidadBrutaCOP = Number.isSafeInteger(utilidadCalculada) ? utilidadCalculada : null;

      return {
        id: presentacion.id,
        nombre: presentacion.nombre,
        factorUnidadBase: presentacion.factorUnidadBase,
        precioCOP: presentacion.precioCOP,
        costoPresentacionCOP,
        utilidadBrutaCOP,
        margenBrutoPorcentaje: utilidadBrutaCOP === null
          ? null
          : (utilidadBrutaCOP / presentacion.precioCOP) * 100,
      };
    });
}
