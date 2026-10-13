import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repository = resolve(root, "..");
const bin = resolve(root, "node_modules/firebase-functions/lib/bin/firebase-functions.js");

test("el codebase Functions aislado se compila por separado de la aplicación web", () => {
  const appTsconfig = JSON.parse(readFileSync(resolve(repository, "tsconfig.json"), "utf8"));
  const functionsTsconfig = JSON.parse(readFileSync(resolve(root, "tsconfig.json"), "utf8"));

  assert.ok(
    appTsconfig.exclude?.includes("functions-tenant-profile/**"),
    "el typecheck web no debe compilar el codebase Functions aislado",
  );
  assert.ok(
    functionsTsconfig.include?.includes("src/**/*.ts"),
    "el codebase aislado debe conservar su typecheck propio",
  );
});

async function port() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  if (!address || typeof address === "string") throw new Error("PORT");
  return address.port;
}

test("saas-tenant-profile descubre exactamente una callable Gen2 sin Secrets", async () => {
  const selectedPort = await port();
  const child = spawn(process.execPath, [bin], {
    cwd: root,
    env: { ...process.env, FUNCTIONS_CONTROL_API: "true", PORT: String(selectedPort) },
  });
  after(() => child.kill());
  let result: any;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${selectedPort}/__/functions.yaml`);
      if (response.ok) { result = JSON.parse(await response.text()); break; }
    } catch { /* espera el inicio del emulador de discovery */ }
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(result);
  assert.deepEqual(Object.keys(result.endpoints), ["registrarPerfilComercialBodegaV1"]);
  assert.deepEqual(result.endpoints.registrarPerfilComercialBodegaV1.region, ["us-central1"]);
  assert.deepEqual(result.params ?? [], []);
  assert.equal(JSON.stringify(result).toLowerCase().includes("secret"), false);
});
