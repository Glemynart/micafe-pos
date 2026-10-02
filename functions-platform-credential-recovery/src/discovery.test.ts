import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

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

async function manifest(port: number): Promise<Record<string, unknown>> {
  let error: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__/functions.yaml`);
      if (response.ok) return JSON.parse(await response.text()) as Record<string, unknown>;
      error = new Error(`DISCOVERY_HTTP_${response.status}`);
    } catch (cause) { error = cause; }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw error;
}

test("declara exactamente las tres callables de recuperaciÃ³n y el Secret esperado", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [bin], {
    cwd: sourceRoot,
    env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(port) },
    stdio: "pipe",
  });
  after(() => child.kill());
  const result = await manifest(port);
  const endpoints = result.endpoints as Record<string, { region?: unknown; secretEnvironmentVariables?: unknown }>;
  assert.deepEqual(Object.keys(endpoints).sort(), [
    "activarRestablecimientoCredencial",
    "reemitirRestablecimientoCredencialAdministradorTenantSaas",
    "restablecerCredencialAdministradorTenantSaas",
  ]);
  for (const endpoint of Object.values(endpoints)) {
    assert.deepEqual(endpoint.region, ["us-central1"]);
    assert.match(JSON.stringify(endpoint), /OPERATIONAL_PIN_PEPPER/);
  }
});

test("retira las tres exportaciones del index legacy", async () => {
  const legacy = await readFile(resolve(sourceRoot, "../functions/src/index.ts"), "utf8");
  for (const name of [
    "restablecerCredencialAdministradorTenantSaas",
    "reemitirRestablecimientoCredencialAdministradorTenantSaas",
    "activarRestablecimientoCredencial",
  ]) assert.equal(legacy.includes(name), false);
});
