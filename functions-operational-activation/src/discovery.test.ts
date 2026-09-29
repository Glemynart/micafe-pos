import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
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

test("saas-operational-activation declara únicamente la callable y el Secret aprobados", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [firebaseFunctionsBin], {
    cwd: sourceRoot,
    env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(port) },
    stdio: "pipe",
  });
  after(() => child.kill());
  const manifest = await waitForManifest(port);
  const endpoints = manifest.endpoints as Record<string, unknown>;
  assert.deepEqual(Object.keys(endpoints), ["activarIncorporacionDirecta"]);
  const endpoint = endpoints.activarIncorporacionDirecta as { region?: unknown; callableTrigger?: unknown; secretEnvironmentVariables?: unknown };
  assert.deepEqual(endpoint.region, ["us-central1"]);
  assert.deepEqual(endpoint.callableTrigger, {});
  assert.deepEqual(endpoint.secretEnvironmentVariables, [{ key: "OPERATIONAL_PIN_PEPPER" }]);
  assert.deepEqual(manifest.params, [{ type: "secret", name: "OPERATIONAL_PIN_PEPPER" }]);
  const serialized = JSON.stringify(manifest);
  for (const forbidden of ["WOMPI_EVENTS_SECRET", "EMAIL_INVITATION_TOKEN_PEPPER", "DUSEMA_"]) {
    assert.equal(serialized.includes(forbidden), false, `secreto ajeno en discovery: ${forbidden}`);
  }
});

test("el adapter no importa entrypoints ni superficies ajenas", async () => {
  const source = await readFile(resolve(sourceRoot, "src/index.ts"), "utf8");
  for (const forbidden of [
    "functions/src/index",
    "functions/src/incorporaciones.ts",
    "incorporaciones-service",
    "operational-auth.ts",
    "permisosPredeterminados",
    "wompi",
    "dusema",
    "EMAIL_INVITATION_TOKEN_PEPPER",
    "WOMPI_EVENTS_SECRET",
  ]) {
    assert.equal(source.toLowerCase().includes(forbidden.toLowerCase()), false, `import ajeno: ${forbidden}`);
  }
});
