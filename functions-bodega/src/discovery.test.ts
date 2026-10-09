import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = resolve(sourceRoot, "node_modules/firebase-functions/lib/bin/firebase-functions.js");

async function port() {
  const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); server.close();
  if (!address || typeof address === "string") throw new Error("DISCOVERY_PORT_UNAVAILABLE");
  return address.port;
}

async function manifest(value: number): Promise<Record<string, unknown>> {
  let error: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { const response = await fetch(`http://127.0.0.1:${value}/__/functions.yaml`); if (response.ok) return JSON.parse(await response.text()) as Record<string, unknown>; error = new Error(`DISCOVERY_HTTP_${response.status}`); } catch (cause) { error = cause; }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
  }
  throw error;
}

test("saas-bodega descubre callables, scheduler ADR-064 y trigger push ADR-065 sin Secrets", async () => {
  const value = await port();
  const child = spawn(process.execPath, [bin], { cwd: sourceRoot, env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(value) }, stdio: "pipe" });
  after(() => child.kill());
  const result = await manifest(value);
  const endpoints = result.endpoints as Record<string, { region?: unknown; callableTrigger?: unknown; scheduleTrigger?: { schedule?: unknown; timeZone?: unknown }; eventTrigger?: { eventType?: unknown; eventFilters?: Record<string, unknown> } }>;
  assert.deepEqual(Object.keys(endpoints).sort(), [
    "actualizarPresentacionComercialV1", "cancelarProgramacionPedidoBodegaV1", "cancelarSolicitudVentaBodegaV1",
    "confirmarVentaBodegaV1", "consultarAgendaPedidosBodegaV1", "consultarSolicitudesVentaBodegaV1",
    "convertirProgramacionPedidoBodegaV1", "crearArticuloInventarioV1", "crearCategoriaBodegaV1",
    "crearClienteVendedorV1", "crearPresentacionComercialV1", "crearProgramacionPedidoBodegaV1",
    "crearSolicitudVentaBodegaV1", "notificarSolicitudVentaBodegaPendienteV1", "reconciliarAgendaPedidosBodegaV1", "resolverProgramacionPedidoBodegaV1",
    "resolverSolicitudVentaBodegaV1",
  ]);
  for (const [name, endpoint] of Object.entries(endpoints)) {
    assert.deepEqual(endpoint.region, ["us-central1"]);
    if (name === "reconciliarAgendaPedidosBodegaV1") {
      assert.equal(endpoint.callableTrigger, undefined);
      assert.equal(endpoint.scheduleTrigger?.schedule, "every 5 minutes");
      assert.equal(endpoint.scheduleTrigger?.timeZone, "UTC");
    } else if (name === "notificarSolicitudVentaBodegaPendienteV1") {
      assert.equal(endpoint.callableTrigger, undefined);
      assert.equal(endpoint.eventTrigger?.eventType, "google.cloud.firestore.document.v1.created");
      assert.equal(JSON.stringify(endpoint.eventTrigger).includes("empresas/{empresaId}/solicitudes_venta_bodega/{solicitudId}"), true);
    } else assert.deepEqual(endpoint.callableTrigger, {});
  }
  assert.deepEqual(result.params ?? [], []);
  const serialized = JSON.stringify(result).toLowerCase();
  for (const forbidden of ["operational_pin_pepper", "wompi", "dusema", "email_invitation", "secret"]) assert.equal(serialized.includes(forbidden), false);
});
