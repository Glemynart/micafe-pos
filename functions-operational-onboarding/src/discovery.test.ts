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

async function manifest(port: number) {
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

test("saas-operational-onboarding descubre exactamente una callable y un Secret", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [bin], {
    cwd: sourceRoot,
    env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(port) },
    stdio: "pipe",
  });
  after(() => child.kill());
  const result = await manifest(port);
  const endpoints = result.endpoints as Record<string, { region?: unknown; secretEnvironmentVariables?: unknown }>;
  assert.deepEqual(Object.keys(endpoints), ["crearIncorporacionDirecta"]);
  assert.deepEqual(endpoints.crearIncorporacionDirecta.region, ["us-central1"]);
  assert.match(JSON.stringify(endpoints.crearIncorporacionDirecta), /OPERATIONAL_PIN_PEPPER/);
});
