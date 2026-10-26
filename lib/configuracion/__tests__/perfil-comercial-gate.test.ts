import assert from "node:assert/strict"
import test from "node:test"
import { puedeDiferirPerfilComercialDiana, type ContextoDiferirPerfilComercial } from "../perfil-comercial-gate"

const autorizado: ContextoDiferirPerfilComercial = {
  empresaId: "distribuidora-las-jimenez",
  vertical: "BODEGA_MVP1",
  rolMembresia: "admin",
  membresiaActiva: true,
  tenantCoincide: true,
  estadoConfiguracion: "LISTA",
}

test("permite diferir el perfil únicamente al admin activo del tenant aprobado y verificado", () => {
  assert.equal(puedeDiferirPerfilComercialDiana(autorizado), true)
  assert.equal(puedeDiferirPerfilComercialDiana({ ...autorizado, empresaId: "otro-tenant" }), false)
  assert.equal(puedeDiferirPerfilComercialDiana({ ...autorizado, rolMembresia: "vendedor" }), false)
  assert.equal(puedeDiferirPerfilComercialDiana({ ...autorizado, membresiaActiva: false }), false)
  assert.equal(puedeDiferirPerfilComercialDiana({ ...autorizado, tenantCoincide: false }), false)
  assert.equal(puedeDiferirPerfilComercialDiana({ ...autorizado, vertical: "GENERAL" }), false)
  assert.equal(puedeDiferirPerfilComercialDiana({ ...autorizado, estadoConfiguracion: "CARGANDO" }), false)
});
