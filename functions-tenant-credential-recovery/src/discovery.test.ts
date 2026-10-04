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

test("declara solo la recuperación de operador tenant con el Secret canónico", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [bin], {
    cwd: sourceRoot,
    env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(port) },
    stdio: "pipe",
  });
  after(() => child.kill());
  const result = await manifest(port);
  const endpoints = result.endpoints as Record<string, { region?: unknown }>;
  assert.deepEqual(Object.keys(endpoints), ["restablecerCredencialOperativa"]);
  assert.deepEqual(endpoints.restablecerCredencialOperativa?.region, ["us-central1"]);
  assert.match(JSON.stringify(endpoints.restablecerCredencialOperativa), /OPERATIONAL_PIN_PEPPER/);
  const entrypoint = await readFile(resolve(sourceRoot, "src/index.ts"), "utf8");
  assert.match(entrypoint, /https:\/\/cafeatrato\.vercel\.app/);
  assert.match(entrypoint, /https:\/\/cafeatrato-bg6o3l7mf-glemynarts-projects\.vercel\.app/);
});

test("retira únicamente la exportación legacy migrada", async () => {
  const legacy = await readFile(resolve(sourceRoot, "../functions/src/index.ts"), "utf8");
  assert.equal(legacy.includes("restablecerCredencialOperativa"), false);
});
