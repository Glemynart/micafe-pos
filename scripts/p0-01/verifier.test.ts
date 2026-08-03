import assert from "node:assert/strict";
import test from "node:test";
import { crearPlantillaConfiguracionRevision1 } from "../../lib/configuracion";
import {
  type AuthUserView,
  type CertificationExpectations,
  type DocumentView,
  type ReadOnlyCertificationSource,
  validateExpectations,
  verifyTenant,
} from "./verifier";

const tenantId = "tenant-cafe";
const ownerUid = "owner-cafe";

function configuration() {
  const value = crearPlantillaConfiguracionRevision1({
    empresaId: tenantId,
    nombreComercial: "Café Atrato",
    creadaEn: {},
    actualizadaEn: {},
    ultimaMutacion: { actorTipo: "SYSTEM", actorId: "system", origen: "BOOTSTRAP", commandId: "cmd_init", correlationId: "corr_init" },
  });
  value.localizacion.direccion = { linea1: "Calle 1", departamentoCodigo: "11", departamentoNombre: "Bogotá", municipioCodigo: "11001", municipioNombre: "Bogotá" };
  value.modulos = { habilitados: ["sell"] };
  value.identidadFiscal = { ...value.identidadFiscal, razonSocial: "Café Atrato SAS", tipoPersona: "JURIDICA", tipoDocumento: "NIT", numeroDocumento: "900123456", digitoVerificacion: "8", regimenTributario: "responsable_iva", actividadEconomicaPrincipal: "5611" };
  return value;
}

function expectations(): CertificationExpectations {
  return {
    schemaVersion: 1,
    empresaId: tenantId,
    expectedEmpresaNombre: "Café Atrato",
    adminUid: ownerUid,
    modules: ["sell"],
    spaces: [{ id: "salon", nombre: "Salón", categorias: [{ id: "bebidas", nombre: "Bebidas" }] }],
  };
}

function tenantScopedExpectations(): CertificationExpectations {
  return { ...expectations(), categoriesPolicy: "tenant-scoped" };
}

function source(seed: Record<string, Record<string, unknown>>, auth: Record<string, AuthUserView> = {}): ReadOnlyCertificationSource {
  const documents = new Map(Object.entries(seed));
  return {
    async getDocument(path) {
      const data = documents.get(path);
      return data ? { id: path.split("/").at(-1)!, data } : null;
    },
    async listDocuments(collection, filters) {
      return [...documents.entries()]
        .filter(([path, data]) => path.startsWith(`${collection}/`) && filters.every((filter) => data[filter.field] === filter.value))
        .map(([path, data]) => ({ id: path.split("/").at(-1)!, data }));
    },
    async getAuthUser(uid) { return auth[uid] ?? null; },
  };
}

function validSource(overrides: Record<string, Record<string, unknown>> = {}) {
  return source({
    [`empresas/${tenantId}`]: { empresaId: tenantId, nombre: "Café Atrato", estado: "activa", paisFiscal: "CO", ownerUid },
    [`membresias/${tenantId}_${ownerUid}`]: { empresaId: tenantId, uid: ownerUid, rol: "admin", permisos: ["sell"], estado: "activa", activo: true },
    [`configuraciones/${tenantId}`]: configuration() as unknown as Record<string, unknown>,
    [`suscripciones/${tenantId}`]: { empresaId: tenantId, planId: "plan-pos", planVersion: 1, estado: "trialing" },
    "planes/plan-pos/versiones/1": { planId: "plan-pos", planVersion: 1, estado: "PUBLICADA", capacidades: ["sell"] },
    "credenciales_operativas/tenant-cafe_admin": { empresaId: tenantId, uid: ownerUid, codigo: "atrato-admin", pinHash: "redacted", activo: true, requiereCambio: false, bloqueadoHasta: null },
    "espacios/salon": { empresaId: tenantId, nombre: "Salón", activo: true },
    "categorias/bebidas": { empresaId: tenantId, espacioId: "salon", nombre: "Bebidas", activo: true },
    ...overrides,
  }, {
    [ownerUid]: { uid: ownerUid, disabled: false, customClaims: { empresaId: tenantId, rol: "admin" } },
  });
}

test("expectations rejects secrets and unknown modules", () => {
  const result = validateExpectations({ ...expectations(), pin: "123456", modules: ["pos"] });
  assert.equal(result.valid, false);
  if (!result.valid) assert.deepEqual(result.errors.sort(), ["EXPECTATIONS_MODULE_UNKNOWN", "EXPECTATIONS_SENSITIVE_KEY"]);
});

test("expectations rejects an unsupported category policy", () => {
  const result = validateExpectations({ ...expectations(), categoriesPolicy: "catalog" });
  assert.equal(result.valid, false);
  if (!result.valid) assert.deepEqual(result.errors, ["EXPECTATIONS_CATEGORIES_POLICY_UNSUPPORTED"]);
});

test("valid tenant passes automated checks but remains blocked on manual login and UI gates", async () => {
  const report = await verifyTenant(validSource(), expectations(), { projectId: "demo-p0-01", now: new Date("2026-08-02T12:00:00.000Z") });
  assert.equal(report.automatedVerdict, "PASS");
  assert.equal(report.overall, "BLOCKED");
  assert.equal(report.manualGates.length, 2);
  assert.equal(JSON.stringify(report).includes("pinHash"), false);
  assert.equal(JSON.stringify(report).includes("redacted"), false);
});

test("claims and membership mismatch cannot certify the administrator", async () => {
  const report = await verifyTenant(source({
    [`empresas/${tenantId}`]: { empresaId: tenantId, nombre: "Café Atrato", estado: "activa", paisFiscal: "CO", ownerUid },
    [`membresias/${tenantId}_${ownerUid}`]: { empresaId: tenantId, uid: ownerUid, rol: "admin", permisos: ["sell"], estado: "inactiva", activo: false },
  }, { [ownerUid]: { uid: ownerUid, disabled: false, customClaims: { empresaId: "otro-tenant", rol: "admin" } } }), expectations(), { projectId: "demo-p0-01" });
  assert.equal(report.automatedVerdict, "FAIL");
  const failedCodes = report.checks.filter((item) => item.status === "FAIL").map((item) => item.code);
  assert.ok(failedCodes.includes("ADMIN_AUTH_CLAIMS"));
  assert.ok(failedCodes.includes("ADMIN_MEMBERSHIP_CANONICAL"));
});

test("declared administrator must match the tenant owner", async () => {
  const report = await verifyTenant(validSource({
    [`empresas/${tenantId}`]: { empresaId: tenantId, nombre: "CafÃ© Atrato", estado: "activa", paisFiscal: "CO", ownerUid: "other-owner" },
  }), expectations(), { projectId: "demo-p0-01" });
  assert.equal(report.automatedVerdict, "FAIL");
  assert.ok(report.checks.some((item) => item.code === "ADMIN_OWNER_RESOLVED" && item.status === "FAIL"));
});

test("configuration modules outside literal Plan capabilities fail closed", async () => {
  const report = await verifyTenant(validSource({
    "planes/plan-pos/versiones/1": { planId: "plan-pos", planVersion: 1, estado: "PUBLICADA", capacidades: ["pos"] },
  }), expectations(), { projectId: "demo-p0-01" });
  assert.equal(report.automatedVerdict, "FAIL");
  assert.ok(report.checks.some((item) => item.code === "B1_CONFIGURATION_VALID" && item.status === "FAIL"));
  assert.ok(report.checks.some((item) => item.code === "MODULES_EXPECTED_AND_PLAN_ALIGNED" && item.status === "FAIL"));
});

test("unexpected active spaces and categories block certification", async () => {
  const report = await verifyTenant(validSource({
    "espacios/otro": { empresaId: tenantId, nombre: "Otro", activo: true },
    "categorias/otra": { empresaId: tenantId, espacioId: "salon", nombre: "Otra", activo: true },
  }), expectations(), { projectId: "demo-p0-01" });
  assert.equal(report.automatedVerdict, "FAIL");
  assert.ok(report.checks.some((item) => item.code === "SPACES_EXPECTED_AND_TENANT_SCOPED" && item.status === "FAIL"));
  assert.ok(report.checks.some((item) => item.code === "CATEGORIES_EXPECTED_AND_TENANT_SCOPED" && item.status === "FAIL"));
});

test("tenant-scoped category policy accepts an evolving catalog", async () => {
  const report = await verifyTenant(validSource({
    "categorias/bebidas": { empresaId: tenantId, espacioId: "salon", nombre: "Bebidas actuales", activo: true },
    "categorias/otra": { empresaId: tenantId, espacioId: "salon", nombre: "Otra categoria", activo: true },
  }), tenantScopedExpectations(), { projectId: "demo-p0-01" });
  assert.equal(report.automatedVerdict, "PASS");
  const categoryCheck = report.checks.find((item) => item.code === "CATEGORIES_EXPECTED_AND_TENANT_SCOPED");
  assert.equal(categoryCheck?.status, "PASS");
  assert.equal(categoryCheck?.details?.policy, "tenant-scoped");
});

test("tenant-scoped category policy rejects cross-space active categories", async () => {
  const report = await verifyTenant(validSource({
    "categorias/otra": { empresaId: tenantId, espacioId: "espacio-no-aprobado", nombre: "Otra", activo: true },
  }), tenantScopedExpectations(), { projectId: "demo-p0-01" });
  assert.equal(report.automatedVerdict, "FAIL");
  assert.ok(report.checks.some((item) => item.code === "CATEGORIES_EXPECTED_AND_TENANT_SCOPED" && item.status === "FAIL"));
});
