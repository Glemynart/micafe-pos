import type { VerticalTenant } from "@/lib/configuracion/contrato";

const CALLABLES_BODEGA: Readonly<Record<string, string>> = {
  crearClienteVendedorV1: "crearClienteVendedorBodegaV1",
  crearPresentacionComercialV1: "crearPresentacionComercialBodegaV1",
  actualizarPresentacionComercialV1: "actualizarPresentacionComercialBodegaV1",
  consultarOfertasBodegaV1: "consultarOfertasBodegaV1",
  crearOfertaBodegaV1: "crearOfertaBodegaV1",
  actualizarOfertaBodegaV1: "actualizarOfertaBodegaV1",
  cerrarOfertaBodegaV1: "cerrarOfertaBodegaV1",
  crearArticuloInventarioV1: "crearArticuloInventarioBodegaV1",
  confirmarVentaBodegaV1: "confirmarVentaVendedorBodegaV1",
  consultarCarteraClienteBodegaV1: "consultarCarteraClienteBodegaV1",
  registrarAbonoVentaBodegaV1: "registrarAbonoVentaBodegaV1",
  consultarCatalogoPresentacionesVendedorV1: "consultarCatalogoPresentacionesVendedorBodegaV1",
  consultarClientesVendedorV1: "consultarClientesVendedorBodegaV1",
  consultarMisVentasVendedorV1: "consultarMisVentasVendedorBodegaV1",
  actualizarArticuloInventarioV1: "actualizarArticuloInventarioBodegaV1",
  abrirTurnoOperativoV1: "abrirTurnoBodegaV1",
  cerrarTurnoOperativoV1: "cerrarTurnoBodegaV1",
};

export function resolverCallableOperacionBodega(
  vertical: VerticalTenant | null | undefined,
  nombre: string,
): string {
  if (vertical !== "BODEGA_MVP1") return nombre;
  return CALLABLES_BODEGA[nombre] ?? nombre;
}
