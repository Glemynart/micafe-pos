import type { VerticalTenant } from "../configuracion/contrato";

export function resolverCallableCompra(vertical: VerticalTenant | null | undefined): "registrarCompraBodegaV1" | "registrarCompraOperativaV1" {
  return vertical === "BODEGA_MVP1" ? "registrarCompraBodegaV1" : "registrarCompraOperativaV1";
}

export function esCompraDeInsumos(vertical: VerticalTenant | null | undefined, nombreEspacio: string | null | undefined): boolean {
  return vertical !== "BODEGA_MVP1" && (nombreEspacio?.toLowerCase().includes("cafeter") ?? false);
}
