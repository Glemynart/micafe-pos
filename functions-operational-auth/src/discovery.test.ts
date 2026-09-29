import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(here, "..");
const firebaseFunctionsBin = resolve(sourceRoot, "node_modules/firebase-functions/lib/bin/firebase-functions.js");

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  if (!address || typeof address === "string") throw new Error("DISCOVERY_PORT_UNAVAILABLE");
  return address.port;
}

async function waitForManifest(port: number): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__/functions.yaml`);
      if (response.ok) return JSON.parse(await response.text()) as Record<string, unknown>;
      lastError = new Error(`DISCOVERY_HTTP_${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw lastError ?? new Error("DISCOVERY_TIMEOUT");
}

test("el manifiesto de autenticación operativa declara solo el callable y Secret autorizados", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [firebaseFunctionsBin], {
    cwd: sourceRoot,
    env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(port) },
    stdio: "pipe",
  });
  after(() => child.kill());

  const manifest = await waitForManifest(port);
  const endpoints = manifest.endpoints as Record<string, unknown>;
  assert.deepEqual(Object.keys(endpoints), ["autenticarOperativo"]);
  assert.deepEqual((endpoints.autenticarOperativo as { region?: unknown }).region, ["us-central1"]);
  assert.deepEqual((endpoints.autenticarOperativo as { callableTrigger?: unknown }).callableTrigger, {});
  assert.deepEqual((manifest.params as Array<{ name?: unknown }>).map((param) => param.name), ["OPERATIONAL_PIN_PEPPER"]);

  const serialized = JSON.stringify(manifest);
  for (const forbidden of ["WOMPI_EVENTS_SECRET", "EMAIL_INVITATION_TOKEN_PEPPER", "DUSEMA_"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
