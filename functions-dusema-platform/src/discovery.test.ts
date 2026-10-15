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

test("el codebase Dusema descubre solo la callable y los seis parametros consumidos", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [firebaseFunctionsBin], {
    cwd: sourceRoot,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("DUSEMA_"))),
      FUNCTIONS_CONTROL_API: "true",
      PORT: String(port),
    },
    stdio: "pipe",
  });
  after(() => child.kill());
  const manifest = await waitForManifest(port);
  const endpoints = manifest.endpoints as Record<string, { region?: string; secretEnvironmentVariables?: Array<{ key: string }> }>;
  assert.deepEqual(Object.keys(endpoints), ["consultarTenantDusemaSaas"]);
  assert.equal(endpoints.consultarTenantDusemaSaas?.region, "us-central1");
  assert.deepEqual(endpoints.consultarTenantDusemaSaas?.secretEnvironmentVariables?.map(({ key }) => key), [
    "DUSEMA_ADMIN_BASE_URL",
    "DUSEMA_S2S_ISSUER",
    "DUSEMA_S2S_AUDIENCE",
    "DUSEMA_S2S_KID",
    "DUSEMA_S2S_ENVIRONMENT",
    "DUSEMA_S2S_PRIVATE_KEY",
  ]);
  const serialized = JSON.stringify(manifest);
  assert.equal(serialized.includes("OPERATIONAL_PIN_PEPPER"), false);
  assert.equal(serialized.includes("EMAIL_INVITATION_TOKEN_PEPPER"), false);
  assert.equal(serialized.includes("WOMPI_EVENTS_SECRET"), false);
});
