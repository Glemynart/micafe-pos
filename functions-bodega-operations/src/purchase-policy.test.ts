import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { exigirCompraBodegaHabilitada, validarPayloadCompraBodega } from "./purchase-policy";

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

test("Bodega solo admite artículos de tipo producto", () => {
  assert.doesNotThrow(() => validarPayloadCompraBodega({ items: [{ tipo: "producto" }] }));
  assert.throws(
    () => validarPayloadCompraBodega({ items: [{ tipo: "insumo" }] }),
    error => error instanceof HttpsError && (error.details as { code?: string })?.code === "TIPO_ARTICULO_NO_PERMITIDO",
  );
});
