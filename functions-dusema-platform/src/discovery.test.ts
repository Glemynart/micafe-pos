import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(here, "..");
const workspaceRoot = resolve(sourceRoot, "..");
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
  const childEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("DUSEMA_")),
  );
  Object.assign(childEnvironment, { FUNCTIONS_CONTROL_API: "true", PORT: String(port) });
  const child = spawn(process.execPath, [firebaseFunctionsBin], {
    cwd: sourceRoot,
    env: childEnvironment as NodeJS.ProcessEnv,
    stdio: "pipe",
  });
  after(() => { child.kill(); });
  const manifest = await waitForManifest(port);
  const endpoints = manifest.endpoints as Record<string, { region?: string; secretEnvironmentVariables?: Array<{ key: string }> }>;
  assert.deepEqual(Object.keys(endpoints), ["consultarTenantDusemaSaas"]);
  assert.deepEqual(endpoints.consultarTenantDusemaSaas?.region, ["us-central1"]);
  assert.deepEqual(endpoints.consultarTenantDusemaSaas?.secretEnvironmentVariables?.map(({ key }) => key), [
    "DUSEMA_ADMIN_BASE_URL",
    "DUSEMA_S2S_ISSUER",
    "DUSEMA_S2S_AUDIENCE",
    "DUSEMA_S2S_KID",
    "DUSEMA_S2S_ENVIRONMENT",
    "DUSEMA_S2S_PRIVATE_KEY",
  ]);
  const serialized = JSON.stringify(manifest);
  const discoveredDusemaParameters = [...new Set(serialized.match(/DUSEMA_[A-Z0-9_]+/g) ?? [])].sort();
  assert.deepEqual(discoveredDusemaParameters, [
    "DUSEMA_ADMIN_BASE_URL",
    "DUSEMA_S2S_AUDIENCE",
    "DUSEMA_S2S_ENVIRONMENT",
    "DUSEMA_S2S_ISSUER",
    "DUSEMA_S2S_KID",
    "DUSEMA_S2S_PRIVATE_KEY",
  ]);
  assert.equal(serialized.includes("OPERATIONAL_PIN_PEPPER"), false);
  assert.equal(serialized.includes("EMAIL_INVITATION_TOKEN_PEPPER"), false);
  assert.equal(serialized.includes("WOMPI_EVENTS_SECRET"), false);
});

test("el cierre de imports reutiliza autoridades canonicas y excluye agregadores ajenos", () => {
  const tsc = resolve(sourceRoot, "node_modules/typescript/bin/tsc");
  const result = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json", "--listFiles"], {
    cwd: sourceRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);

  const functionsRoot = resolve(workspaceRoot, "functions", "src");
  const platformRoot = resolve(functionsRoot, "platform");
  const sourceFiles = result.stdout.split(/\r?\n/)
    .map((line) => line.trim().replaceAll("/", sep))
    .filter((line) => line.startsWith(`${functionsRoot}${sep}`));
  const required = [
    resolve(platformRoot, "dusema-query-callable.ts"),
    resolve(platformRoot, "authorization.ts"),
    resolve(platformRoot, "bindings.ts"),
    resolve(platformRoot, "validation.ts"),
    resolve(platformRoot, "audit.ts"),
    resolve(platformRoot, "contracts.ts"),
    resolve(platformRoot, "dusema-s2s-client.ts"),
  ];
  for (const file of required) assert.equal(sourceFiles.includes(file), true, file);

  const forbidden = [
    resolve(functionsRoot, "index.ts"),
    resolve(platformRoot, "callables.ts"),
    resolve(platformRoot, "dusema-binding-callable.ts"),
    resolve(platformRoot, "dusema-binding-command.ts"),
    resolve(platformRoot, "operators.ts"),
    resolve(platformRoot, "support.ts"),
    resolve(functionsRoot, "finanzas", "compras.ts"),
  ];
  for (const file of forbidden) assert.equal(sourceFiles.includes(file), false, file);
});
