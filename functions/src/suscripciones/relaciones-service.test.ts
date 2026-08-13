import assert from "node:assert/strict";
import test from "node:test";
import { FieldValue } from "firebase-admin/firestore";
import type { RelacionContractual } from "../../../lib/suscripciones/contrato";
import { crearRelacionContractualTrial } from "./relaciones-service";

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
const env = (name: string, revision = 1) => ({
  commandId: `cmd_${name}`,
  idempotencyKey: `idem_${name}`,
  correlationId: `corr_${name}`,
  causationId: `cause_${name}`,
  expectedRevision: revision,
  motivo: "transicion contractual autorizada",
});

function seedAnnualPlan(db: Db) {
  db.seed("planes/mvp_comercial/versiones/2", {
    planId: "mvp_comercial",
    codigo: "MVP_COMERCIAL",
    planVersion: 2,
    estado: "PUBLICADA",
    capacidades: ["sell", "inventory", "purchases", "clientes", "finanzas", "reservas", "waste", "shifts", "cuentas_cobro"],
    limites: {},
    periodicidad: "ANUAL",
    precio: { importe: 1800000, moneda: "COP" },
    grandfathered: false,
    revision: 2,
    schemaVersion: 1,
  });
}

test("crea una relación anual append-only con snapshot y control vigente", async () => {
  const db = new Db();
  seedAnnualPlan(db);
  db.seed("empresas/cafe", { empresaId: "cafe", estado: "suspendida", revision: 7 });
  const legacy = {
    empresaId: "cafe",
    planId: "mvp_comercial",
    planVersion: 1,
    estado: "suspended",
    trialInicio: "2026-08-03",
    trialFin: "2026-09-02",
    revision: 2,
    schemaVersion: 1,
  };
  db.seed("suscripciones/cafe", legacy);

  const resultado = await crearRelacionContractualTrial(db as any, {
    ...env("cafe_annual", 2),
    empresaId: "cafe",
    planId: "mvp_comercial",
    planVersion: 2,
    relacionAnteriorId: "legacy_mensual_v1",
  }, ctx);

  assert.equal(resultado.idempotente, false);
  const relacion = db.read(`suscripciones/cafe/relaciones/${resultado.relacionId}`) as RelacionContractual;
  assert.equal(relacion.estado, "trialing");
  assert.equal(relacion.origen, "transicion_contractual");
  assert.equal(relacion.relacionAnteriorId, "legacy_mensual_v1");
  assert.equal(relacion.snapshotContrato.precio.importe, 1800000);
  assert.equal(relacion.snapshotContrato.capacidades.length, 9);
  assert.equal(
    (Date.parse(`${relacion.snapshotContrato.vigencia.fin}T00:00:00Z`) - Date.parse(`${relacion.snapshotContrato.vigencia.inicio}T00:00:00Z`)) / 86_400_000,
    30,
  );
  assert.deepEqual(db.read("suscripciones/cafe"), legacy);
  assert.equal(db.read("suscripciones/cafe/relaciones/_vigente").relacionVigenteId, resultado.relacionId);

  const retry = await crearRelacionContractualTrial(db as any, {
    ...env("cafe_annual", 2),
    empresaId: "cafe",
    planId: "mvp_comercial",
    planVersion: 2,
    relacionAnteriorId: "legacy_mensual_v1",
  }, ctx);
  assert.equal(retry.idempotente, true);
  assert.equal(retry.relacionId, resultado.relacionId);
});

test("rechaza la transición mientras el Trial mensual histórico sigue vigente", async () => {
  const db = new Db();
  seedAnnualPlan(db);
  db.seed("empresas/cafe", { empresaId: "cafe", estado: "activa", revision: 1 });
  db.seed("suscripciones/cafe", {
    empresaId: "cafe",
    planId: "mvp_comercial",
    planVersion: 1,
    estado: "trialing",
    trialInicio: "2026-08-03",
    trialFin: "2026-09-02",
    revision: 1,
    schemaVersion: 1,
  });

  await assert.rejects(
    crearRelacionContractualTrial(db as any, {
      ...env("cafe_annual_active"),
      empresaId: "cafe",
      planId: "mvp_comercial",
      planVersion: 2,
      relacionAnteriorId: "legacy_mensual_v1",
    }, ctx),
    /RELACION_ANTERIOR_TRIAL_VIGENTE/,
  );
  assert.equal(db.read("suscripciones/cafe/relaciones/_vigente"), undefined);
});
