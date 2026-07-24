import assert from "node:assert/strict";
import test from "node:test";
import {
  crearObligacionAuditoria,
  emitirObligacionAuditoria,
  reconciliarObligacionesAuditoria,
} from "./audit";

class Ref {
  constructor(readonly path: string, private readonly db: FakeDb) {}
  doc(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  where() { return this; }
  orderBy() { return this; }
  limit() { return this; }
  async get() {
    return {
      docs: [...this.db.docs.entries()]
        .filter(([path, value]) => path.startsWith(`${this.path}/`) && value.estado === "PENDIENTE")
        .map(([path, value]) => ({ id: path.split("/").at(-1)!, data: () => value })),
    };
  }
}

class Snap {
  constructor(private readonly value: any) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class FakeDb {
  docs = new Map<string, any>();
  collection(name: string) { return new Ref(name, this); }
  async runTransaction<T>(callback: (tx: any) => Promise<T>) {
    const working = new Map(this.docs);
    const tx = {
      get: async (ref: Ref) => new Snap(working.get(ref.path)),
      create: (ref: Ref, value: any) => {
        if (working.has(ref.path)) throw new Error("EXISTS");
        working.set(ref.path, value);
      },
      update: (ref: Ref, values: Record<string, unknown>) => {
        if (!working.has(ref.path)) throw new Error("MISSING");
        working.set(ref.path, { ...working.get(ref.path), ...values });
      },
    };
    const result = await callback(tx);
    this.docs = working;
    return result;
  }
}

test("el reconciliador emite exactamente una evidencia para una obligación pendiente", async () => {
  const db = new FakeDb();
  await db.runTransaction(async (tx) => {
    crearObligacionAuditoria(db as never, tx, {
      tipo: "OPERADOR_INCORPORADO",
      resultado: "CONFIRMADO",
      actor: { tipo: "SISTEMA", uid: null },
      facultad: null,
      comando: { id: "cmd_audit_pending", tipo: "BootstrapOperadorInicial" },
      agregado: { tipo: "OPERADOR", id: "operador_audit_pending" },
      empresaObjetivoId: null,
      revision: { esperada: null, resultante: 1 },
      correlacionId: "corr_audit_pending",
      causacionId: null,
      motivo: { codigo: "AUDIT_PENDING", resumen: null },
    });
  });

  const emitted = await reconciliarObligacionesAuditoria(db as never, 100);
  assert.equal(emitted, 1);
  assert.equal([...db.docs.keys()].filter((path) => path.startsWith("saas_auditoria/")).length, 1);
  const obligation = [...db.docs.entries()].find(([path]) => path.startsWith("saas_auditoria_obligaciones/"))?.[1];
  assert.equal(obligation.estado, "EMITIDA");
  assert.equal(await reconciliarObligacionesAuditoria(db as never, 100), 0);
  assert.equal([...db.docs.keys()].filter((path) => path.startsWith("saas_auditoria/")).length, 1);
});

test("no confirma una obligacion cuando la evidencia preexistente difiere", async () => {
  const db = new FakeDb();
  let obligacionId = "";
  let evidenciaId = "";
  await db.runTransaction(async (tx) => {
    ({ obligacionId, evidenciaId } = crearObligacionAuditoria(db as never, tx, {
      tipo: "OPERADOR_INCORPORADO",
      resultado: "CONFIRMADO",
      actor: { tipo: "SISTEMA", uid: null },
      facultad: null,
      comando: { id: "cmd_audit_conflict", tipo: "BootstrapOperadorInicial" },
      agregado: { tipo: "OPERADOR", id: "operador_audit_conflict" },
      empresaObjetivoId: null,
      revision: { esperada: null, resultante: 1 },
      correlacionId: "corr_audit_conflict",
      causacionId: null,
      motivo: { codigo: "AUDIT_EXPECTED", resumen: null },
    }));
  });

  const obligation = db.docs.get(`saas_auditoria_obligaciones/${obligacionId}`);
  db.docs.set(`saas_auditoria/${evidenciaId}`, {
    ...obligation.evidencia,
    motivo: { codigo: "AUDIT_DIFFERENT", resumen: null },
    registradoEn: "existing",
  });

  await assert.rejects(
    emitirObligacionAuditoria(db as never, obligacionId),
    /AUDIT_EVIDENCE_CONFLICT/,
  );
  assert.equal(db.docs.get(`saas_auditoria_obligaciones/${obligacionId}`).estado, "PENDIENTE");

  assert.equal(await reconciliarObligacionesAuditoria(db as never, 100), 0);
  const pendiente = db.docs.get(`saas_auditoria_obligaciones/${obligacionId}`);
  assert.equal(pendiente.estado, "PENDIENTE");
  assert.equal(pendiente.ultimoErrorCodigo, "AUDIT_EVIDENCE_CONFLICT");
});
