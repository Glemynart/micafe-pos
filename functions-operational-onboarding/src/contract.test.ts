import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { prepararIncorporacionDirecta } from "../../functions/src/operational-onboarding/direct";

test("la solicitud directa conserva el contrato y no acepta autoridad de payload", () => {
  assert.deepEqual(
    prepararIncorporacionDirecta({ nombre: "Vendedor Demo", codigo: "vendedor-demo", pinTemporal: "123456", rol: "vendedor" }),
    { nombre: "Vendedor Demo", codigo: "vendedor-demo", pinTemporal: "123456", rol: "vendedor" },
  );
  assert.deepEqual(
    prepararIncorporacionDirecta({ nombre: "Vendedor Demo", rol: "vendedor", empresaId: "otro-tenant" } as never),
    { nombre: "Vendedor Demo", codigo: null, pinTemporal: null, rol: "vendedor" },
  );
  assert.throws(
    () => prepararIncorporacionDirecta({ nombre: "Vendedor Demo", rol: "vendedor", uid: "cliente-controlado" }),
    (error: unknown) => error instanceof HttpsError && error.code === "invalid-argument",
  );
});
