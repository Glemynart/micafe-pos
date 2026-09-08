import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import {
  crearBindingDusemaStaging,
  exigirRuntimeDusemaBinding,
} from "./dusema-binding-command";

type Doc = Record<string, any>;

class Snapshot {
  constructor(readonly id: string, private readonly value: Doc | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class FakeDb {
  readonly docs = new Map<string, Doc>();
  failObligation = false;
  failEvidence = false;
  private tail = Promise.resolve();
  collection(name: string) {
    return {
      doc: (id: string) => {
        const path = `${name}/${id}`;
        return { id, path, get: async () => new Snapshot(id, this.docs.get(path)) };
      },
    };
  }
  async runTransaction<T>(fn: (tx: any) => Promise<T>) {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const pending = new Map<string, Doc>();
    const tx = {
      get: async (ref: any) => new Snapshot(ref.id, pending.get(ref.path) ?? this.docs.get(ref.path)),
      create: (ref: any, data: Doc) => {
        if (this.failObligation && ref.path.startsWith("saas_auditoria_obligaciones/")) throw new Error("AUDIT_WRITE_FAILED");
        if (this.failEvidence && ref.path.startsWith("saas_auditoria/")) throw new Error("EVIDENCE_WRITE_FAILED");
        if (pending.has(ref.path) || this.docs.has(ref.path)) throw new Error("ALREADY_EXISTS");
        pending.set(ref.path, data);
      },
      update: (ref: any, data: Doc) => pending.set(ref.path, { ...(pending.get(ref.path) ?? this.docs.get(ref.path)), ...data }),
    };
    try {
      const result = await fn(tx);
      for (const [path, data] of pending) this.docs.set(path, data);
      return result;
    } finally {
      release();
    }
  }
}

const project = "micafe-pos-staging";
const token = { saas: { operador: true, versionAutorizacion: 1 } };
function input(overrides: Record<string, unknown> = {}) {
  return {
    commandId: "cmd-1", idempotencyKey: "idem-1", correlationId: "corr-1", causationId: null,
    motivoCodigo: "BINDING_STAGING", empresaPosId: "empresa-1", dusemaTenantId: "tenant-1", ...overrides,
  };
}
function seeded() {
  const db = new FakeDb();
  db.docs.set("saas_operadores/operator-1", {
    uid: "operator-1", estado: "ACTIVO", facultades: ["DUSEMA_BINDING_GOBERNAR"], versionAutorizacion: 1,
  });
  db.docs.set("empresas/empresa-1", { estado: "activa" });
  return db;
}
function code(error: unknown) {
  return error instanceof HttpsError ? error.message : String(error);
}

test("crea binding, reserva, receipts y obligación en una transacción", async () => {
  const db = seeded();
  const result = await crearBindingDusemaStaging(db as never, "operator-1", token, input(), project);
  assert.equal(result.estado, "CREADO");
  assert.equal(db.docs.has("saas_platform_bindings/staging:DUSEMA:empresa-1"), true);
  assert.equal(db.docs.has("saas_platform_binding_external_tenants/staging:DUSEMA:tenant-1"), true);
  assert.equal(db.docs.has("saas_comandos/dusema_binding_idem_idem-1"), true);
  assert.equal(db.docs.has("saas_comandos/dusema_binding_command_cmd-1"), true);
  assert.equal([...db.docs.keys()].some((key) => key.startsWith("saas_auditoria_obligaciones/")), true);
});

test("replay idéntico devuelve el receipt sin mutar nuevamente", async () => {
  const db = seeded();
  await crearBindingDusemaStaging(db as never, "operator-1", token, input(), project);
  const result = await crearBindingDusemaStaging(db as never, "operator-1", token, input(), project);
  assert.equal(result.idempotente, true);
  assert.equal([...db.docs.keys()].filter((key) => key.startsWith("saas_platform_bindings/")).length, 1);
});

test("rechaza runtime ausente o distinto, input inválido y facultad ausente", async () => {
  assert.throws(() => exigirRuntimeDusemaBinding(undefined), (error) => code(error) === "DUSEMA_BINDING_RUNTIME_DENIED");
  assert.throws(() => exigirRuntimeDusemaBinding("micafe-pos"), (error) => code(error) === "DUSEMA_BINDING_RUNTIME_DENIED");
  const db = seeded();
  await assert.rejects(crearBindingDusemaStaging(db as never, "operator-1", token, input({ dusemaTenantId: "" }), project), (error) => code(error) === "DUSEMA_TENANT_ID_INVALIDO");
  db.docs.set("saas_operadores/operator-1", { uid: "operator-1", estado: "ACTIVO", facultades: ["DUSEMA_TENANT_CONSULTAR"], versionAutorizacion: 1 });
  await assert.rejects(crearBindingDusemaStaging(db as never, "operator-1", token, input(), project), (error) => code(error) === "PLATFORM_ACCESS_DENIED");
});

test("rechaza claim obsoleto, key o command reutilizados y conflictos de binding/reserva", async () => {
  const stale = seeded();
  await assert.rejects(crearBindingDusemaStaging(stale as never, "operator-1", { saas: { operador: true, versionAutorizacion: 2 } }, input(), project), (error) => code(error) === "PLATFORM_CONTEXT_STALE");
  const db = seeded();
  await crearBindingDusemaStaging(db as never, "operator-1", token, input(), project);
  await assert.rejects(crearBindingDusemaStaging(db as never, "operator-1", token, input({ dusemaTenantId: "tenant-2" }), project), (error) => code(error) === "IDEMPOTENCY_CONFLICT");
  await assert.rejects(crearBindingDusemaStaging(db as never, "operator-1", token, input({ commandId: "cmd-1", idempotencyKey: "idem-2" }), project), (error) => code(error) === "COMMAND_ID_CONFLICT");
  await assert.rejects(crearBindingDusemaStaging(db as never, "operator-1", token, input({ commandId: "cmd-2", idempotencyKey: "idem-2", dusemaTenantId: "tenant-2" }), project), (error) => code(error) === "BINDING_EMPRESA_CONFLICT");
  db.docs.set("empresas/empresa-2", { estado: "activa" });
  await assert.rejects(crearBindingDusemaStaging(db as never, "operator-1", token, input({ commandId: "cmd-3", idempotencyKey: "idem-3", empresaPosId: "empresa-2" }), project), (error) => code(error) === "BINDING_EXTERNAL_TENANT_CONFLICT");
});

test("dos empresas concurrentes no pueden reservar el mismo Tenant Dusema", async () => {
  const db = seeded();
  db.docs.set("empresas/empresa-2", { estado: "activa" });
  const results = await Promise.allSettled([
    crearBindingDusemaStaging(db as never, "operator-1", token, input(), project),
    crearBindingDusemaStaging(db as never, "operator-1", token, input({ commandId: "cmd-2", idempotencyKey: "idem-2", empresaPosId: "empresa-2" }), project),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});

test("falla atómicamente si no puede crear la obligación y no compensa si falla la evidencia posterior", async () => {
  const failing = seeded();
  failing.failObligation = true;
  await assert.rejects(crearBindingDusemaStaging(failing as never, "operator-1", token, input(), project));
  assert.equal(failing.docs.has("saas_platform_bindings/staging:DUSEMA:empresa-1"), false);
  const evidenceFailure = seeded();
  evidenceFailure.failEvidence = true;
  await crearBindingDusemaStaging(evidenceFailure as never, "operator-1", token, input(), project);
  assert.equal(evidenceFailure.docs.has("saas_platform_bindings/staging:DUSEMA:empresa-1"), true);
  assert.equal([...evidenceFailure.docs.values()].some((value) => value.estado === "PENDIENTE"), true);
});
