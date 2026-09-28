import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
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

test("el manifiesto declara solo obtenerConfiguracionEmpresa y cero Secrets", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [firebaseFunctionsBin], {
    cwd: sourceRoot,
    env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(port) },
    stdio: "pipe",
  });
  after(() => child.kill());
  const manifest = await waitForManifest(port);
  const endpoints = manifest.endpoints as Record<string, unknown>;
  assert.deepEqual(Object.keys(endpoints), ["obtenerConfiguracionEmpresa"]);
  assert.deepEqual((endpoints.obtenerConfiguracionEmpresa as { region?: unknown }).region, ["us-central1"]);
  assert.deepEqual((endpoints.obtenerConfiguracionEmpresa as { callableTrigger?: unknown }).callableTrigger, {});
  assert.deepEqual(manifest.params ?? [], []);
  const serialized = JSON.stringify(manifest).toLowerCase();
  for (const forbidden of ["operational_pin_pepper", "wompi_events_secret", "dusema_", "email_invitation_token_pepper", "secretenvironmentvariables"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("el cutover local deja la callable fuera de saas-auth", async () => {
  const legacyIndex = await readFile(resolve(sourceRoot, "../functions/src/index.ts"), "utf8");
  assert.equal(legacyIndex.includes("obtenerConfiguracionEmpresa"), false);
});

test("la frontera no importa superficies prohibidas", async () => {
  const sources = await Promise.all([
    readFile(resolve(sourceRoot, "src/index.ts"), "utf8"),
    readFile(resolve(sourceRoot, "../functions/src/tenant-configuration/shared.ts"), "utf8"),
    readFile(resolve(sourceRoot, "../functions/src/tenant-configuration/authority.ts"), "utf8"),
    readFile(resolve(sourceRoot, "../functions/src/configuracion/reader.ts"), "utf8"),
  ]);
  const closure = sources.join("\n").toLowerCase();
  for (const forbidden of ["operational-auth", "configuracion/service", "define" + "secret", "wompi", "dusema", "bootstrap/", "commercial", "email-"]) {
    assert.equal(closure.includes(forbidden), false);
  }
});
