import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const sourceRoot = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(sourceRoot, "..");

test("el preflight local identifica un unico recurso y un target de deploy dirigido", () => {
  const firebaseConfig = JSON.parse(
    readFileSync(resolve(workspaceRoot, "firebase.json"), "utf8"),
  ) as { functions: Array<{ source: string; codebase: string }> };
  const codebases = firebaseConfig.functions;
  const target = codebases.filter((entry) => entry.codebase === "saas-dusema-platform");
  assert.deepEqual(target, [{ source: "functions-dusema-platform", codebase: "saas-dusema-platform" }]);
  assert.equal(new Set(codebases.map(({ codebase }) => codebase)).size, codebases.length);
  assert.equal(new Set(codebases.map(({ source }) => source)).size, codebases.length);

  const packageJson = JSON.parse(
    readFileSync(resolve(sourceRoot, "package.json"), "utf8"),
  ) as { main: string };
  assert.equal(packageJson.main, "lib/functions-dusema-platform/src/index.js");
  assert.equal(existsSync(resolve(sourceRoot, packageJson.main)), true);
  assert.equal(
    "functions:saas-dusema-platform:consultarTenantDusemaSaas",
    `functions:${target[0]!.codebase}:consultarTenantDusemaSaas`,
  );
});
