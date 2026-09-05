import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import {
  PLATFORM_BINDINGS_COLLECTION,
  idBindingDusema,
  resolverBindingDusema,
  type BindingEnvironment,
} from "./bindings";

type Documento = Record<string, unknown>;

class FakeSnapshot {
  constructor(readonly id: string, private readonly value: Documento | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class FakeDb {
  readonly docs = new Map<string, Documento>();

  collection(name: string) {
    assert.equal(name === "empresas" || name === PLATFORM_BINDINGS_COLLECTION, true);
    return {
      doc: (id: string) => ({ get: async () => new FakeSnapshot(id, this.docs.get(`${name}/${id}`)) }),
      where: (field: string, operator: string, value: unknown) => {
        assert.equal(operator, "==");
        return { get: async () => ({
          docs: [...this.docs.entries()]
            .filter(([path, data]) => path.startsWith(`${name}/`) && data[field] === value)
            .map(([path, data]) => new FakeSnapshot(path.slice(name.length + 1), data)),
        }) };
      },
    };
  }
}

const fecha = "2026-08-31T12:00:00.000Z";

function empresa(db: FakeDb, empresaPosId: string) {
  db.docs.set(`empresas/${empresaPosId}`, { estado: "trial" });
}

function binding(
  environment: BindingEnvironment,
  empresaPosId: string,
  externalTenantId = "tenant-dusema-1",
  overrides: Documento = {},
) {
  return {
    schemaVersion: 1,
    productCode: "DUSEMA",
    environment,
    empresaPosId,
    externalTenantId,
    estado: "ACTIVO",
    creadoPor: "operador-1",
    creadoEn: fecha,
    actualizadoPor: "operador-1",
    actualizadoEn: fecha,
    ...overrides,
  };
}

function seedBinding(db: FakeDb, environment: BindingEnvironment, empresaPosId: string, data: Documento) {
  db.docs.set(`${PLATFORM_BINDINGS_COLLECTION}/${idBindingDusema(environment, empresaPosId)}`, data);
}

function codigo(error: unknown): string | undefined {
  return error instanceof HttpsError ? error.message : undefined;
}

test("resuelve binding ACTIVO por ID determinista", async () => {
  const db = new FakeDb();
  empresa(db, "empresa-a");
  seedBinding(db, "staging", "empresa-a", binding("staging", "empresa-a"));
  const result = await resolverBindingDusema(db as never, "empresa-a", "staging");
  assert.equal(result?.externalTenantId, "tenant-dusema-1");
  assert.equal(idBindingDusema("staging", "empresa-a"), "staging:DUSEMA:empresa-a");
});

test("devuelve null sin binding y rechaza estados inactivos", async () => {
  const withoutBinding = new FakeDb();
  empresa(withoutBinding, "empresa-a");
  assert.equal(await resolverBindingDusema(withoutBinding as never, "empresa-a", "staging"), null);

  for (const estado of ["SUSPENDIDO", "REVOCADO"] as const) {
    const db = new FakeDb();
    empresa(db, "empresa-a");
    seedBinding(db, "staging", "empresa-a", binding("staging", "empresa-a", "tenant-1", { estado }));
    await assert.rejects(resolverBindingDusema(db as never, "empresa-a", "staging"), (error: unknown) => codigo(error) === "BINDING_NO_ACTIVO");
  }
});

test("valida empresa, environment, producto y consistencia del documento", async () => {
  const db = new FakeDb();
  await assert.rejects(resolverBindingDusema(db as never, "", "staging"), (error: unknown) => codigo(error) === "EMPRESA_POS_ID_INVALIDO");
  await assert.rejects(resolverBindingDusema(db as never, "empresa-a", "staging"), (error: unknown) => codigo(error) === "EMPRESA_NOT_FOUND");
  empresa(db, "empresa-a");
  await assert.rejects(resolverBindingDusema(db as never, "empresa-a", "development"), (error: unknown) => codigo(error) === "BINDING_ENVIRONMENT_INVALIDO");

  seedBinding(db, "staging", "empresa-a", binding("staging", "empresa-a", "tenant-1", { productCode: "POS" }));
  await assert.rejects(resolverBindingDusema(db as never, "empresa-a", "staging"), (error: unknown) => codigo(error) === "BINDING_PRODUCTO_INVALIDO");
});

test("rechaza binding con environment inconsistente o ID no determinista", async () => {
  const inconsistentEnvironment = new FakeDb();
  empresa(inconsistentEnvironment, "empresa-a");
  seedBinding(inconsistentEnvironment, "staging", "empresa-a", binding("production", "empresa-a"));
  await assert.rejects(resolverBindingDusema(inconsistentEnvironment as never, "empresa-a", "staging"), (error: unknown) => codigo(error) === "BINDING_ENVIRONMENT_INCONSISTENTE");

  const schemaInvalido = new FakeDb();
  empresa(schemaInvalido, "empresa-a");
  seedBinding(schemaInvalido, "staging", "empresa-a", binding("staging", "empresa-a", "tenant-1", { schemaVersion: 2 }));
  await assert.rejects(resolverBindingDusema(schemaInvalido as never, "empresa-a", "staging"), (error: unknown) => codigo(error) === "BINDING_SCHEMA_INVALIDO");

  const missingDeterministic = new FakeDb();
  empresa(missingDeterministic, "empresa-a");
  missingDeterministic.docs.set(`${PLATFORM_BINDINGS_COLLECTION}/arbitrario`, binding("staging", "empresa-a"));
  await assert.rejects(resolverBindingDusema(missingDeterministic as never, "empresa-a", "staging"), (error: unknown) => codigo(error) === "BINDING_ID_DETERMINISTA_AUSENTE");
});

test("aplica cardinalidad activa 1:1 por Empresa y Tenant", async () => {
  const duplicateEmpresa = new FakeDb();
  empresa(duplicateEmpresa, "empresa-a");
  seedBinding(duplicateEmpresa, "staging", "empresa-a", binding("staging", "empresa-a", "tenant-1"));
  duplicateEmpresa.docs.set(`${PLATFORM_BINDINGS_COLLECTION}/otro-binding`, binding("staging", "empresa-a", "tenant-2"));
  await assert.rejects(resolverBindingDusema(duplicateEmpresa as never, "empresa-a", "staging"), (error: unknown) => codigo(error) === "BINDING_CARDINALIDAD_EMPRESA_INVALIDA");

  const duplicateTenant = new FakeDb();
  empresa(duplicateTenant, "empresa-a");
  empresa(duplicateTenant, "empresa-b");
  seedBinding(duplicateTenant, "staging", "empresa-a", binding("staging", "empresa-a", "tenant-1"));
  seedBinding(duplicateTenant, "staging", "empresa-b", binding("staging", "empresa-b", "tenant-1"));
  await assert.rejects(resolverBindingDusema(duplicateTenant as never, "empresa-a", "staging"), (error: unknown) => codigo(error) === "BINDING_CARDINALIDAD_TENANT_INVALIDA");
});
