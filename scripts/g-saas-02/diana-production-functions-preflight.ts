export const DIANA_PRODUCTION_FUNCTIONS = [
  {
    name: "ejecutarComandoComercialSaas",
    codebase: "saas-commercial",
    source: "functions-commercial",
    mayBeNew: false,
  },
  {
    name: "consultarOfertaComercialTenantSaas",
    codebase: "saas-commercial",
    source: "functions-commercial",
    mayBeNew: true,
  },
  {
    name: "solicitarBootstrapEmpresarialSaas",
    codebase: "saas-bootstrap",
    source: "functions-bootstrap",
    mayBeNew: false,
  },
] as const;

export const DIANA_PRODUCTION_PROJECT_ID = "micafe-pos" as const;
export const LEGACY_PRODUCTION_CODEBASE = "saas-auth" as const;
export const DIANA_PRODUCTION_FUNCTION_REGION = "us-central1" as const;
export const DIANA_PRODUCTION_FUNCTION_ENVIRONMENT = "GEN_2" as const;

/**
 * Collects exported names from the named-export forms used by Functions
 * codebase entrypoints. Unsupported export-star syntax is intentionally not
 * expanded; it results in an empty/incomplete set and the preflight blocks.
 */
export function collectNamedFunctionExports(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/export\s*\{([\s\S]*?)\}\s*(?:from\s*["'][^"']+["'])?\s*;?/g)) {
    for (const member of match[1]!.split(",")) {
      const normalized = member.trim().replace(/^type\s+/, "");
      if (!normalized) continue;
      const exported = normalized.split(/\s+as\s+/).at(-1)?.trim();
      if (exported && /^[A-Za-z_$][\w$]*$/.test(exported)) names.add(exported);
    }
  }
  for (const match of source.matchAll(/export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]!);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

export type DeployedDianaFunction = {
  name: string;
  labels?: Record<string, string | undefined> | null;
  state?: string;
  environment?: string;
};

export type DianaFunctionsPreflightFunction = {
  name: string;
  codebase: string;
  disposition: "MIGRATE_FROM_LEGACY" | "ALREADY_IN_TARGET" | "CREATE" | "BLOCKED";
};

export type DianaProductionFunctionsPreflightResult = {
  ok: boolean;
  codebases: string[];
  checkedFunctions: number;
  functions: DianaFunctionsPreflightFunction[];
  blockers: string[];
};

type ParsedFunctionName = {
  projectId: string;
  region: string;
  functionName: string;
};

function parseFunctionName(value: string): ParsedFunctionName | null {
  const match = /^projects\/([^/]+)\/locations\/([^/]+)\/functions\/([^/]+)$/.exec(value);
  if (!match) return null;
  return { projectId: match[1]!, region: match[2]!, functionName: match[3]! };
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function evaluateDianaProductionFunctionsPreflight(input: {
  projectId: string;
  configuredCodebases: readonly { codebase: string; source: string }[];
  sourceExports: Readonly<Record<string, readonly string[]>>;
  deployedFunctions: readonly DeployedDianaFunction[];
}): DianaProductionFunctionsPreflightResult {
  const blockers: string[] = [];
  const codebases: string[] = [...new Set(DIANA_PRODUCTION_FUNCTIONS.map(({ codebase }) => codebase))];
  const expectedNames = new Set<string>(DIANA_PRODUCTION_FUNCTIONS.map(({ name }) => name));

  if (input.projectId !== DIANA_PRODUCTION_PROJECT_ID) {
    blockers.push(`PROJECT_MISMATCH: se esperaba ${DIANA_PRODUCTION_PROJECT_ID}.`);
  }

  for (const codebase of codebases) {
    const expectedSource = DIANA_PRODUCTION_FUNCTIONS.find((entry) => entry.codebase === codebase)!.source;
    const configured = input.configuredCodebases.filter((entry) => entry.codebase === codebase);
    if (configured.length === 0) {
      blockers.push(`CODEBASE_MISSING:${codebase}`);
    } else if (configured.length > 1) {
      blockers.push(`CODEBASE_DUPLICATED:${codebase}`);
    } else if (configured[0]!.source !== expectedSource) {
      blockers.push(`SOURCE_MISMATCH:${codebase}:expected=${expectedSource}:actual=${configured[0]!.source}`);
    }

    const expectedExports = sorted(DIANA_PRODUCTION_FUNCTIONS
      .filter((entry) => entry.codebase === codebase)
      .map(({ name }) => name));
    const actualExports = sorted(input.sourceExports[codebase] ?? []);
    if (actualExports.length !== expectedExports.length
      || actualExports.some((name, index) => name !== expectedExports[index])) {
      blockers.push(`EXPORT_SET_MISMATCH:${codebase}:expected=${expectedExports.join(",")}:actual=${actualExports.join(",")}`);
    }
  }

  for (const deployed of input.deployedFunctions) {
    const codebase = deployed.labels?.["firebase-functions-codebase"];
    if (codebases.includes(codebase ?? "")) {
      const parsed = parseFunctionName(deployed.name);
      if (!parsed) {
        blockers.push(`REMOTE_FUNCTION_NAME_INVALID:${deployed.name}`);
      } else if (!expectedNames.has(parsed.functionName)) {
        blockers.push(`UNEXPECTED_TARGET_FUNCTION:${parsed.functionName}:${codebase}`);
      }
    }
  }

  const functions: DianaFunctionsPreflightFunction[] = [];
  for (const expected of DIANA_PRODUCTION_FUNCTIONS) {
    const matching = input.deployedFunctions.filter((deployed) => {
      const parsed = parseFunctionName(deployed.name);
      return parsed?.functionName === expected.name;
    });

    if (matching.length === 0) {
      if (expected.mayBeNew) {
        functions.push({ name: expected.name, codebase: expected.codebase, disposition: "CREATE" });
      } else {
        blockers.push(`FUNCTION_MISSING:${expected.name}`);
        functions.push({ name: expected.name, codebase: expected.codebase, disposition: "BLOCKED" });
      }
      continue;
    }

    if (matching.length > 1) {
      blockers.push(`FUNCTION_DUPLICATED:${expected.name}`);
      functions.push({ name: expected.name, codebase: expected.codebase, disposition: "BLOCKED" });
      continue;
    }

    const deployed = matching[0]!;
    const parsed = parseFunctionName(deployed.name);
    if (!parsed) {
      blockers.push(`FUNCTION_NAME_INVALID:${expected.name}`);
      functions.push({ name: expected.name, codebase: expected.codebase, disposition: "BLOCKED" });
      continue;
    }
    if (parsed.projectId !== input.projectId) {
      blockers.push(`FUNCTION_PROJECT_MISMATCH:${expected.name}:${parsed.projectId}`);
    }
    if (parsed.region !== DIANA_PRODUCTION_FUNCTION_REGION) {
      blockers.push(`REGION_MISMATCH:${expected.name}:${parsed.region}`);
    }
    if (deployed.environment !== DIANA_PRODUCTION_FUNCTION_ENVIRONMENT) {
      blockers.push(`GENERATION_MISMATCH:${expected.name}:${deployed.environment ?? "unknown"}`);
    }
    if (deployed.state !== "ACTIVE") {
      blockers.push(`FUNCTION_NOT_ACTIVE:${expected.name}:${deployed.state ?? "unknown"}`);
    }

    const actualCodebase = deployed.labels?.["firebase-functions-codebase"];
    if (actualCodebase === expected.codebase) {
      functions.push({ name: expected.name, codebase: expected.codebase, disposition: "ALREADY_IN_TARGET" });
    } else if (actualCodebase === LEGACY_PRODUCTION_CODEBASE) {
      functions.push({ name: expected.name, codebase: expected.codebase, disposition: "MIGRATE_FROM_LEGACY" });
    } else {
      blockers.push(`CODEBASE_UNEXPECTED:${expected.name}:${actualCodebase ?? "unlabeled"}`);
      functions.push({ name: expected.name, codebase: expected.codebase, disposition: "BLOCKED" });
    }
  }

  return {
    ok: blockers.length === 0,
    codebases,
    checkedFunctions: DIANA_PRODUCTION_FUNCTIONS.length,
    functions,
    blockers,
  };
}
