import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { exigirCompraBodegaHabilitada } from "./purchase-policy";

test("solo permite registrar compras cuando Bodega y su módulo están habilitados", () => {
  assert.doesNotThrow(() => exigirCompraBodegaHabilitada({
    vertical: "BODEGA_MVP1",
    modulos: { habilitados: ["inventory", "purchases"] },
  }));
});

test("rechaza verticales generales y configuraciones sin compras", () => {
  assert.throws(
    () => exigirCompraBodegaHabilitada({ vertical: "GENERAL", modulos: { habilitados: ["purchases"] } }),
    error => error instanceof HttpsError && (error.details as { code?: string })?.code === "VERTICAL_NO_COMPATIBLE",
  );
  assert.throws(
    () => exigirCompraBodegaHabilitada({ vertical: "BODEGA_MVP1", modulos: { habilitados: ["inventory"] } }),
    error => error instanceof HttpsError && (error.details as { code?: string })?.code === "MODULO_NO_HABILITADO",
  );
});
