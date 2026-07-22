import assert from "node:assert/strict";
import test from "node:test";
import { prepararInicializacionConfiguracion, rutasPermitidas } from "./service";

const base = { expectedRevision: 1, idempotencyKey: "idem", commandId: "cmd", correlationId: "corr", operaciones: [{ tipo: "SET" as const, ruta: "impresion.copiasVenta" as const, valor: 2 }] };
test("B1.3 restringe cada comando a sus rutas canónicas", () => {
  assert.deepEqual(rutasPermitidas({ ...base, comando: "ActualizarPreferenciasImpresion" }), ["impresion.copiasVenta"]);
  assert.throws(() => rutasPermitidas({ ...base, comando: "ActualizarParametrosFiscales" }));
});
test("B1.4 prepara exclusivamente una revisión inicial de origen certificado", () => {
  const c = prepararInicializacionConfiguracion({ empresaId: "empresa", nombreComercial: "Neutral", paisFiscal: "CO", commandId: "init", correlationId: "corr", origen: "BOOTSTRAP" });
  assert.equal(c.revision, 1); assert.equal(c.empresaId, "empresa"); assert.equal(c.ultimaMutacion.origen, "BOOTSTRAP");
  assert.throws(() => prepararInicializacionConfiguracion({ empresaId: "empresa", nombreComercial: "Neutral", paisFiscal: "CO", commandId: "init", correlationId: "corr", origen: "ADMIN" as never }));
});
