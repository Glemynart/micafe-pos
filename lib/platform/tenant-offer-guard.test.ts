import assert from "node:assert/strict";
import test from "node:test";
import { permiteGestionOfertasTenant } from "./tenant-offer-guard";

test("la gestión comercial solo se habilita en micafe-pos-staging con la facultad", () => {
  assert.equal(permiteGestionOfertasTenant("micafe-pos-staging", ["COMERCIAL_GOBERNAR"]), true);
  assert.equal(permiteGestionOfertasTenant("micafe-pos", ["COMERCIAL_GOBERNAR"]), false);
  assert.equal(permiteGestionOfertasTenant(undefined, ["COMERCIAL_GOBERNAR"]), false);
  assert.equal(permiteGestionOfertasTenant("micafe-pos-staging", ["PLATAFORMA_CONSULTAR"]), false);
});
