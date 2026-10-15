import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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

test("saas-auth conserva compras pero no descubre la consulta ni parametros Dusema", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [firebaseFunctionsBin], {
    cwd: sourceRoot,
    env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(port) },
    stdio: "pipe",
  });
  after(() => child.kill());
  const manifest = await waitForManifest(port);
  const endpoints = manifest.endpoints as Record<string, unknown>;
  assert.equal(Object.hasOwn(endpoints, "consultarTenantDusemaSaas"), false);
  assert.equal(Object.hasOwn(endpoints, "registrarCompraOperativaV1"), true);
  assert.equal(Object.hasOwn(endpoints, "transicionarPausaComprasSaas"), true);
  for (const secret of [
    "DUSEMA_ADMIN_BASE_URL",
    "DUSEMA_S2S_ISSUER",
    "DUSEMA_S2S_AUDIENCE",
    "DUSEMA_S2S_KID",
    "DUSEMA_S2S_ENVIRONMENT",
    "DUSEMA_S2S_PRIVATE_KEY",
  ]) assert.equal(JSON.stringify(manifest).includes(secret), false, `${secret} leaked into saas-auth discovery`);
});
