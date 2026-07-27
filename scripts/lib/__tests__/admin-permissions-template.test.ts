import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_PERMISOS_CANONICOS,
  ADMIN_PERMISOS_LEGACY_SIN_CUENTAS_COBRO,
  PERMISO_ADMIN_FALTANTE,
  diagnosticarPermisosAdmin,
  normalizarPermisos,
  resolverPoliticaPlantillaAdmin,
} from "../admin-permissions-template";

test("ADMIN_PERMISOS_CANONICOS incluye cuentas_cobro exactamente una vez", () => {
  assert.equal(ADMIN_PERMISOS_CANONICOS.includes(PERMISO_ADMIN_FALTANTE), true);
  assert.equal(
    ADMIN_PERMISOS_CANONICOS.filter((permiso) => permiso === PERMISO_ADMIN_FALTANTE).length,
    1,
  );
});

test("diagnosticarPermisosAdmin reconoce la plantilla legacy sin cuentas_cobro", () => {
  assert.equal(
    diagnosticarPermisosAdmin(ADMIN_PERMISOS_LEGACY_SIN_CUENTAS_COBRO),
    "LEGACY_SIN_CUENTAS_COBRO",
  );
});

test("diagnosticarPermisosAdmin reconoce la plantilla canonica aunque llegue desordenada", () => {
  const desordenada = [...ADMIN_PERMISOS_CANONICOS].reverse();
  assert.equal(diagnosticarPermisosAdmin(desordenada), "CANONICO");
});

test("normalizarPermisos elimina duplicados y ordena", () => {
  assert.deepEqual(
    normalizarPermisos(["sell", "cuentas_cobro", "sell"]),
    ["cuentas_cobro", "sell"],
  );
});

test("diagnosticarPermisosAdmin marca como OTRO cualquier drift distinto del caso legacy esperado", () => {
  const drift = ADMIN_PERMISOS_CANONICOS.filter((permiso) => permiso !== "reports");
  assert.equal(diagnosticarPermisosAdmin(drift), "OTRO");
});

test("plantilla CANONICA no requiere cambios", () => {
  assert.equal(
    resolverPoliticaPlantillaAdmin(diagnosticarPermisosAdmin(ADMIN_PERMISOS_CANONICOS)),
    "SIN_CAMBIOS",
  );
});

test("plantilla LEGACY_SIN_CUENTAS_COBRO se autocorrige", () => {
  assert.equal(
    resolverPoliticaPlantillaAdmin(diagnosticarPermisosAdmin(ADMIN_PERMISOS_LEGACY_SIN_CUENTAS_COBRO)),
    "AUTOCORREGIR_LEGACY",
  );
});

test("plantilla OTRO requiere revisión manual y no debe autocorregirse", () => {
  const drift = ADMIN_PERMISOS_CANONICOS.filter((permiso) => permiso !== "reports");
  assert.equal(
    resolverPoliticaPlantillaAdmin(diagnosticarPermisosAdmin(drift)),
    "REVISION_MANUAL",
  );
});

test("plantilla INVALIDO requiere revisión manual y no debe autocorregirse", () => {
  assert.equal(
    resolverPoliticaPlantillaAdmin(diagnosticarPermisosAdmin("no-es-arreglo")),
    "REVISION_MANUAL",
  );
});
