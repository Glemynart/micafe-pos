import assert from "node:assert/strict";
import test from "node:test";
import { esPinValido, esRolTenant, idCredencialOperativa, normalizarCodigo } from "./contracts";
import { esFacultadPlataforma, facultadesValidas, FACULTADES_BOOTSTRAP_POR_DEFECTO } from "./platform/contracts";

test("normalizarCodigo acepta el formato canónico por tenant", () => {
  assert.equal(normalizarCodigo("  Caja-01  "), "caja-01");
  assert.equal(normalizarCodigo("Cafeatrato Maria"), "cafeatrato-maria");
  assert.equal(normalizarCodigo("ab"), null);
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

test("DUSEMA_TENANT_CONSULTAR pertenece al contrato y no al bootstrap por defecto", () => {
  assert.equal(esFacultadPlataforma("DUSEMA_TENANT_CONSULTAR"), true);
  assert.equal(facultadesValidas(["DUSEMA_TENANT_CONSULTAR"]), true);
  assert.equal(FACULTADES_BOOTSTRAP_POR_DEFECTO.includes("DUSEMA_TENANT_CONSULTAR"), false);
});
