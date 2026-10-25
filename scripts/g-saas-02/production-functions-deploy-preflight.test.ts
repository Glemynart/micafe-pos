import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  evaluateProductionFunctionsDeployPreflight,
  MOVED_FUNCTIONS,
  PRODUCTION_PROJECT_ID,
  type DeployedFunctionMetadata,
} from "./production-functions-deploy-preflight-core.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
const firebaseConfig = JSON.parse(readFileSync(resolve(repositoryRoot, "firebase.json"), "utf8")) as {
  functions: Array<{ source: string; codebase: string; predeploy?: string[] }>;
};
const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")) as {
  scripts: Record<string, string | undefined>;
};
const configuredCodebases = firebaseConfig.functions.map(({ codebase }) => codebase);

test("compila functions-bodega antes de cualquier despliegue de su codebase", () => {
  const bodega = firebaseConfig.functions.find(({ codebase }) => codebase === "saas-bodega");

  assert.deepEqual(bodega?.predeploy, ["npm --prefix functions-bodega run build"]);
});

test("el build limpio de Bodega elimina salida obsoleta y permite crear el paquete de Functions", async () => {
  const sourceDir = resolve(repositoryRoot, "functions-bodega");
  const bodegaPackage = JSON.parse(readFileSync(resolve(sourceDir, "package.json"), "utf8")) as { main: string };
  const outputDir = resolve(sourceDir, "lib");
  const staleArtifact = resolve(outputDir, `__codex_stale_${process.pid}.js`);
  const entrypoint = resolve(sourceDir, bodegaPackage.main);
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, "npm debe exponer su CLI para ejecutar el mismo build configurado en predeploy");
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(staleArtifact, "stale output must not be packaged");

  let packagePath: string | undefined;
  try {
    execFileSync(process.execPath, [npmCli, "--prefix", "functions-bodega", "run", "build"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: "pipe",
    });

    assert.equal(existsSync(staleArtifact), false, "el build debe retirar JS obsoleto de lib");
    assert.equal(existsSync(entrypoint), true, "el entrypoint declarado debe existir tras compilar");
    const compiledExports = require(entrypoint) as Record<string, unknown>;
    assert.equal(
      typeof compiledExports.crearArticuloInventarioBodegaV1,
      "function",
      "el artefacto compilado debe exponer la callable usada por producción",
    );

    const { prepareFunctionsUpload } = require(resolve(
      repositoryRoot,
      "node_modules/firebase-tools/lib/deploy/functions/prepareFunctionsUpload.js",
    )) as {
      prepareFunctionsUpload: (
        projectDir: string,
        sourceDir: string,
        config: { ignore: string[] },
        additionalSources: string[],
        runtimeConfig: undefined,
        options: { exportType: "zip" },
      ) => Promise<{ pathToSource: string }>;
    };
    const packaged = await prepareFunctionsUpload(
      repositoryRoot,
      sourceDir,
      { ignore: ["node_modules", ".git"] },
      [],
      undefined,
      { exportType: "zip" },
    );
    packagePath = packaged.pathToSource;
    assert.ok(statSync(packagePath).size > 0, "Firebase CLI debe producir un paquete local no vacío");
  } finally {
    rmSync(staleArtifact, { force: true });
    if (packagePath) rmSync(packagePath, { force: true });
  }
});

function deployedFunction(
  name: string,
  codebase: string,
  overrides: Partial<DeployedFunctionMetadata> = {},
): DeployedFunctionMetadata {
  return {
    name: `projects/${PRODUCTION_PROJECT_ID}/locations/us-central1/functions/${name}`,
    labels: { "firebase-functions-codebase": codebase },
    state: "ACTIVE",
    environment: "GEN_2",
    ...overrides,
  };
}

function completeInventory(): DeployedFunctionMetadata[] {
  return MOVED_FUNCTIONS.map(({ name, codebase }) => deployedFunction(name, codebase));
}

test("el comando de Functions de producción ejecuta el preflight antes de Firebase CLI", () => {
  const deployCommand = packageJson.scripts["deploy:functions:production"] ?? "";
  const preflightPosition = deployCommand.indexOf("tsx scripts/g-saas-02/production-functions-deploy-preflight.ts");
  const deployPosition = deployCommand.indexOf("firebase deploy --project production --only functions:saas-auth");

  assert.ok(preflightPosition >= 0, "falta el preflight obligatorio en deploy:functions:production");
  assert.ok(deployPosition > preflightPosition, "Firebase CLI debe ejecutarse después del preflight");
  assert.ok(deployCommand.slice(preflightPosition, deployPosition).includes("&&"), "el despliegue debe detenerse si falla el preflight");
});

test("permite saas-auth solo cuando las 16 Functions están en sus codebases destino", () => {
  const result = evaluateProductionFunctionsDeployPreflight({
    projectId: PRODUCTION_PROJECT_ID,
    configuredCodebases,
    deployedFunctions: completeInventory(),
  });

  assert.equal(MOVED_FUNCTIONS.length, 16);
  assert.equal(result.ok, true);
  assert.equal(result.checkedFunctions, 16);
  assert.deepEqual(result.blockers, []);
});

test("bloquea saas-auth si una Function migrada aún conserva la etiqueta antigua", () => {
  const deployedFunctions = completeInventory();
  const staleName = MOVED_FUNCTIONS[0]!.name;
  deployedFunctions[0] = deployedFunction(staleName, "saas-auth");

  const result = evaluateProductionFunctionsDeployPreflight({
    projectId: PRODUCTION_PROJECT_ID,
    configuredCodebases,
    deployedFunctions,
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes(`CODEBASE_MIGRATION_INCOMPLETE: ${staleName}`)));
});

test("bloquea si falta, se duplica o no está activa una Function migrada", () => {
  const name = MOVED_FUNCTIONS[0]!.name;
  const inventoryMissing = completeInventory().filter((fn) => !fn.name.endsWith(`/functions/${name}`));
  const resultMissing = evaluateProductionFunctionsDeployPreflight({
    projectId: PRODUCTION_PROJECT_ID,
    configuredCodebases,
    deployedFunctions: inventoryMissing,
  });
  assert.ok(resultMissing.blockers.some((blocker) => blocker.includes(`FUNCTION_MISSING: ${name}`)));

  const inventoryDuplicated = completeInventory();
  inventoryDuplicated.push(deployedFunction(name, MOVED_FUNCTIONS[0]!.codebase, {
    name: `projects/${PRODUCTION_PROJECT_ID}/locations/europe-west1/functions/${name}`,
  }));
  const resultDuplicated = evaluateProductionFunctionsDeployPreflight({
    projectId: PRODUCTION_PROJECT_ID,
    configuredCodebases,
    deployedFunctions: inventoryDuplicated,
  });
  assert.ok(resultDuplicated.blockers.some((blocker) => blocker.includes(`FUNCTION_DUPLICATED: ${name}`)));

  const inventoryInactive = completeInventory();
  inventoryInactive[0] = deployedFunction(name, MOVED_FUNCTIONS[0]!.codebase, { state: "DEPLOYING" });
  const resultInactive = evaluateProductionFunctionsDeployPreflight({
    projectId: PRODUCTION_PROJECT_ID,
    configuredCodebases,
    deployedFunctions: inventoryInactive,
  });
  assert.ok(resultInactive.blockers.some((blocker) => blocker.includes(`FUNCTION_NOT_ACTIVE: ${name}`)));
});

test("bloquea si falta el codebase destino, el proyecto o el runtime Gen2 esperado", () => {
  const missingTarget = configuredCodebases.filter((codebase) => codebase !== MOVED_FUNCTIONS[0]!.codebase);
  const resultMissingTarget = evaluateProductionFunctionsDeployPreflight({
    projectId: PRODUCTION_PROJECT_ID,
    configuredCodebases: missingTarget,
    deployedFunctions: completeInventory(),
  });
  assert.ok(resultMissingTarget.blockers.some((blocker) => blocker.includes(`TARGET_CODEBASE_MISSING: ${MOVED_FUNCTIONS[0]!.codebase}`)));

  const resultWrongProject = evaluateProductionFunctionsDeployPreflight({
    projectId: "micafe-pos-staging",
    configuredCodebases,
    deployedFunctions: completeInventory(),
  });
  assert.ok(resultWrongProject.blockers.some((blocker) => blocker.includes("PROJECT_MISMATCH")));

  const wrongGeneration = completeInventory();
  wrongGeneration[0] = deployedFunction(MOVED_FUNCTIONS[0]!.name, MOVED_FUNCTIONS[0]!.codebase, {
    environment: "GEN_1",
  });
  const resultWrongGeneration = evaluateProductionFunctionsDeployPreflight({
    projectId: PRODUCTION_PROJECT_ID,
    configuredCodebases,
    deployedFunctions: wrongGeneration,
  });
  assert.ok(resultWrongGeneration.blockers.some((blocker) => blocker.includes("FUNCTION_GENERATION_MISMATCH")));
});
