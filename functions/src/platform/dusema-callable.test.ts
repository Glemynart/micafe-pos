import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { ejecutarConsultaTenantDusema, consultarTenantDusemaSaas } from "./callables";
import { idBindingDusema, PLATFORM_BINDINGS_COLLECTION, type BindingEnvironment } from "./bindings";
import type { HechoAuditable } from "./audit";
import { DusemaS2sError, type DusemaTenantMetadata } from "./dusema-s2s-client";
import { validarFiltroAuditoria } from "./queries";

type Documento = Record<string, unknown>;
class Snap { constructor(readonly id: string, private readonly value: Documento | undefined) {} get exists() { return this.value !== undefined; } data() { return this.value; } }
class FakeDb {
  readonly docs = new Map<string, Documento>();
  collection(name: string) {
    assert.ok(["empresas", "saas_operadores", PLATFORM_BINDINGS_COLLECTION].includes(name));
    return { doc: (id: string) => ({ get: async () => new Snap(id, this.docs.get(`${name}/${id}`)) }), where: (field: string, op: string, value: unknown) => {
      assert.equal(op, "=="); return { get: async () => ({ docs: [...this.docs.entries()].filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value).map(([path, data]) => new Snap(path.slice(name.length + 1), data)) }) };
    } };
  }
}
const auth = { uid: "operador-1", token: { saas: { operador: true, versionAutorizacion: 4 } } };
const binding = { schemaVersion: 1, productCode: "DUSEMA", environment: "staging" as BindingEnvironment, empresaPosId: "empresa-a", externalTenantId: "tenant-from-binding", estado: "ACTIVO", creadoPor: "operador-1", creadoEn: "2026-08-31T12:00:00.000Z", actualizadoPor: "operador-1", actualizadoEn: "2026-08-31T12:00:00.000Z" };
const tenant: DusemaTenantMetadata = { id: "tenant-from-binding", nombre: "Tenant Dusema", razonSocial: "Tenant Dusema S.A.S.", nit: "900000000-1", activo: true, plan: "basic", createdAt: "2026-08-31T12:00:00.000Z", updatedAt: "2026-08-31T12:00:00.000Z" };
function setup(facultades: string[] = ["DUSEMA_TENANT_CONSULTAR"]) {
  const db = new FakeDb(); db.docs.set("saas_operadores/operador-1", { uid: "operador-1", estado: "ACTIVO", facultades, versionAutorizacion: 4 }); db.docs.set("empresas/empresa-a", { estado: "activa" });
  const audits: HechoAuditable[] = []; const calls: Array<{ tenantId: string; context: Documento }> = [];
  return { db, audits, calls, dependencies: { db: db as never, environment: "staging" as const, correlationId: () => "correlation-fixed", audit: async (_db: unknown, hecho: HechoAuditable) => { audits.push(hecho); }, client: { getTenant: async (tenantId: string, context: Documento) => { calls.push({ tenantId, context }); return tenant; } } } };
}
function request(data: unknown, authenticated = true) { return { data, auth: authenticated ? auth : null }; }
function isError(error: unknown, code: string, message?: string) { return error instanceof HttpsError && error.code === code && (message === undefined || error.message === message); }
function seedBinding(db: FakeDb, extra: Documento = {}) { db.docs.set(`${PLATFORM_BINDINGS_COLLECTION}/${idBindingDusema("staging", "empresa-a")}`, { ...binding, ...extra }); }

test("rechaza autenticacion, facultad y entrada invalidas", async () => {
  await assert.rejects(ejecutarConsultaTenantDusema(request({ empresaPosId: "empresa-a" }, false)), (e) => isError(e, "unauthenticated", "AUTENTICACION_REQUERIDA"));
  const noFaculty = setup(["PLATAFORMA_CONSULTAR"]); await assert.rejects(ejecutarConsultaTenantDusema(request({ empresaPosId: "empresa-a" }), noFaculty.dependencies), (e) => isError(e, "permission-denied", "PLATFORM_ACCESS_DENIED"));
  const invalid = setup(); await assert.rejects(ejecutarConsultaTenantDusema(request({}), invalid.dependencies), (e) => isError(e, "invalid-argument"));
  await assert.rejects(ejecutarConsultaTenantDusema(request({ empresaPosId: "empresa-a", tenantId: "attacker" }), invalid.dependencies), (e) => isError(e, "invalid-argument", "ENTRADA_DUSEMA_INVALIDA"));
});

test("empresa inexistente, sin binding y binding no activo no llaman Dusema", async () => {
  const missing = setup(); missing.db.docs.delete("empresas/empresa-a"); await assert.rejects(ejecutarConsultaTenantDusema(request({ empresaPosId: "empresa-a" }), missing.dependencies), (e) => isError(e, "not-found", "EMPRESA_NOT_FOUND"));
  const noBinding = setup(); assert.deepEqual(await ejecutarConsultaTenantDusema(request({ empresaPosId: "empresa-a" }), noBinding.dependencies), { estado: "NO_VINCULADO", tenant: null }); assert.equal(noBinding.calls.length, 0);
  for (const estado of ["SUSPENDIDO", "REVOCADO"]) { const inactive = setup(); seedBinding(inactive.db, { estado }); await assert.rejects(ejecutarConsultaTenantDusema(request({ empresaPosId: "empresa-a" }), inactive.dependencies), (e) => isError(e, "failed-precondition", "BINDING_NO_ACTIVO")); assert.equal(inactive.calls.length, 0); }
});

test("resuelve solo desde binding, proyecta allowlist y audita", async () => {
  const state = setup(); seedBinding(state.db); const result = await ejecutarConsultaTenantDusema(request({ empresaPosId: "empresa-a" }), state.dependencies);
  assert.equal(result.estado, "ACTIVO"); assert.deepEqual(result.tenant, tenant); assert.deepEqual(state.calls[0], { tenantId: "tenant-from-binding", context: { actorUid: "operador-1", empresaPosId: "empresa-a", correlationId: "correlation-fixed" } });
  assert.equal(state.audits[0]?.tipo, "DUSEMA_TENANT_CONSULTADO"); assert.equal(state.audits[0]?.correlacionId, "correlation-fixed"); assert.equal(JSON.stringify(state.audits).includes("Bearer"), false);
});

test("representa INACTIVO, NO_ENCONTRADO y ERROR_TEMPORAL", async () => {
  const inactive = setup(); seedBinding(inactive.db); inactive.dependencies.client = { getTenant: async () => ({ ...tenant, activo: false, users: ["forbidden"] }) }; const result = await ejecutarConsultaTenantDusema(request({ empresaPosId: "empresa-a" }), inactive.dependencies); assert.equal(result.estado, "INACTIVO"); assert.deepEqual(Object.keys(result.tenant ?? {}).sort(), ["activo", "createdAt", "id", "nit", "nombre", "plan", "razonSocial", "updatedAt"]);
  const missing = setup(); seedBinding(missing.db); missing.dependencies.client = { getTenant: async () => { throw new DusemaS2sError("DUSEMA_TENANT_NOT_FOUND"); } }; assert.deepEqual(await ejecutarConsultaTenantDusema(request({ empresaPosId: "empresa-a" }), missing.dependencies), { estado: "NO_ENCONTRADO", tenant: null });
  const unavailable = setup(); seedBinding(unavailable.db); unavailable.dependencies.client = { getTenant: async () => { throw new DusemaS2sError("DUSEMA_TIMEOUT"); } }; assert.deepEqual(await ejecutarConsultaTenantDusema(request({ empresaPosId: "empresa-a" }), unavailable.dependencies), { estado: "ERROR_TEMPORAL", tenant: null });
});

test("normaliza acceso Dusema, declara secret y protege consulta de auditoria", async () => {
  const state = setup(); seedBinding(state.db); state.dependencies.client = { getTenant: async () => { throw new DusemaS2sError("DUSEMA_FORBIDDEN"); } }; await assert.rejects(ejecutarConsultaTenantDusema(request({ empresaPosId: "empresa-a" }), state.dependencies), (e) => isError(e, "permission-denied", "DUSEMA_ACCESS_DENIED"));
  const endpoint = (consultarTenantDusemaSaas as unknown as { __endpoint?: { secretEnvironmentVariables?: Array<{ key: string }> } }).__endpoint; assert.deepEqual(endpoint?.secretEnvironmentVariables, [{ key: "DUSEMA_S2S_PRIVATE_KEY" }]);
  assert.throws(() => validarFiltroAuditoria({ por: "tipo", valor: "DUSEMA_TENANT_CONSULTADO" }), /VENTANA_TEMPORAL_REQUERIDA/);
});
