import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { resolve } from "node:path";

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  if (!address || typeof address === "string") throw new Error("PORT");
  return address.port;
}

test("saas-legal descubre únicamente sus callables declaradas", async () => {
  const port = await freePort();
  const bin = resolve(import.meta.dirname, "../node_modules/firebase-functions/lib/bin/firebase-functions.js");
  const child = spawn(process.execPath, [bin], { cwd: resolve(import.meta.dirname, ".."), env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(port) } });
  after(() => child.kill());
  let payload: any;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__/functions.yaml`);
      if (response.ok) { payload = JSON.parse(await response.text()); break; }
    } catch { /* el discovery server puede tardar en abrir el puerto */ }
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(payload);
  assert.deepEqual(Object.keys(payload.endpoints).sort(), ["aceptarDocumentosLegalesTenant", "consultarEstadoLegalTenant", "tramitarReclamoPrivacidadSaas"]);
  assert.deepEqual(payload.endpoints.consultarEstadoLegalTenant.region, ["us-central1"]);
  assert.deepEqual(payload.endpoints.aceptarDocumentosLegalesTenant.region, ["us-central1"]);
  assert.deepEqual(payload.params ?? [], []);
});
