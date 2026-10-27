import assert from "node:assert/strict";
import test from "node:test";
import { resolverCallableOperacionBodega } from "./operation-routing";

const RENOMBRES_BODEGA = {
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
} as const;

test("Bodega selecciona IDs públicos exclusivos para los once endpoints en conflicto", () => {
  for (const [legacyId, bodegaId] of Object.entries(RENOMBRES_BODEGA)) {
    assert.equal(resolverCallableOperacionBodega("BODEGA_MVP1", legacyId), bodegaId);
  }
});

test("GENERAL y tenants sin vertical resuelto conservan los IDs existentes", () => {
  for (const vertical of ["GENERAL", null, undefined] as const) {
    for (const legacyId of Object.keys(RENOMBRES_BODEGA)) {
      assert.equal(resolverCallableOperacionBodega(vertical, legacyId), legacyId);
    }
  }
});
