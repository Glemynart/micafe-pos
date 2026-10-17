import assert from "node:assert/strict";
import test from "node:test";
import { permiteGestionOfertasTenant } from "./tenant-offer-guard";

test("la gestión comercial se habilita en producción y staging con la facultad", () => {
  assert.equal(permiteGestionOfertasTenant("micafe-pos", ["COMERCIAL_GOBERNAR"]), true);
  assert.equal(permiteGestionOfertasTenant("micafe-pos-staging", ["COMERCIAL_GOBERNAR"]), true);
});

test("la gestión comercial permanece bloqueada sin facultad o fuera de los proyectos permitidos", () => {
  assert.equal(permiteGestionOfertasTenant(undefined, ["COMERCIAL_GOBERNAR"]), false);
  assert.equal(permiteGestionOfertasTenant("micafe-migration-lab-sebas26", ["COMERCIAL_GOBERNAR"]), false);
  assert.equal(permiteGestionOfertasTenant("otro-proyecto", ["COMERCIAL_GOBERNAR"]), false);
  assert.equal(permiteGestionOfertasTenant("micafe-pos", ["PLATAFORMA_CONSULTAR"]), false);
  assert.equal(permiteGestionOfertasTenant("micafe-pos-staging", ["PLATAFORMA_CONSULTAR"]), false);
});
