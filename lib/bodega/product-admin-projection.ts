export interface ProductoBodegaAdmin {
  id: string;
  nombre: string;
  categoriaId: string;
  espacioId: string;
  unidad: string;
  costoUnidadBaseCOP: number;
  stock: number;
  stockReservado: number;
  stockMinimo: number;
  activo: boolean;
}

export function proyectarProductoBodegaAdmin(
  id: string,
  data: Record<string, unknown>,
): ProductoBodegaAdmin {
  return {
    id,
    nombre: String(data.nombre ?? ""),
    categoriaId: String(data.categoriaId ?? ""),
    espacioId: String(data.espacioId ?? ""),
    unidad: String(data.unidadMedida ?? data.unidad ?? "und"),
    costoUnidadBaseCOP: Number(data.costo ?? 0),
    stock: Number(data.stock ?? 0),
    stockReservado: Number(data.stockReservado ?? 0),
    stockMinimo: Number(data.stockMinimo ?? 0),
    activo: data.activo === true,
  };
}
