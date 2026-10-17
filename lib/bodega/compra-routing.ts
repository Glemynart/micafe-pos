import type { VerticalTenant } from "../configuracion/contrato";

export function resolverCallableCompra(vertical: VerticalTenant | null | undefined): "registrarCompraBodegaV1" | "registrarCompraOperativaV1" {
  return vertical === "BODEGA_MVP1" ? "registrarCompraBodegaV1" : "registrarCompraOperativaV1";
}

export function esCompraDeInsumos(vertical: VerticalTenant | null | undefined, nombreEspacio: string | null | undefined): boolean {
  return vertical !== "BODEGA_MVP1" && (nombreEspacio?.toLowerCase().includes("cafeter") ?? false);
}

export function unidadMedidaCompraPredeterminada(
  vertical: VerticalTenant | null | undefined,
  nombreEspacio: string | null | undefined,
): "g" | "unidades" {
  return esCompraDeInsumos(vertical, nombreEspacio) ? "g" : "unidades";
}

export function sincronizarUnidadPredeterminadaEnItemsVacios<
  T extends { insumoId: string; cantidad: number; costoUnitario: number; unidadMedida: string },
>(items: readonly T[], unidad: "g" | "unidades"): T[] {
  return items.map((item) =>
    item.insumoId || item.cantidad > 0 || item.costoUnitario > 0
      ? item
      : { ...item, unidadMedida: unidad },
  );
}
