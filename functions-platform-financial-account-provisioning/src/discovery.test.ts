import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = resolve(sourceRoot, "node_modules/firebase-functions/lib/bin/firebase-functions.js");

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  if (!address || typeof address === "string") throw new Error("DISCOVERY_PORT_UNAVAILABLE");
  return address.port;
}

test("declara exactamente la callable de provisionamiento sin Secrets", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [bin], {
    cwd: sourceRoot,
    env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(port) },
    stdio: "pipe",
  });
  after(() => child.kill());
  let manifest: Record<string, any> | undefined;
  for (let attempt = 0; attempt < 50 && !manifest; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__/functions.yaml`);
      if (response.ok) manifest = await response.json() as Record<string, any>;
    } catch { /* proceso aún iniciando */ }
    if (!manifest) await new Promise((done) => setTimeout(done, 100));
  }
  if (!manifest) throw new Error("DISCOVERY_TIMEOUT");
  const endpoints = manifest.endpoints as Record<string, any>;
  assert.deepEqual(Object.keys(endpoints), ["provisionarCuentaOperativaTenantSaas"]);
  assert.deepEqual(endpoints.provisionarCuentaOperativaTenantSaas.region, ["us-central1"]);
  assert.deepEqual(endpoints.provisionarCuentaOperativaTenantSaas.secretEnvironmentVariables ?? [], []);
});
