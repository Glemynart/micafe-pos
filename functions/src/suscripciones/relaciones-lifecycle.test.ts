import assert from "node:assert/strict";
import test from "node:test";
import { FieldValue } from "firebase-admin/firestore";
import { confirmarPagoAnualRelacionContractual, suspenderRelacionContractualVencida } from "./relaciones-service";

class Ref {
  constructor(public path: string) {}
  collection(id: string) { return new Ref(`${this.path}/${id}`); }
  doc(id: string) { return new Ref(`${this.path}/${id}`); }
}

class Snap {
  constructor(private readonly value: any) {}
  get exists() { return this.value !== undefined; }
  data() { return structuredClone(this.value); }
}

class Db {
  docs = new Map<string, any>();
  private queue = Promise.resolve();
  collection(name: string) { return new Ref(name); }
  seed(path: string, value: any) { this.docs.set(path, structuredClone(value)); }
  read(path: string) { return this.docs.get(path); }
  async runTransaction<T>(callback: (tx: any) => Promise<T>) {
    let release!: () => void;
    const previous = this.queue;
    this.queue = new Promise((resolve) => { release = resolve; });
    await previous;
    const working = new Map([...this.docs].map(([key, value]) => [key, structuredClone(value)]));
    const tx = {
      get: async (ref: Ref) => new Snap(working.get(ref.path)),
      create: (ref: Ref, value: any) => {
        if (working.has(ref.path)) throw new Error("EXISTS");
        working.set(ref.path, structuredClone(value));
      },
      update: (ref: Ref, value: any) => {
        if (!working.has(ref.path)) throw new Error("MISSING");
        const current = { ...working.get(ref.path) };
        for (const [key, item] of Object.entries(value)) {
          if (item === FieldValue.delete() || (item as any)?._methodName === "delete") delete current[key];
          else current[key] = structuredClone(item);
        }
        working.set(ref.path, current);
      },
    };
    try {
      const result = await callback(tx);
      this.docs = working;
      return result;
    } finally {
      release();
    }
  }
}

const ctx = { actorId: "operator_1", origen: "PLATFORM" as const };
const env = (name: string, revision: number) => ({
  commandId: `cmd_${name}`,
  idempotencyKey: `idem_${name}`,
  correlationId: `corr_${name}`,
  causationId: `cause_${name}`,
  expectedRevision: revision,
  motivo: "pago contractual autorizado",
});

test("confirma pago y vence la relacion anual sin mutar la suscripcion raiz", async () => {
  const db = new Db();
  db.seed("empresas/cafe", { empresaId: "cafe", estado: "suspendida", revision: 4 });
  const legacy = { empresaId: "cafe", planId: "mvp_comercial", planVersion: 1, estado: "suspended", revision: 2, schemaVersion: 1 };
  db.seed("suscripciones/cafe", legacy);
  db.seed("suscripciones/cafe/relaciones/_vigente", { relacionVigenteId: "rel_annual", estado: "suspended", revision: 2 });
  db.seed("suscripciones/cafe/relaciones/rel_annual", {
    schemaVersion: 1,
    relacionId: "rel_annual",
    empresaId: "cafe",
    estado: "suspended",
    planId: "mvp_comercial",
    planVersion: 2,
    snapshotContrato: {
      schemaVersion: 1,
      planId: "mvp_comercial",
      planVersion: 2,
      codigoPlan: "MVP_COMERCIAL",
      periodicidad: "ANUAL",
      precio: { importe: 1800000, moneda: "COP" },
      capacidades: ["sell", "inventory", "purchases", "clientes", "finanzas", "reservas", "waste", "shifts", "cuentas_cobro"],
      limites: {},
      sedeConceptual: { cantidad: 1 },
      fiscalidad: null,
      vigencia: { inicio: "2026-08-03", fin: "2026-09-02" },
    },
    trialInicio: "2026-08-03",
    trialFin: "2026-09-02",
    revision: 2,
  });

  const pago = await confirmarPagoAnualRelacionContractual(db as any, {
    ...env("relacion_pago", 2), empresaId: "cafe", relacionId: "rel_annual", referenciaPago: "REC-REL-001",
  }, ctx);

  assert.equal(pago.idempotente, false);
  assert.equal(db.read("suscripciones/cafe/relaciones/rel_annual").estado, "active");
  assert.equal(db.read("suscripciones/cafe").estado, "suspended");
  assert.equal(db.read(`pagos_saas/${pago.reciboId}`).relacionId, "rel_annual");
  assert.equal((await confirmarPagoAnualRelacionContractual(db as any, {
    ...env("relacion_pago", 2), empresaId: "cafe", relacionId: "rel_annual", referenciaPago: "REC-REL-001",
  }, ctx)).idempotente, true);

  const vencido = await suspenderRelacionContractualVencida(db as any, "cafe", "rel_annual", "2099-01-01");
  assert.equal(vencido.idempotente, false);
  assert.equal(db.read("suscripciones/cafe/relaciones/rel_annual").estado, "suspended");
  assert.deepEqual(db.read("suscripciones/cafe"), legacy);
});
