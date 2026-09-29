import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const codebaseRoot = resolve(here, "..");
const repositoryRoot = resolve(codebaseRoot, "..");
const legacyRoot = resolve(repositoryRoot, "functions");
const legacyFunctionsBin = resolve(legacyRoot, "node_modules/firebase-functions/lib/bin/firebase-functions.js");

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  if (!address || typeof address === "string") throw new Error("DISCOVERY_PORT_UNAVAILABLE");
  return address.port;
}

async function manifestFor(cwd: string, bin: string): Promise<Record<string, unknown>> {
  const port = await freePort();
  const child = spawn(process.execPath, [bin], {
    cwd,
    env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(port) },
    stdio: "pipe",
  });
  after(() => child.kill());

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

test("el cutover deja autenticarOperativo exclusivamente en saas-operational-auth", async () => {
  const legacy = await manifestFor(legacyRoot, legacyFunctionsBin);
  const endpoints = legacy.endpoints as Record<string, unknown>;
  assert.equal(Object.hasOwn(endpoints, "autenticarOperativo"), false);
});
