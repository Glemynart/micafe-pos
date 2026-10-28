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
  const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); server.close();
  if (!address || typeof address === "string") throw new Error("DISCOVERY_PORT_UNAVAILABLE");
  return address.port;
}

async function manifest(port: number): Promise<Record<string, unknown>> {
  let error: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { const response = await fetch(`http://127.0.0.1:${port}/__/functions.yaml`); if (response.ok) return JSON.parse(await response.text()) as Record<string, unknown>; error = new Error(`DISCOVERY_HTTP_${response.status}`); } catch (cause) { error = cause; }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw error;
}

async function discoverCodebase(codebaseRoot: string): Promise<Record<string, unknown>> {
  const port = await freePort();
  const cli = resolve(codebaseRoot, "node_modules/firebase-functions/lib/bin/firebase-functions.js");
  const child = spawn(process.execPath, [cli], {
    cwd: codebaseRoot,
    env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(port) },
    stdio: "pipe",
  });
  try {
    return await manifest(port);
  } finally {
    child.kill();
  }
}

test("saas-bodega-operations descubre exactamente ocho callables Gen2 sin Secrets", async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [bin], { cwd: sourceRoot, env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(port) }, stdio: "pipe" });
  after(() => child.kill());
  const result = await manifest(port);
  const endpoints = result.endpoints as Record<string, { region?: unknown; callableTrigger?: unknown }>;
  assert.deepEqual(Object.keys(endpoints).sort(), [
    "abrirTurnoBodegaV1",
    "actualizarArticuloInventarioBodegaV1",
    "cerrarTurnoBodegaV1",
    "consultarCatalogoNeveraVendedorBodegaV1",
    "consultarCatalogoPresentacionesVendedorBodegaV1",
    "consultarClientesVendedorBodegaV1",
    "consultarMisVentasVendedorBodegaV1",
    "registrarCompraBodegaV1",
  ]);
  for (const endpoint of Object.values(endpoints)) { assert.deepEqual(endpoint.region, ["us-central1"]); assert.deepEqual(endpoint.callableTrigger, {}); }
  assert.deepEqual(result.params ?? [], []);
  const serialized = JSON.stringify(result).toLowerCase();
  for (const forbidden of ["operational_pin_pepper", "wompi", "dusema", "email_invitation", "secret"]) assert.equal(serialized.includes(forbidden), false);
});

test("los IDs de saas-auth, saas-bodega y saas-bodega-operations son únicos por región", async () => {
  const codebases = [
    { name: "saas-auth", root: resolve(sourceRoot, "../functions") },
    { name: "saas-bodega", root: resolve(sourceRoot, "../functions-bodega") },
    { name: "saas-bodega-operations", root: sourceRoot },
  ];
  const manifests = await Promise.all(codebases.map(async codebase => ({
    ...codebase,
    manifest: await discoverCodebase(codebase.root),
  })));
  const owners = new Map<string, string>();
  const collisions: string[] = [];

  for (const { name: codebase, manifest } of manifests) {
    const endpoints = manifest.endpoints as Record<string, { region?: unknown }>;
    for (const [endpoint, config] of Object.entries(endpoints)) {
      const regions = Array.isArray(config.region) ? config.region : ["us-central1"];
      for (const region of regions) {
        const key = `${String(region).toLowerCase()}:${endpoint.toLowerCase()}`;
        const previous = owners.get(key);
        if (previous) collisions.push(`${key}: ${previous}, ${codebase}`);
        else owners.set(key, codebase);
      }
    }
  }

  const authEndpoints = manifests[0].manifest.endpoints as Record<string, unknown>;
  for (const legacyId of [
    "crearClienteVendedorV1",
    "crearPresentacionComercialV1",
    "actualizarPresentacionComercialV1",
    "crearArticuloInventarioV1",
    "confirmarVentaBodegaV1",
    "consultarCatalogoPresentacionesVendedorV1",
    "consultarClientesVendedorV1",
    "consultarMisVentasVendedorV1",
    "abrirTurnoOperativoV1",
    "actualizarArticuloInventarioV1",
    "cerrarTurnoOperativoV1",
  ]) assert.ok(legacyId in authEndpoints, `saas-auth debe preservar ${legacyId}`);
  assert.deepEqual(collisions, []);
});
