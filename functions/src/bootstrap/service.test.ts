import assert from "node:assert/strict";
import test from "node:test";
import { FieldValue } from "firebase-admin/firestore";
import { ejecutarBootstrapEmpresarial } from "./service";
import type { EntradaBootstrapEmpresarial } from "../../../lib/bootstrap/contrato";

class Ref {
  constructor(public path: string, private db: Db) {}
  collection(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  doc(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  async get() { return new Snap(this.db.docs.get(this.path)); }
  async update(data: any) { this.db.update(this.path, data); }
  async set(data: any) { this.db.seed(this.path, data); }
}

class Snap {
  constructor(private readonly v: any) {}
  get exists() { return this.v !== undefined; }
  data() { return structuredClone(this.v); }
}

class Db {
  docs = new Map<string, any>();
  private queue = Promise.resolve();
  collection(n: string) { return new Ref(n, this); }
  seed(k: string, v: any) { this.docs.set(k, structuredClone(v)); }
  read(k: string) { return this.docs.get(k); }
  update(k: string, v: any) {
    const cur = { ...this.docs.get(k) };
    for (const [key, val] of Object.entries(v)) {
      if (val === FieldValue.delete()) {
        delete cur[key];
      } else {
        cur[key] = structuredClone(val);
      }
    }
    this.docs.set(k, cur);
  }
  async runTransaction<T>(cb: (tx: any) => Promise<T>) {
    let release!: () => void;
    const before = this.queue;
    this.queue = new Promise((r) => (release = r));
    await before;
    const w = new Map([...this.docs].map(([k, v]) => [k, structuredClone(v)]));
    const tx = {
      get: async (r: Ref) => new Snap(w.get(r.path)),
      create: (r: Ref, v: any) => {
        if (w.has(r.path)) throw new Error("EXISTS");
        w.set(r.path, structuredClone(v));
      },
      set: (r: Ref, v: any) => {
        w.set(r.path, structuredClone(v));
      },
      update: (r: Ref, v: any) => {
        if (!w.has(r.path)) throw new Error("MISSING");
        const cur = { ...w.get(r.path) };
        for (const [k, val] of Object.entries(v)) {
          if (val === FieldValue.delete()) delete cur[k];
          else cur[k] = structuredClone(val);
        }
        w.set(r.path, cur);
      },
    };
    try {
      const r = await cb(tx);
      this.docs = w;
      return r;
    } finally {
      release();
    }
  }
}

const entradaBase: EntradaBootstrapEmpresarial = {
  commandId: "cmd_boot_1",
  idempotencyKey: "idem_boot_1",
  correlationId: "corr_boot_1",
  causationId: "cause_boot_1",
  ownerUid: "owner_usr_99",
  empresaId: "empresa_test_b5",
  nombreComercial: "Café B5 Central",
  paisFiscal: "CO",
  planId: "plan_pos_pro",
  planVersion: 1,
  trialDias: 30,
};

test("B5 Bootstrap — Ejecución exitosa completa y atómica del núcleo", async () => {
  const db = new Db();
  // Sembrar versión de plan publicada
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
    codigo: "PLAN_PRO",
    capacidades: ["pos", "kds"],
    limites: {},
    periodicidad: "MENSUAL",
    grandfathered: false,
    revision: 1,
    schemaVersion: 1,
  });

  const claimsEmitidosLog: Array<{ uid: string; empresaId: string; rol: string }> = [];
  const mockEmitter = async (uid: string, empresaId: string, rol: "admin") => {
    claimsEmitidosLog.push({ uid, empresaId, rol });
  };

  const res = await ejecutarBootstrapEmpresarial(db as any, entradaBase, mockEmitter);

  assert.equal(res.estado, "COMPLETED");
  assert.equal(res.claimsEmitidos, true);
  assert.equal(res.idempotente, false);
  assert.equal(claimsEmitidosLog.length, 1);
  assert.equal(claimsEmitidosLog[0].uid, "owner_usr_99");

  // Verificar que el núcleo completo fue creado en la transacción
  const empresa = db.read("empresas/empresa_test_b5");
  assert.equal(empresa.estado, "trial");
  assert.equal(empresa.ownerUid, "owner_usr_99");

  const config = db.read("configuraciones/empresa_test_b5");
  assert.equal(config.revision, 1);
  assert.equal(config.identidadFiscal.nombreComercial, "Café B5 Central");

  const espacio = db.read("espacios/esp_empresa_test_b5_1");
  assert.equal(espacio.empresaId, "empresa_test_b5");

  const numeracion = db.read("numeraciones/empresa_test_b5_num_empresa_test_b5_1");
  assert.equal(numeracion.estado, "BORRADOR");

  const membresia = db.read("membresias/empresa_test_b5_owner_usr_99");
  assert.equal(membresia.rol, "admin");
  assert.equal(membresia.estado, "activa");

  const sub = db.read("suscripciones/empresa_test_b5");
  assert.equal(sub.estado, "trialing");
  assert.equal(sub.planId, "plan_pos_pro");
});

test("B5 Bootstrap — Rechazo si la versión del Plan no está PUBLICADA", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "BORRADOR",
  });

  await assert.rejects(
    ejecutarBootstrapEmpresarial(db as any, entradaBase, async () => {}),
    /PLAN_NOT_PUBLISHED/
  );
});

test("B5 Bootstrap — Fallo de Auth posterior al commit ejecuta Forward Recovery atómico", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
  });

  // 1. Simular error de red al emitir Custom Claims
  const failingEmitter = async () => {
    throw new Error("AUTH_NETWORK_TIMEOUT");
  };

  const res = await ejecutarBootstrapEmpresarial(db as any, entradaBase, failingEmitter);

  assert.equal(res.estado, "RETRYABLE_FAILURE");
  assert.equal(res.claimsEmitidos, false);

  // El núcleo Firestore PERMANECE consistente e intacto (sin rollback destructivo)
  assert.equal(db.read("empresas/empresa_test_b5").estado, "trial");
  assert.equal(db.read("suscripciones/empresa_test_b5").estado, "trialing");

  // 2. Reintento transparente con emisor funcional reanuda y completa la emisión de claims
  let claimsExitosos = false;
  const workingEmitter = async () => {
    claimsExitosos = true;
  };

  const res2 = await ejecutarBootstrapEmpresarial(db as any, entradaBase, workingEmitter);

  assert.equal(res2.estado, "COMPLETED");
  assert.equal(res2.claimsEmitidos, true);
  assert.equal(res2.idempotente, true);
  assert.equal(claimsExitosos, true);
});

test("B5 Bootstrap — Conflicto de idempotencia si se reutiliza idempotencyKey con fingerprint distinto", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
  });

  await ejecutarBootstrapEmpresarial(db as any, entradaBase, async () => {});

  // Intentar reutilizar la misma clave de idempotencia pero modificando el nombre comercial
  const entradaIncompatible: EntradaBootstrapEmpresarial = {
    ...entradaBase,
    nombreComercial: "Otro Nombre Incompatible",
  };

  await assert.rejects(
    ejecutarBootstrapEmpresarial(db as any, entradaIncompatible, async () => {}),
    /IDEMPOTENCY_CONFLICT/
  );
});
