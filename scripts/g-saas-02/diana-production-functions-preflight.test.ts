import assert from "node:assert/strict";
import test from "node:test";
import {
  DIANA_PRODUCTION_FUNCTIONS,
  collectNamedFunctionExports,
  evaluateDianaProductionFunctionsPreflight,
  type DeployedDianaFunction,
} from "./diana-production-functions-preflight.js";

const configuredCodebases = [
  { codebase: "saas-auth", source: "functions" },
  { codebase: "saas-commercial", source: "functions-commercial" },
  { codebase: "saas-bootstrap", source: "functions-bootstrap" },
];

const sourceExports: Record<string, string[]> = {
  "saas-commercial": ["ejecutarComandoComercialSaas", "consultarOfertaComercialTenantSaas"],
  "saas-bootstrap": ["solicitarBootstrapEmpresarialSaas"],
};

function deployedFunction(
  name: string,
  codebase: string,
  overrides: Partial<DeployedDianaFunction> = {},
): DeployedDianaFunction {
  return {
    name: `projects/micafe-pos/locations/us-central1/functions/${name}`,
    labels: { "firebase-functions-codebase": codebase },
    state: "ACTIVE",
    environment: "GEN_2",
    ...overrides,
  };
}

function currentProductionInventory(): DeployedDianaFunction[] {
  return [
    deployedFunction("ejecutarComandoComercialSaas", "saas-auth"),
    deployedFunction("solicitarBootstrapEmpresarialSaas", "saas-auth"),
  ];
}

function evaluate(overrides: {
  projectId?: string;
  codebases?: typeof configuredCodebases;
  exports?: Record<string, string[]>;
  deployed?: DeployedDianaFunction[];
} = {}) {
  return evaluateDianaProductionFunctionsPreflight({
    projectId: overrides.projectId ?? "micafe-pos",
    configuredCodebases: overrides.codebases ?? configuredCodebases,
    sourceExports: overrides.exports ?? sourceExports,
    deployedFunctions: overrides.deployed ?? currentProductionInventory(),
  });
}

test("permite el corte dirigido cuando las dos callables existentes siguen únicas y activas en saas-auth", () => {
  const result = evaluate();

  assert.equal(result.ok, true);
  assert.deepEqual(result.codebases, ["saas-commercial", "saas-bootstrap"]);
  assert.deepEqual(result.functions, [
    { name: "ejecutarComandoComercialSaas", codebase: "saas-commercial", disposition: "MIGRATE_FROM_LEGACY" },
    { name: "consultarOfertaComercialTenantSaas", codebase: "saas-commercial", disposition: "CREATE" },
    { name: "solicitarBootstrapEmpresarialSaas", codebase: "saas-bootstrap", disposition: "MIGRATE_FROM_LEGACY" },
  ]);
  assert.deepEqual(result.blockers, []);
});

test("permite una relectura idempotente cuando las callables ya están en sus codebases destino", () => {
  const result = evaluate({
    deployed: [
      deployedFunction("ejecutarComandoComercialSaas", "saas-commercial"),
      deployedFunction("consultarOfertaComercialTenantSaas", "saas-commercial"),
      deployedFunction("solicitarBootstrapEmpresarialSaas", "saas-bootstrap"),
    ],
  });

  assert.equal(result.ok, true);
  assert.ok(result.functions.every(({ disposition }) => disposition === "ALREADY_IN_TARGET"));
});

test("rechaza cualquier proyecto distinto de producción", () => {
  const result = evaluate({ projectId: "micafe-pos-staging" });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => blocker.startsWith("PROJECT_MISMATCH:")));
});

test("requiere los codebases y directorios fuente exactos del corte", () => {
  const missingCodebase = evaluate({
    codebases: configuredCodebases.filter(({ codebase }) => codebase !== "saas-bootstrap"),
  });
  const wrongSource = evaluate({
    codebases: configuredCodebases.map((entry) => entry.codebase === "saas-commercial"
      ? { ...entry, source: "functions" }
      : entry),
  });
  const missingExport = evaluate({
    exports: { ...sourceExports, "saas-bootstrap": [] },
  });

  assert.ok(missingCodebase.blockers.some((blocker) => blocker.includes("CODEBASE_MISSING:saas-bootstrap")));
  assert.ok(wrongSource.blockers.some((blocker) => blocker.includes("SOURCE_MISMATCH:saas-commercial")));
  assert.ok(missingExport.blockers.some((blocker) => blocker.includes("EXPORT_SET_MISMATCH:saas-bootstrap")));
});

test("bloquea exports adicionales que ampliarían el alcance del despliegue dirigido", () => {
  const result = evaluate({
    exports: {
      ...sourceExports,
      "saas-commercial": [...sourceExports["saas-commercial"]!, "otraCallableNoAprobada"],
    },
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("EXPORT_SET_MISMATCH:saas-commercial")));
});

test("bloquea funciones inexistentes que son prerequisito o con más de un despliegue", () => {
  const missingBootstrap = evaluate({
    deployed: currentProductionInventory().filter(({ name }) => !name.endsWith("/solicitarBootstrapEmpresarialSaas")),
  });
  const duplicateCommercial = evaluate({
    deployed: [
      ...currentProductionInventory(),
      deployedFunction("ejecutarComandoComercialSaas", "saas-auth", {
        name: "projects/micafe-pos/locations/europe-west1/functions/ejecutarComandoComercialSaas",
      }),
    ],
  });

  assert.ok(missingBootstrap.blockers.some((blocker) => blocker.includes("FUNCTION_MISSING:solicitarBootstrapEmpresarialSaas")));
  assert.ok(duplicateCommercial.blockers.some((blocker) => blocker.includes("FUNCTION_DUPLICATED:ejecutarComandoComercialSaas")));
});

test("bloquea una función existente con región, generación o estado incompatible", () => {
  const cases: Array<[string, DeployedDianaFunction, string]> = [
    ["region", deployedFunction("solicitarBootstrapEmpresarialSaas", "saas-auth", {
      name: "projects/micafe-pos/locations/europe-west1/functions/solicitarBootstrapEmpresarialSaas",
    }), "REGION_MISMATCH"],
    ["generation", deployedFunction("solicitarBootstrapEmpresarialSaas", "saas-auth", { environment: "GEN_1" }), "GENERATION_MISMATCH"],
    ["state", deployedFunction("solicitarBootstrapEmpresarialSaas", "saas-auth", { state: "DEPLOYING" }), "FUNCTION_NOT_ACTIVE"],
  ];

  for (const [caseName, replacement, expectedBlocker] of cases) {
    const deployed = currentProductionInventory().map((fn) => fn.name.endsWith("/solicitarBootstrapEmpresarialSaas")
      ? replacement
      : fn);
    const result = evaluate({ deployed });
    assert.ok(result.blockers.some((blocker) => blocker.includes(expectedBlocker)), caseName);
  }
});

test("bloquea codebases de destino con funciones remotas ajenas al allowlist", () => {
  const result = evaluate({
    deployed: [
      ...currentProductionInventory(),
      deployedFunction("unexpectedFunction", "saas-commercial"),
    ],
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((blocker) => blocker.includes("UNEXPECTED_TARGET_FUNCTION:unexpectedFunction")));
});

test("el allowlist versionado contiene exactamente las tres funciones requeridas para oferta y Bootstrap", () => {
  assert.deepEqual(DIANA_PRODUCTION_FUNCTIONS, [
    { name: "ejecutarComandoComercialSaas", codebase: "saas-commercial", source: "functions-commercial", mayBeNew: false },
    { name: "consultarOfertaComercialTenantSaas", codebase: "saas-commercial", source: "functions-commercial", mayBeNew: true },
    { name: "solicitarBootstrapEmpresarialSaas", codebase: "saas-bootstrap", source: "functions-bootstrap", mayBeNew: false },
  ]);
});

test("reconoce exports nombrados directos, reexports y aliases del entrypoint", () => {
  assert.deepEqual(collectNamedFunctionExports(`
    export { alpha, beta as betaPublica } from "./domain";
    export const gamma = () => undefined;
    export async function delta() {}
    export class epsilon {}
  `), ["alpha", "betaPublica", "delta", "epsilon", "gamma"]);
});

test("rechaza codebases configurados duplicados", () => {
  const result = evaluate({
    codebases: [...configuredCodebases, { codebase: "saas-commercial", source: "functions-commercial" }],
  });

  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes("CODEBASE_DUPLICATED:saas-commercial"));
});
