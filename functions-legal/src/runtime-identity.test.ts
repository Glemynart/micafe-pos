import assert from "node:assert/strict";
import test from "node:test";
import { obtenerCuentaRuntimeLegal } from "./runtime-identity";

test("usa la cuenta dedicada solo en staging y conserva default en los demás proyectos", () => {
  assert.equal(obtenerCuentaRuntimeLegal("micafe-pos-staging"), "saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com");
  assert.equal(obtenerCuentaRuntimeLegal("micafe-pos"), "default");
  assert.equal(obtenerCuentaRuntimeLegal(undefined), "default");
});
