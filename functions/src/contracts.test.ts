import assert from "node:assert/strict";
import test from "node:test";
import { esPinValido, esRolTenant, idCredencialOperativa, normalizarCodigo } from "./contracts";

test("normalizarCodigo acepta el formato canónico por tenant", () => {
  assert.equal(normalizarCodigo("  Caja-01  "), "caja-01");
  assert.equal(normalizarCodigo("ab"), null);
  assert.equal(normalizarCodigo("caja 01"), null);
});

test("el PIN operativo requiere exactamente seis dígitos", () => {
  assert.equal(esPinValido("123456"), true);
  assert.equal(esPinValido("12345"), false);
  assert.equal(esPinValido("abcdef"), false);
});

test("solo los roles tenant canónicos son válidos", () => {
  assert.equal(esRolTenant("supervisor"), true);
  assert.equal(esRolTenant("superadmin"), false);
  assert.equal(idCredencialOperativa("empresa-a", "caja-01"), "empresa-a_caja-01");
});
