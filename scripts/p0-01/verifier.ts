import { createHash } from "node:crypto";
import {
  MODULOS_CONFIGURACION,
  evaluarReadinessConfiguracion,
  validarConfiguracionEmpresa,
  type ConfiguracionEmpresa,
} from "../../lib/configuracion";

export const VERIFIER_NAME = "p0-01-tenant-certification-verifier";
export const VERIFIER_SCHEMA_VERSION = 1 as const;

export type CheckStatus = "PASS" | "FAIL" | "BLOCKED" | "PENDING";
export type Verdict = "PASS" | "FAIL" | "BLOCKED";

export interface DocumentView {
  id: string;
  data: Record<string, unknown>;
}

export interface AuthUserView {
  uid: string;
  disabled: boolean;
  customClaims: Record<string, unknown>;
}

/**
 * Fuente deliberadamente limitada a lecturas. La interfaz no ofrece métodos
 * de escritura para que el verificador no pueda mutar Firestore por diseño.
 */
export interface ReadOnlyCertificationSource {
  getDocument(path: string): Promise<DocumentView | null>;
  listDocuments(collection: string, filters: readonly { field: string; value: unknown }[]): Promise<DocumentView[]>;
  getAuthUser(uid: string): Promise<AuthUserView | null>;
}

export interface ExpectedCategory {
  id: string;
  nombre: string;
}

export interface ExpectedSpace {
  id: string;
  nombre: string;
  categorias?: ExpectedCategory[];
}

/**
 * Manifiesto de expectativas aprobado fuera del producto. No es una fuente
 * de autoridad de dominio: expresa qué debe certificarse para una ejecución.
 */
export interface CertificationExpectations {
  schemaVersion: 1;
  empresaId: string;
  expectedEmpresaNombre: string;
  expectedEstado?: "activa";
  adminUid?: string;
  modules: string[];
  spaces: ExpectedSpace[];
  /**
   * `exact` preserves the original contract. `tenant-scoped` is useful when
   * categories are intentionally outside the certification scope: it checks
   * isolation and space consistency without approving a definitive catalog.
   */
  categoriesPolicy?: "exact" | "tenant-scoped";
}

export interface CheckResult {
  code: string;
  status: CheckStatus;
  summary: string;
  details?: Record<string, unknown>;
}

export interface CertificationReport {
  tool: {
    name: typeof VERIFIER_NAME;
    schemaVersion: typeof VERIFIER_SCHEMA_VERSION;
  };
  execution: {
    mode: "READ_ONLY";
    projectId: string;
    empresaId: string;
    startedAt: string;
    completedAt: string;
  };
  automatedVerdict: Verdict;
  overall: Verdict;
  checks: CheckResult[];
  manualGates: CheckResult[];
}

const SENSITIVE_KEY = /pin|secret|token|password|credential|hash|pepper|email|telefono|documento/i;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firestoreId(value: unknown): string | null {
  const normalized = text(value);
  return normalized && !normalized.includes("/") && normalized !== "." && normalized !== ".." ? normalized : null;
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return value as string[];
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));
}

function check(code: string, status: CheckStatus, summary: string, details?: Record<string, unknown>): CheckResult {
  return details ? { code, status, summary, details } : { code, status, summary };
}

function timestampMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    const result = value.toMillis();
    return typeof result === "number" && Number.isFinite(result) ? result : null;
  }
  return null;
}

function containsSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => SENSITIVE_KEY.test(key) || containsSensitiveKey(child));
}

export function validateExpectations(value: unknown): { valid: true; value: CertificationExpectations } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["EXPECTATIONS_OBJECT_REQUIRED"] };
  const input = value as Record<string, unknown>;
  if (containsSensitiveKey(value)) errors.push("EXPECTATIONS_SENSITIVE_KEY");
  if (input.schemaVersion !== 1) errors.push("EXPECTATIONS_SCHEMA_UNSUPPORTED");
  if (!firestoreId(input.empresaId)) errors.push("EXPECTATIONS_EMPRESA_ID_REQUIRED");
  if (!text(input.expectedEmpresaNombre)) errors.push("EXPECTATIONS_EMPRESA_NAME_REQUIRED");
  if (input.expectedEstado !== undefined && input.expectedEstado !== "activa") errors.push("EXPECTATIONS_STATE_UNSUPPORTED");
  if (input.adminUid !== undefined && !firestoreId(input.adminUid)) errors.push("EXPECTATIONS_ADMIN_UID_INVALID");
  if (input.categoriesPolicy !== undefined && input.categoriesPolicy !== "exact" && input.categoriesPolicy !== "tenant-scoped") {
    errors.push("EXPECTATIONS_CATEGORIES_POLICY_UNSUPPORTED");
  }

  const modules = stringList(input.modules);
  if (!modules) errors.push("EXPECTATIONS_MODULES_REQUIRED");
  else {
    if (new Set(modules).size !== modules.length) errors.push("EXPECTATIONS_MODULES_DUPLICATED");
    if (modules.some((module) => !(MODULOS_CONFIGURACION as readonly string[]).includes(module))) errors.push("EXPECTATIONS_MODULE_UNKNOWN");
  }

  if (!Array.isArray(input.spaces)) errors.push("EXPECTATIONS_SPACES_REQUIRED");
  const spaces: ExpectedSpace[] = [];
  if (Array.isArray(input.spaces)) {
    const spaceIds = new Set<string>();
    for (const rawSpace of input.spaces) {
      if (!rawSpace || typeof rawSpace !== "object" || Array.isArray(rawSpace)) {
        errors.push("EXPECTATIONS_SPACE_INVALID");
        continue;
      }
      const space = rawSpace as Record<string, unknown>;
      const id = firestoreId(space.id);
      const nombre = text(space.nombre);
      if (!id || !nombre) errors.push("EXPECTATIONS_SPACE_ID_OR_NAME_REQUIRED");
      if (id && spaceIds.has(id)) errors.push("EXPECTATIONS_SPACES_DUPLICATED");
      if (id) spaceIds.add(id);
      const categories: ExpectedCategory[] = [];
      if (space.categorias !== undefined) {
        if (!Array.isArray(space.categorias)) errors.push("EXPECTATIONS_CATEGORIES_INVALID");
        else {
          const categoryIds = new Set<string>();
          for (const rawCategory of space.categorias) {
            if (!rawCategory || typeof rawCategory !== "object" || Array.isArray(rawCategory)) {
              errors.push("EXPECTATIONS_CATEGORY_INVALID");
              continue;
            }
            const category = rawCategory as Record<string, unknown>;
            const categoryId = firestoreId(category.id);
            const categoryName = text(category.nombre);
            if (!categoryId || !categoryName) errors.push("EXPECTATIONS_CATEGORY_ID_OR_NAME_REQUIRED");
            if (categoryId && categoryIds.has(categoryId)) errors.push("EXPECTATIONS_CATEGORIES_DUPLICATED");
            if (categoryId) {
              categoryIds.add(categoryId);
              categories.push({ id: categoryId, nombre: categoryName ?? "" });
            }
          }
        }
      }
      if (id && nombre) spaces.push({ id, nombre, ...(space.categorias !== undefined ? { categorias: categories } : {}) });
    }
  }

  if (errors.length > 0) return { valid: false, errors: [...new Set(errors)] };
  return {
    valid: true,
    value: {
      schemaVersion: 1,
      empresaId: firestoreId(input.empresaId)!,
      expectedEmpresaNombre: text(input.expectedEmpresaNombre)!,
      ...(input.expectedEstado ? { expectedEstado: "activa" as const } : {}),
      ...(input.adminUid ? { adminUid: firestoreId(input.adminUid)! } : {}),
      modules: modules!,
      spaces,
      categoriesPolicy: input.categoriesPolicy === "tenant-scoped" ? "tenant-scoped" : "exact",
    },
  };
}

function activeDocument(view: DocumentView | null): Record<string, unknown> | null {
  return view?.data ?? null;
}

function redactValidationErrors(errors: readonly { ruta: string; codigo: string }[]): Record<string, unknown> {
  return { errors: errors.map(({ ruta, codigo }) => ({ ruta, codigo })) };
}

function activeUntil(value: unknown, nowMs: number): boolean {
  const until = timestampMillis(value);
  return until !== null && until > nowMs;
}

function moduleValues(data: Record<string, unknown> | null): string[] {
  const modules = data?.modulos;
  if (!modules || typeof modules !== "object" || Array.isArray(modules)) return [];
  return stringList((modules as Record<string, unknown>).habilitados) ?? [];
}

function expectedCategoryMap(expectations: CertificationExpectations): Map<string, ExpectedCategory[]> {
  return new Map(expectations.spaces.map((space) => [space.id, space.categorias ?? []]));
}

function actualCategoryMap(categories: DocumentView[]): Map<string, DocumentView[]> {
  const result = new Map<string, DocumentView[]>();
  for (const category of categories) {
    const spaceId = text(category.data.espacioId) ?? "";
    const current = result.get(spaceId) ?? [];
    current.push(category);
    result.set(spaceId, current);
  }
  return result;
}

export async function verifyTenant(
  source: ReadOnlyCertificationSource,
  expectations: CertificationExpectations,
  execution: { projectId: string; now?: Date },
): Promise<CertificationReport> {
  const started = execution.now ?? new Date();
  const checks: CheckResult[] = [];
  const tenantId = expectations.empresaId;
  const empresa = await source.getDocument(`empresas/${tenantId}`);
  if (!empresa) {
    checks.push(check("TENANT_EXISTS", "FAIL", "No existe el documento de la Empresa esperada."));
    return finalizeReport(execution.projectId, tenantId, started, checks);
  }

  const empresaData = empresa.data;
  const expectedName = expectations.expectedEmpresaNombre;
  const actualName = text(empresaData.nombreComercial) ?? text(empresaData.nombre);
  const expectedState = expectations.expectedEstado ?? "activa";
  checks.push(check(
    "TENANT_ACTIVE_AND_EXPECTED",
    empresaData.estado === expectedState && actualName === expectedName && (empresaData.empresaId === undefined || empresaData.empresaId === tenantId) ? "PASS" : "FAIL",
    "La Empresa coincide con el tenant y el estado esperado.",
    { expectedName, actualName, expectedState, actualState: text(empresaData.estado) },
  ));

  const ownerUid = expectations.adminUid ?? text(empresaData.ownerUid);
  const ownerUidMatchesTenant = !expectations.adminUid || !empresaData.ownerUid || empresaData.ownerUid === ownerUid;
  checks.push(check(
    "ADMIN_OWNER_RESOLVED",
    ownerUid && ownerUidMatchesTenant ? "PASS" : "FAIL",
    ownerUid && ownerUidMatchesTenant
      ? "Se resolvió el administrador canónico desde ownerUid."
      : "El administrador esperado no coincide con ownerUid o no está definido.",
    { principal: ownerUid ? digest(ownerUid) : null, ownerUidMatchesTenant },
  ));

  const [membership, authUser, configuration, subscription, spaces, categories, credentials] = await Promise.all([
    ownerUid ? source.getDocument(`membresias/${tenantId}_${ownerUid}`) : Promise.resolve(null),
    ownerUid ? source.getAuthUser(ownerUid) : Promise.resolve(null),
    source.getDocument(`configuraciones/${tenantId}`),
    source.getDocument(`suscripciones/${tenantId}`),
    source.listDocuments("espacios", [{ field: "empresaId", value: tenantId }]),
    source.listDocuments("categorias", [{ field: "empresaId", value: tenantId }]),
    ownerUid ? source.listDocuments("credenciales_operativas", [
      { field: "empresaId", value: tenantId },
      { field: "uid", value: ownerUid },
    ]) : Promise.resolve([]),
  ]);

  const membershipData = activeDocument(membership);
  checks.push(check(
    "ADMIN_MEMBERSHIP_CANONICAL",
    membershipData && membershipData.empresaId === tenantId && membershipData.uid === ownerUid
      && membershipData.rol === "admin" && membershipData.estado === "activa" && membershipData.activo === true
      && Array.isArray(membershipData.permisos) && membershipData.permisos.every((item) => typeof item === "string" && item.length > 0)
      ? "PASS" : "FAIL",
    "La membresía del administrador coincide con la autoridad canónica.",
    { principal: ownerUid ? digest(ownerUid) : null },
  ));

  const claims = authUser?.customClaims ?? {};
  checks.push(check(
    "ADMIN_AUTH_CLAIMS",
    authUser && authUser.uid === ownerUid && authUser.disabled === false && claims.empresaId === tenantId && claims.rol === "admin" && claims.authStage !== "DIRECTA_TEMP"
      ? "PASS" : "FAIL",
    "La identidad Auth está habilitada y sus claims coinciden con Empresa y membresía.",
    { principal: ownerUid ? digest(ownerUid) : null, authUserExists: Boolean(authUser), disabled: authUser?.disabled ?? null },
  ));

  const nowMs = started.getTime();
  const activeCredentials = credentials.filter((credential) => credential.data.activo === true);
  const readyCredential = activeCredentials.length === 1
    && activeCredentials[0].data.empresaId === tenantId
    && activeCredentials[0].data.uid === ownerUid
    && typeof credentialCode(activeCredentials[0].data) === "string"
    && typeof activeCredentials[0].data.pinHash === "string"
    && activeCredentials[0].data.requiereCambio !== true
    && !activeUntil(activeCredentials[0].data.bloqueadoHasta, nowMs);
  checks.push(check(
    "ADMIN_OPERATIONAL_CREDENTIAL_READY",
    readyCredential ? "PASS" : "FAIL",
    "Existe exactamente una credencial operativa activa y utilizable para el administrador, sin exponer secretos.",
    { total: credentials.length, active: activeCredentials.length, blocked: activeCredentials.filter((item) => activeUntil(item.data.bloqueadoHasta, nowMs)).length },
  ));

  let planData: Record<string, unknown> | null = null;
  const subscriptionData = activeDocument(subscription);
  const subscriptionValid = Boolean(subscriptionData)
    && subscriptionData!.empresaId === tenantId
    && typeof subscriptionData!.planId === "string"
    && Number.isInteger(subscriptionData!.planVersion);
  checks.push(check(
    "PLAN_SUBSCRIPTION_CANONICAL",
    subscriptionValid ? "PASS" : "FAIL",
    "La suscripción enlaza la Empresa con una versión concreta del Plan.",
    subscriptionData ? { estado: text(subscriptionData.estado), planId: text(subscriptionData.planId), planVersion: subscriptionData.planVersion } : { exists: false },
  ));

  if (subscriptionValid) {
    const plan = await source.getDocument(`planes/${subscriptionData!.planId}/versiones/${subscriptionData!.planVersion}`);
    planData = activeDocument(plan);
  }
  const planCapabilities = stringList(planData?.capacidades) ?? [];
  checks.push(check(
    "PLAN_VERSION_PUBLISHED",
    planData?.estado === "PUBLICADA" ? "PASS" : "FAIL",
    "La versión contratada del Plan existe y está publicada.",
    planData ? { estado: text(planData.estado), capabilityCount: planCapabilities.length } : { exists: false },
  ));

  const configurationData = activeDocument(configuration);
  const validation = configurationData
    ? validarConfiguracionEmpresa(configurationData, {
        empresaId: tenantId,
        paisFiscalEmpresa: text(empresaData.paisFiscal) ?? undefined,
        modulosPermitidos: planCapabilities,
      })
    : null;
  checks.push(check(
    "B1_CONFIGURATION_VALID",
    validation?.valida === true ? "PASS" : "FAIL",
    "La configuración B1 existe y pasa el validador canónico con el contexto del tenant y el Plan.",
    validation ? redactValidationErrors(validation.errores) : { exists: false },
  ));

  const readiness = configurationData ? evaluarReadinessConfiguracion(configurationData as unknown as ConfiguracionEmpresa, {
    empresaId: tenantId,
    paisFiscalEmpresa: text(empresaData.paisFiscal) ?? undefined,
    modulosPermitidos: planCapabilities,
  }) : null;
  checks.push(check(
    "B1_OPERATIONAL_READINESS",
    readiness?.operativa.lista === true ? "PASS" : "FAIL",
    "La configuración B1 alcanza readiness operativa; la readiness fiscal queda fuera de P0-01.",
    readiness ? { operativa: readiness.operativa, fiscal: readiness.fiscal } : { exists: false },
  ));

  const configuredModules = moduleValues(configurationData);
  checks.push(check(
    "MODULES_EXPECTED_AND_PLAN_ALIGNED",
    sameSet(configuredModules, expectations.modules) && configuredModules.every((module) => planCapabilities.includes(module)) ? "PASS" : "FAIL",
    "Los módulos configurados coinciden con las expectativas y con las capacidades literales del Plan.",
    { expected: sorted(expectations.modules), configured: sorted(configuredModules), planCapabilities: sorted(planCapabilities) },
  ));

  const activeSpaces = spaces.filter((space) => space.data.activo === true);
  const spaceChecks = await Promise.all(expectations.spaces.map(async (expected) => {
    const direct = await source.getDocument(`espacios/${expected.id}`);
    const data = activeDocument(direct);
    return {
      expected,
      data,
      foundInTenantQuery: spaces.some((space) => space.id === expected.id),
    };
  }));
  const spacesPass = spaceChecks.every(({ expected, data, foundInTenantQuery }) => foundInTenantQuery
    && data?.empresaId === tenantId && data.nombre === expected.nombre && data.activo === true);
  const unexpectedSpaces = activeSpaces.filter((space) => !expectations.spaces.some((expected) => expected.id === space.id)).map((space) => space.id);
  checks.push(check(
    "SPACES_EXPECTED_AND_TENANT_SCOPED",
    spacesPass && unexpectedSpaces.length === 0 ? "PASS" : "FAIL",
    "Los espacios esperados existen, están activos y pertenecen al tenant; no hay espacios activos inesperados.",
    { expectedCount: expectations.spaces.length, actualActiveCount: activeSpaces.length, unexpectedIds: unexpectedSpaces },
  ));

  const categoriesPolicy = expectations.categoriesPolicy ?? "exact";
  if (categoriesPolicy === "tenant-scoped") {
    const expectedSpaceIds = new Set(expectations.spaces.map((space) => space.id));
    const invalidCategories = categories.filter((category) => {
      const spaceId = text(category.data.espacioId);
      return category.data.empresaId !== tenantId
        || (category.data.activo === true && (!spaceId || !expectedSpaceIds.has(spaceId) || !text(category.data.nombre)));
    });
    checks.push(check(
      "CATEGORIES_EXPECTED_AND_TENANT_SCOPED",
      invalidCategories.length === 0 ? "PASS" : "FAIL",
      "Las categorias se validan por aislamiento del tenant y consistencia con espacios activos; el catalogo exacto queda fuera de alcance.",
      {
        policy: categoriesPolicy,
        checked: categories.length,
        activeCount: categories.filter((category) => category.data.activo === true).length,
        expectedSpaceIds: sorted([...expectedSpaceIds]),
        failedIds: invalidCategories.map((category) => category.id),
      },
    ));
  } else {
  const expectedCategories = expectedCategoryMap(expectations);
  const categoriesBySpace = actualCategoryMap(categories);
  const categoryChecks: Array<{ id: string; status: CheckStatus }> = [];
  for (const [spaceId, expectedValues] of expectedCategories) {
    const actualValues = categoriesBySpace.get(spaceId) ?? [];
    for (const expected of expectedValues) {
      const direct = await source.getDocument(`categorias/${expected.id}`);
      const data = activeDocument(direct);
      categoryChecks.push({
        id: expected.id,
        status: data?.empresaId === tenantId && data.espacioId === spaceId && data.nombre === expected.nombre && data.activo === true
          && actualValues.some((item) => item.id === expected.id) ? "PASS" : "FAIL",
      });
    }
    const unexpected = actualValues.filter((item) => item.data.activo === true && !expectedValues.some((expected) => expected.id === item.id));
    for (const item of unexpected) categoryChecks.push({ id: item.id, status: "FAIL" });
  }
  for (const [spaceId, actualValues] of categoriesBySpace) {
    if (expectedCategories.has(spaceId)) continue;
    for (const item of actualValues) {
      if (item.data.activo === true) categoryChecks.push({ id: item.id, status: "FAIL" });
    }
  }
  checks.push(check(
    "CATEGORIES_EXPECTED_AND_TENANT_SCOPED",
    categoryChecks.every((item) => item.status === "PASS") ? "PASS" : "FAIL",
    "Las categorías esperadas pertenecen al espacio y tenant correctos.",
    { expectedCount: [...expectedCategories.values()].reduce((total, values) => total + values.length, 0), checked: categoryChecks.length, failedIds: categoryChecks.filter((item) => item.status !== "PASS").map((item) => item.id) },
  ));
  }

  return finalizeReport(execution.projectId, tenantId, started, checks);
}

function credentialCode(data: Record<string, unknown>): string | null {
  const value = data.codigo;
  return typeof value === "string" && value.trim() ? value : null;
}

function finalizeReport(projectId: string, empresaId: string, started: Date, checks: CheckResult[]): CertificationReport {
  const manualGates: CheckResult[] = [
    check("MANUAL_LOGIN_AND_TENANT_RESOLUTION", "PENDING", "El inicio de sesión real y la resolución del tenant deben comprobarse con el canal representativo."),
    check("MANUAL_RULES_AND_UI_VISIBILITY", "PENDING", "La visibilidad real de módulos y espacios debe comprobarse sin denegaciones de Rules ni 404."),
  ];
  const automatedVerdict: Verdict = checks.some((item) => item.status === "FAIL")
    ? "FAIL"
    : checks.some((item) => item.status === "BLOCKED") ? "BLOCKED" : "PASS";
  const overall: Verdict = automatedVerdict !== "PASS"
    ? automatedVerdict
    : manualGates.some((item) => item.status === "PENDING") ? "BLOCKED" : "PASS";
  return {
    tool: { name: VERIFIER_NAME, schemaVersion: VERIFIER_SCHEMA_VERSION },
    execution: {
      mode: "READ_ONLY",
      projectId,
      empresaId,
      startedAt: started.toISOString(),
      completedAt: new Date().toISOString(),
    },
    automatedVerdict,
    overall,
    checks,
    manualGates,
  };
}
