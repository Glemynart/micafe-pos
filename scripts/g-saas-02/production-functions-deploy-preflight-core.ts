export const PRODUCTION_PROJECT_ID = "micafe-pos" as const;
export const PRODUCTION_PROJECT_ALIAS = "production" as const;
export const LEGACY_FUNCTIONS_CODEBASE = "saas-auth" as const;
export const EXPECTED_FUNCTION_REGION = "us-central1" as const;
export const EXPECTED_FUNCTION_ENVIRONMENT = "GEN_2" as const;

export const MOVED_FUNCTIONS = Object.freeze([
  { name: "activarIncorporacionDirecta", codebase: "saas-operational-activation" },
  { name: "activarRestablecimientoCredencial", codebase: "saas-platform-credential-recovery" },
  { name: "autenticarOperativo", codebase: "saas-operational-auth" },
  { name: "consultarAuditoriaPlataformaSaas", codebase: "saas-platform-resources" },
  { name: "consultarContextoPlataforma", codebase: "saas-platform-context" },
  { name: "crearIncorporacionDirecta", codebase: "saas-operational-onboarding" },
  { name: "ejecutarComandoComercialSaas", codebase: "saas-commercial" },
  { name: "listarRecursosPlataformaSaas", codebase: "saas-platform-resources" },
  { name: "obtenerConfiguracionEmpresa", codebase: "saas-tenant-configuration" },
  { name: "obtenerDetalleEmpresaPlataformaSaas", codebase: "saas-platform-tenant-access" },
  { name: "obtenerResumenOperadorSaas", codebase: "saas-operator-summary" },
  { name: "reemitirCredencialInicialTemporalSaas", codebase: "saas-platform-tenant-access" },
  { name: "reemitirRestablecimientoCredencialAdministradorTenantSaas", codebase: "saas-platform-credential-recovery" },
  { name: "restablecerCredencialAdministradorTenantSaas", codebase: "saas-platform-credential-recovery" },
  { name: "restablecerCredencialOperativa", codebase: "saas-tenant-credential-recovery" },
  { name: "solicitarBootstrapEmpresarialSaas", codebase: "saas-bootstrap" },
] as const);

export type DeployedFunctionMetadata = {
  name: string;
  labels?: Record<string, string | undefined> | null;
  state?: string;
  environment?: string;
};

type ParsedFunctionName = {
  projectId: string;
  region: string;
  functionName: string;
};

export type ProductionFunctionsPreflightResult = {
  ok: boolean;
  checkedFunctions: number;
  blockers: string[];
};

function parseFunctionName(value: string): ParsedFunctionName | null {
  const match = /^projects\/([^/]+)\/locations\/([^/]+)\/functions\/([^/]+)$/.exec(value);
  if (!match) return null;
  return { projectId: match[1]!, region: match[2]!, functionName: match[3]! };
}

export function evaluateProductionFunctionsDeployPreflight(input: {
  projectId: string;
  configuredCodebases: readonly string[];
  deployedFunctions: readonly DeployedFunctionMetadata[];
}): ProductionFunctionsPreflightResult {
  const blockers: string[] = [];

  if (input.projectId !== PRODUCTION_PROJECT_ID) {
    blockers.push(`PROJECT_MISMATCH: se esperaba ${PRODUCTION_PROJECT_ID}.`);
  }
  if (!input.configuredCodebases.includes(LEGACY_FUNCTIONS_CODEBASE)) {
    blockers.push(`LEGACY_CODEBASE_MISSING: ${LEGACY_FUNCTIONS_CODEBASE} no está en firebase.json.`);
  }

  const targetCodebases = [...new Set(MOVED_FUNCTIONS.map(({ codebase }) => codebase))];
  for (const codebase of targetCodebases) {
    if (!input.configuredCodebases.includes(codebase)) {
      blockers.push(`TARGET_CODEBASE_MISSING: ${codebase} no está en firebase.json.`);
    }
  }

  for (const migration of MOVED_FUNCTIONS) {
    const matching = input.deployedFunctions.filter((deployed) => {
      const parsed = parseFunctionName(deployed.name);
      return parsed?.functionName === migration.name;
    });

    if (matching.length === 0) {
      blockers.push(`FUNCTION_MISSING: ${migration.name} no aparece en el inventario de producción.`);
      continue;
    }
    if (matching.length > 1) {
      blockers.push(`FUNCTION_DUPLICATED: ${migration.name} aparece en más de una ubicación.`);
      continue;
    }

    const deployed = matching[0]!;
    const parsed = parseFunctionName(deployed.name);
    if (!parsed) {
      blockers.push(`FUNCTION_NAME_INVALID: no se pudo interpretar el nombre de ${migration.name}.`);
      continue;
    }
    if (parsed.projectId !== input.projectId) {
      blockers.push(`FUNCTION_PROJECT_MISMATCH: ${migration.name} está en ${parsed.projectId}.`);
    }
    if (parsed.region !== EXPECTED_FUNCTION_REGION) {
      blockers.push(`FUNCTION_REGION_MISMATCH: ${migration.name} está en ${parsed.region}.`);
    }
    if (deployed.environment !== EXPECTED_FUNCTION_ENVIRONMENT) {
      blockers.push(`FUNCTION_GENERATION_MISMATCH: ${migration.name} no es Gen2.`);
    }
    if (deployed.state !== "ACTIVE") {
      blockers.push(`FUNCTION_NOT_ACTIVE: ${migration.name} no está ACTIVE.`);
    }

    const actualCodebase = deployed.labels?.["firebase-functions-codebase"];
    if (actualCodebase !== migration.codebase) {
      blockers.push(
        `CODEBASE_MIGRATION_INCOMPLETE: ${migration.name} está en ${actualCodebase ?? "(sin etiqueta)"}; `
        + `debe estar en ${migration.codebase} antes de desplegar ${LEGACY_FUNCTIONS_CODEBASE}.`,
      );
    }
  }

  return {
    ok: blockers.length === 0,
    checkedFunctions: MOVED_FUNCTIONS.length,
    blockers,
  };
}
