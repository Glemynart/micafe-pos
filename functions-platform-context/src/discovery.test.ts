import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(here, "..");
const workspaceRoot = resolve(sourceRoot, "..");
const platformRoot = resolve(workspaceRoot, "functions", "src", "platform");

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

async function discover(root: string): Promise<Record<string, unknown>> {
  const port = await freePort();
  const firebaseFunctionsBin = resolve(root, "node_modules/firebase-functions/lib/bin/firebase-functions.js");
  const child = spawn(process.execPath, [firebaseFunctionsBin], {
    cwd: root,
    env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(port) },
    stdio: "pipe",
  });
  after(() => child.kill());
  return waitForManifest(port);
}

test("el build aislado contiene solo el cierre canónico permitido", () => {
  const tsc = resolve(sourceRoot, "node_modules/typescript/bin/tsc");
  const result = spawn(process.execPath, [tsc, "-p", "tsconfig.json", "--listFiles"], {
    cwd: sourceRoot,
  });
  let output = "";
  result.stdout.on("data", (chunk) => { output += chunk; });
  result.stderr.on("data", (chunk) => { output += chunk; });
  return once(result, "close").then(([status]) => {
    assert.equal(status, 0, output);
    const sourceFiles = output.split(/\r?\n/)
      .map((line) => line.trim().replaceAll("/", sep))
      .filter((line) => line.startsWith(`${platformRoot}${sep}`));
    assert.deepEqual(sourceFiles, [
      resolve(platformRoot, "contracts.ts"),
      resolve(platformRoot, "audit.ts"),
      resolve(platformRoot, "authorization.ts"),
      resolve(platformRoot, "context-callable.ts"),
    ]);
    for (const module of ["contracts", "audit", "authorization", "context-callable"]) {
      assert.equal(existsSync(resolve(sourceRoot, "lib", "functions", "src", "platform", `${module}.js`)), true);
    }
  });
});

test("el manifiesto aislado declara solo consultarContextoPlataforma, sin params ni secretos", async () => {
  const manifest = await discover(sourceRoot);
  const endpoints = manifest.endpoints as Record<string, unknown>;
  assert.deepEqual(Object.keys(endpoints), ["consultarContextoPlataforma"]);
  assert.deepEqual(manifest.params ?? [], []);
  const serialized = JSON.stringify(manifest);
  assert.equal(serialized.includes("secretEnvironmentVariables"), false);
  assert.equal(serialized.includes("defineSecret"), false);
  assert.equal(serialized.includes("DUSEMA"), false);
  assert.equal(serialized.includes("WOMPI"), false);
  assert.equal(serialized.includes("EMAIL_INVITATION_TOKEN_PEPPER"), false);
});

test("saas-auth ya no declara consultarContextoPlataforma", async () => {
  const manifest = await discover(resolve(workspaceRoot, "functions"));
  const endpoints = manifest.endpoints as Record<string, unknown>;
  assert.equal(Object.hasOwn(endpoints, "consultarContextoPlataforma"), false);
});
