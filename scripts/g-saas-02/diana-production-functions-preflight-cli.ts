import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  collectNamedFunctionExports,
  DIANA_PRODUCTION_FUNCTIONS,
  DIANA_PRODUCTION_PROJECT_ID,
  evaluateDianaProductionFunctionsPreflight,
  type DeployedDianaFunction,
} from "./diana-production-functions-preflight.js";

type FirebaseConfig = {
  functions?: Array<{ codebase?: string; source?: string }>;
};
type FirebaseAliases = { projects?: Record<string, string> };
type GcloudFunction = DeployedDianaFunction;

const repositoryRoot = resolve(import.meta.dirname, "../..");
const TARGET_CODEBASES = [...new Map(DIANA_PRODUCTION_FUNCTIONS.map(({ codebase, source }) => [codebase, source])).entries()];

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(repositoryRoot, relativePath), "utf8")) as T;
}

function readSourceExports(source: string): string[] {
  const entrypoint = resolve(repositoryRoot, source, "src/index.ts");
  return collectNamedFunctionExports(readFileSync(entrypoint, "utf8"));
}

function listProductionFunctions(): GcloudFunction[] {
  // Exact project and metadata-only field projection. No env, secret or runtime config values are requested.
  const command = "gcloud functions list --project=micafe-pos --format=\"json(name,labels,state,environment)\"";
  const result = spawnSync(command, {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: true,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    throw new Error("No fue posible leer los metadatos de Functions de producción.");
  }

  const raw = JSON.parse(result.stdout) as GcloudFunction[];
  if (!Array.isArray(raw)) throw new Error("La respuesta de GCloud no es una lista de Functions.");
  return raw.map(({ name, labels, state, environment }) => ({
    name,
    labels: { "firebase-functions-codebase": labels?.["firebase-functions-codebase"] },
    state,
    environment,
  }));
}

function emitBlocked(reason: string): void {
  process.stdout.write(`${JSON.stringify({
    readOnly: true,
    deploymentStarted: false,
    releaseAuthorized: false,
    projectId: DIANA_PRODUCTION_PROJECT_ID,
    status: "BLOCKED",
    reason,
  }, null, 2)}\n`);
  process.exitCode = 1;
}

function main(): void {
  let aliases: FirebaseAliases;
  let firebaseConfig: FirebaseConfig;
  let sourceExports: Record<string, string[]>;
  let deployedFunctions: GcloudFunction[];
  try {
    aliases = readJson<FirebaseAliases>(".firebaserc");
    if (aliases.projects?.production !== DIANA_PRODUCTION_PROJECT_ID) {
      emitBlocked("El alias production de .firebaserc no apunta al proyecto fijo esperado.");
      return;
    }

    firebaseConfig = readJson<FirebaseConfig>("firebase.json");
    sourceExports = Object.fromEntries(TARGET_CODEBASES.map(([codebase, source]) => [codebase, readSourceExports(source)]));
    deployedFunctions = listProductionFunctions();
  } catch (error) {
    const category = error instanceof SyntaxError ? "La configuración o respuesta JSON no es válida." : "No se pudieron leer los archivos locales o metadatos remotos requeridos.";
    emitBlocked(category);
    return;
  }

  const result = evaluateDianaProductionFunctionsPreflight({
    projectId: DIANA_PRODUCTION_PROJECT_ID,
    configuredCodebases: (firebaseConfig.functions ?? [])
      .map(({ codebase, source }) => ({ codebase: codebase ?? "", source: source ?? "" })),
    sourceExports,
    deployedFunctions,
  });

  process.stdout.write(`${JSON.stringify({
    readOnly: true,
    deploymentStarted: false,
    releaseAuthorized: false,
    projectId: DIANA_PRODUCTION_PROJECT_ID,
    checkedAt: new Date().toISOString(),
    status: result.ok ? "INVENTORY_CONSISTENT" : "BLOCKED",
    checkedFunctions: result.checkedFunctions,
    codebases: result.codebases,
    functions: result.functions,
    blockers: result.blockers,
    limits: [
      "No certifica Rules, App Hosting, datos, identidad de Diana, secretos, permisos IAM ni recuperación.",
      "No prueba que un cambio de codebase sea atómico o reversible.",
      "INVENTORY_CONSISTENT no constituye autorización de despliegue ni certificación de release.",
    ],
  }, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

main();
