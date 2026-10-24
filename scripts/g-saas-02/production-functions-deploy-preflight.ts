import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateProductionFunctionsDeployPreflight,
  PRODUCTION_PROJECT_ALIAS,
  PRODUCTION_PROJECT_ID,
} from "./production-functions-deploy-preflight-core.js";

type FirebaseConfig = { functions?: Array<{ codebase?: string }> };
type FirebaseAliases = { projects?: Record<string, string> };

const repositoryRoot = resolve(import.meta.dirname, "../..");

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(repositoryRoot, relativePath), "utf8")) as T;
}

function listProductionFunctions(): unknown {
  // Project and field projection are constants. The request reads only names,
  // labels and lifecycle metadata; it never requests runtime environment values.
  const command = "gcloud functions list --project=micafe-pos --format=\"json(name,labels,state,environment)\"";
  const result = spawnSync(command, { cwd: repositoryRoot, encoding: "utf8", shell: true, windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error("GCloud metadata-only inventory failed.");
  }
  return JSON.parse(result.stdout);
}

function main(): void {
  const aliases = readJson<FirebaseAliases>(".firebaserc");
  if (aliases.projects?.[PRODUCTION_PROJECT_ALIAS] !== PRODUCTION_PROJECT_ID) {
    process.stderr.write(
      `BLOCKED: Firebase alias ${PRODUCTION_PROJECT_ALIAS} must resolve to ${PRODUCTION_PROJECT_ID}. No deployment started.\n`,
    );
    process.exitCode = 1;
    return;
  }

  const firebaseConfig = readJson<FirebaseConfig>("firebase.json");
  const configuredCodebases = (firebaseConfig.functions ?? [])
    .map(({ codebase }) => codebase)
    .filter((codebase): codebase is string => typeof codebase === "string");

  let deployedFunctions: ReturnType<typeof listProductionFunctions>;
  try {
    deployedFunctions = listProductionFunctions();
  } catch {
    process.stderr.write(
      "BLOCKED: no se pudo verificar el inventario remoto de Functions. No se inició ningún despliegue.\n",
    );
    process.exitCode = 1;
    return;
  }

  const result = evaluateProductionFunctionsDeployPreflight({
    projectId: PRODUCTION_PROJECT_ID,
    configuredCodebases,
    deployedFunctions: Array.isArray(deployedFunctions) ? deployedFunctions : [],
  });

  if (!result.ok) {
    process.stderr.write(
      "BLOCKED: no despliegues saas-auth; primero completa y verifica la migración de codebase de estas Functions:\n",
    );
    for (const blocker of result.blockers) process.stderr.write(`- ${blocker}\n`);
    process.stderr.write("Este preflight no autoriza por sí mismo ningún despliegue.\n");
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `PASS: las ${result.checkedFunctions} Functions migradas están activas en sus codebases destino. `
    + "Continúa únicamente si el despliegue tiene autorización operativa específica.\n",
  );
}

main();
