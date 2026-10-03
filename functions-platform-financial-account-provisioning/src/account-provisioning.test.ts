import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { crearIdentificadorInterno } from "../../functions/src/turnos/identificadores";
import { provisionarCuentaOperativaTenant } from "../../functions/src/platform/account-provisioning";

class Ref {
  constructor(public readonly path: string) {}
  get id() { return this.path.split("/").pop()!; }
}

class Snap {
  constructor(public readonly id: string, private readonly value: any) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class Query {
  readonly __isQuery = true;
  constructor(private readonly collectionName: string, private readonly docs: () => Map<string, any>, private readonly filters: Array<[string, unknown]> = []) {}
  where(field: string, _operator: "==", value: unknown) { return new Query(this.collectionName, this.docs, [...this.filters, [field, value]]); }
  ejecutar() {
    const rows = [...this.docs().entries()]
      .filter(([path]) => path.startsWith(`${this.collectionName}/`))
      .filter(([, data]) => this.filters.every(([field, value]) => data?.[field] === value))
      .map(([path, data]) => new Snap(path.split("/").pop()!, data));
    return { size: rows.length, docs: rows, empty: rows.length === 0 };
  }
}

class FakeDb {
  docs = new Map<string, any>();
  collection(name: string) {
    const ref = (path: string) => Object.assign(new Ref(path), { get: async () => new Snap(path.split("/").pop()!, this.docs.get(path)) });
    return Object.assign(ref(name), {
      doc: (id: string) => ref(`${name}/${id}`),
      where: (field: string, operator: "==", value: unknown) => new Query(name, () => this.docs).where(field, operator, value),
    });
  }
  async runTransaction<T>(callback: (tx: any) => Promise<T>) {
    const working = new Map(this.docs);
    const tx = {
      get: async (refOrQuery: any) => refOrQuery.__isQuery
        ? refOrQuery.ejecutar()
        : new Snap(refOrQuery.id, working.get(refOrQuery.path)),
      create: (ref: Ref, value: any) => {
        if (working.has(ref.path)) throw new Error(`EXISTS:${ref.path}`);
        working.set(ref.path, value);
      },
      update: (ref: Ref, value: any) => {
        if (!working.has(ref.path)) throw new Error(`MISSING:${ref.path}`);
        working.set(ref.path, { ...working.get(ref.path), ...value });
      },
    };
    const result = await callback(tx);
    this.docs = working;
    return result;
  }
}

const TOKEN = { saas: { operador: true, versionAutorizacion: 1, facultades: ["LIFECYCLE_GOBERNAR"] } };
const BASE = {
  commandId: "cmd-account-1", idempotencyKey: "idem-account-1", correlationId: "corr-account-1",
  causationId: null, motivoCodigo: "BODEGA_STAGING_FIXTURE",
  empresaId: "empresa-1", claveOperativa: "bancolombia", nombre: "Bancolombia", tipo: "banco",
};

function seed(db: FakeDb) {
  db.docs.set("empresas/empresa-1", { estado: "activa" });
  db.docs.set("saas_operadores/operador-1", { uid: "operador-1", estado: "ACTIVO", facultades: ["LIFECYCLE_GOBERNAR"], versionAutorizacion: 1 });
}

function code(error: unknown) { return error instanceof HttpsError ? `${error.code}:${error.message}` : ""; }

test("crea la cuenta no reservada con identidad física derivada y saldo cero", async () => {
  const db = new FakeDb(); seed(db);
  const result = await provisionarCuentaOperativaTenant(db as any, "operador-1", TOKEN, BASE as any);
  const accountId = crearIdentificadorInterno("empresa-1", "cuenta:bancolombia");
  assert.deepEqual(result, { estado: "CREADA", cuentaId: accountId, empresaId: "empresa-1", claveOperativa: "bancolombia", obligacionId: result.obligacionId, idempotente: false });
  assert.deepEqual(db.docs.get(`cuentas_bancarias/${accountId}`), {
    schemaVersion: 1, id: accountId, empresaId: "empresa-1", claveOperativa: "bancolombia", nombre: "Bancolombia", tipo: "banco", saldo: 0,
    estado: "activa", creadaPor: "operador-1", creadaEn: db.docs.get(`cuentas_bancarias/${accountId}`).creadaEn,
    actualizadaEn: db.docs.get(`cuentas_bancarias/${accountId}`).actualizadaEn,
  });
  assert.equal([...db.docs.keys()].filter((path) => path.startsWith("saas_auditoria/")).length, 1);
});

test("replay idempotente no duplica cuenta, comando ni auditoría", async () => {
  const db = new FakeDb(); seed(db);
  const first = await provisionarCuentaOperativaTenant(db as any, "operador-1", TOKEN, BASE as any);
  const second = await provisionarCuentaOperativaTenant(db as any, "operador-1", TOKEN, BASE as any);
  assert.equal(first.idempotente, false);
  assert.equal(second.idempotente, true);
  assert.equal(second.cuentaId, first.cuentaId);
  assert.equal([...db.docs.keys()].filter((path) => path.startsWith("cuentas_bancarias/")).length, 1);
  assert.equal([...db.docs.keys()].filter((path) => path.startsWith("saas_auditoria/")).length, 1);
});

test("rechaza conflicto de idempotencia y no duplica cuentas", async () => {
  const db = new FakeDb(); seed(db);
  await provisionarCuentaOperativaTenant(db as any, "operador-1", TOKEN, BASE as any);
  await assert.rejects(
    provisionarCuentaOperativaTenant(db as any, "operador-1", TOKEN, { ...BASE, nombre: "Otro banco" } as any),
    (error) => code(error) === "already-exists:IDEMPOTENCY_CONFLICT",
  );
});

test("rechaza actor sin LIFECYCLE_GOBERNAR", async () => {
  const db = new FakeDb(); seed(db);
  db.docs.set("saas_operadores/operador-1", { uid: "operador-1", estado: "ACTIVO", facultades: ["PLATAFORMA_CONSULTAR"], versionAutorizacion: 1 });
  await assert.rejects(provisionarCuentaOperativaTenant(db as any, "operador-1", TOKEN, BASE as any), (error) => code(error) === "permission-denied:PLATFORM_ACCESS_DENIED");
  assert.equal([...db.docs.keys()].some((path) => path.startsWith("cuentas_bancarias/")), false);
});

test("rechaza empresa ausente, empresa no operativa y claves reservadas", async () => {
  const db = new FakeDb(); seed(db); db.docs.delete("empresas/empresa-1");
  await assert.rejects(provisionarCuentaOperativaTenant(db as any, "operador-1", TOKEN, BASE as any), (error) => code(error) === "not-found:EMPRESA_NOT_FOUND");
  seed(db); db.docs.set("empresas/empresa-1", { estado: "suspendida" });
  await assert.rejects(provisionarCuentaOperativaTenant(db as any, "operador-1", TOKEN, { ...BASE, idempotencyKey: "idem-suspendida" } as any), (error) => code(error) === "failed-precondition:EMPRESA_NO_OPERATIVA");
  await assert.rejects(provisionarCuentaOperativaTenant(db as any, "operador-1", TOKEN, { ...BASE, claveOperativa: "caja-principal", idempotencyKey: "idem-reservada" } as any), (error) => code(error) === "invalid-argument:CLAVE_OPERATIVA_INVALIDA");
});

test("rechaza una cuenta existente para la misma clave", async () => {
  const db = new FakeDb(); seed(db);
  const accountId = crearIdentificadorInterno("empresa-1", "cuenta:bancolombia");
  db.docs.set(`cuentas_bancarias/${accountId}`, { id: accountId, empresaId: "empresa-1", claveOperativa: "bancolombia", saldo: 0, estado: "activa" });
  await assert.rejects(provisionarCuentaOperativaTenant(db as any, "operador-1", TOKEN, { ...BASE, idempotencyKey: "idem-existing" } as any), (error) => code(error) === "already-exists:CUENTA_YA_EXISTE");
});

test("ignora autoridad y saldo suministrados por el cliente", async () => {
  const db = new FakeDb(); seed(db);
  const result = await provisionarCuentaOperativaTenant(db as any, "operador-1", TOKEN, {
    ...BASE, idempotencyKey: "idem-authority-fields", id: "cuenta-ajena", uid: "actor-ajeno", saldo: 999_999,
  } as any);
  const account = db.docs.get(`cuentas_bancarias/${result.cuentaId}`);
  assert.equal(result.cuentaId, crearIdentificadorInterno("empresa-1", "cuenta:bancolombia"));
  assert.equal(account.saldo, 0);
  assert.equal(account.uid, undefined);
  assert.equal(account.id, result.cuentaId);
});
