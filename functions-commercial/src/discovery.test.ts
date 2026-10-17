import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as packageExports from "./index";
import {
  consultarOfertaComercialTenantSaas,
  ejecutarComandoComercialSaas,
} from "../../functions/src/platform/commercial-callable";

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(here, "..");
const firebaseFunctionsBin = resolve(sourceRoot, "node_modules/firebase-functions/lib/bin/firebase-functions.js");

const canonicalHandlers = {
  ejecutarComandoComercialSaas,
  consultarOfertaComercialTenantSaas,
} as const;

// Frozen read-only Cloud Run observation from staging, 2026-10-17.
// This contract test does not contact or invoke the remote services.
const observedFunctionTargets = {
  ejecutarComandoComercialSaas: "ejecutarComandoComercialSaas",
  consultarOfertaComercialTenantSaas: "consultarOfertaComercialTenantSaas",
} as const;

function assertFunctionTargetMatchesHandler(
  functionId: keyof typeof canonicalHandlers,
  functionTarget: string,
): void {
  if (functionTarget !== functionId) {
    throw new Error(`FUNCTION_TARGET_MISMATCH:${functionId}:${functionTarget}`);
  }

  const selectedHandler = packageExports[functionTarget as keyof typeof packageExports];
  assert.ok(selectedHandler, `FUNCTION_TARGET_EXPORT_MISSING:${functionTarget}`);
  assert.equal(selectedHandler, canonicalHandlers[functionId]);
}

test("staging FUNCTION_TARGET selecciona el export canónico de cada callable", () => {
  for (const [functionId, functionTarget] of Object.entries(observedFunctionTargets)) {
    assertFunctionTargetMatchesHandler(
      functionId as keyof typeof canonicalHandlers,
      functionTarget,
    );
  }
  assert.notEqual(
    packageExports.ejecutarComandoComercialSaas,
    packageExports.consultarOfertaComercialTenantSaas,
  );
});

test("rechaza una configuración cruzada entre FUNCTION_TARGET y callable", () => {
  assert.throws(
    () => assertFunctionTargetMatchesHandler(
      "ejecutarComandoComercialSaas",
      "consultarOfertaComercialTenantSaas",
    ),
    /FUNCTION_TARGET_MISMATCH:ejecutarComandoComercialSaas:consultarOfertaComercialTenantSaas/,
  );
});

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

test("el manifiesto comercial declara callables canónicos sin Secrets", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [firebaseFunctionsBin], {
    cwd: sourceRoot,
    env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(port) },
    stdio: "pipe",
  });
  after(() => child.kill());
  const manifest = await waitForManifest(port);
  const endpoints = manifest.endpoints as Record<string, unknown>;
  assert.deepEqual(Object.keys(endpoints).sort(), ["consultarOfertaComercialTenantSaas", "ejecutarComandoComercialSaas"].sort());
  assert.deepEqual(
    (endpoints.consultarOfertaComercialTenantSaas as { region?: unknown }).region,
    ["us-central1"],
  );
  assert.deepEqual(
    (endpoints.consultarOfertaComercialTenantSaas as { callableTrigger?: unknown }).callableTrigger,
    {},
  );
  assert.equal(
    (endpoints.consultarOfertaComercialTenantSaas as { entryPoint?: unknown }).entryPoint,
    "consultarOfertaComercialTenantSaas",
  );
  assert.deepEqual(
    (endpoints.ejecutarComandoComercialSaas as { region?: unknown }).region,
    ["us-central1"],
  );
  assert.deepEqual(
    (endpoints.ejecutarComandoComercialSaas as { callableTrigger?: unknown }).callableTrigger,
    {},
  );
  assert.equal(
    (endpoints.ejecutarComandoComercialSaas as { entryPoint?: unknown }).entryPoint,
    "ejecutarComandoComercialSaas",
  );
  assert.deepEqual(manifest.params ?? [], []);
  const serialized = JSON.stringify(manifest);
  for (const secret of [
    "OPERATIONAL_PIN_PEPPER",
    "EMAIL_INVITATION_TOKEN_PEPPER",
    "WOMPI_EVENTS_SECRET",
    "DUSEMA_",
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(serialized.includes("secretEnvironmentVariables"), false);
});
