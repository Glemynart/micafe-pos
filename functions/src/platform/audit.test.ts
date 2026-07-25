import assert from "node:assert/strict";
import test from "node:test";
import {
  crearObligacionAuditoria,
  emitirObligacionAuditoria,
  reconciliarObligacionesAuditoria,
} from "./audit";

type OpcionesConsulta = {
  filtro?: { campo: string; valor: unknown };
  orden?: string;
  tope?: number;
  despuesValor?: number;
};

/** Resuelve `FieldValue.increment(n)` como lo haría Firestore real; el resto de valores pasa igual. */
function resolverValor(actual: unknown, nuevo: unknown): unknown {
  if (nuevo && typeof nuevo === "object" && (nuevo as { constructor: { name: string } }).constructor?.name === "NumericIncrementTransform") {
    return (Number(actual) || 0) + (nuevo as unknown as { operand: number }).operand;
  }
  return nuevo;
}

class Ref {
  constructor(readonly path: string, private readonly db: FakeDb, private readonly opts: OpcionesConsulta = {}) {}
  doc(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  where(campo: string, _op: string, valor: unknown) { return new Ref(this.path, this.db, { ...this.opts, filtro: { campo, valor } }); }
  orderBy(campo: string) { return new Ref(this.path, this.db, { ...this.opts, orden: campo }); }
  limit(n: number) { return new Ref(this.path, this.db, { ...this.opts, tope: n }); }
  // Firestore cursa por el valor del campo de orden en el snapshot dado, no por la
  // posición actual del documento en una lista refiltrada — así una obligación que
  // cambia de estado entre páginas no rompe el avance del cursor.
  startAfter(doc: { data: () => any }) {
    const valor = this.opts.orden ? Number(doc.data()?.[this.opts.orden] ?? 0) : undefined;
    return new Ref(this.path, this.db, { ...this.opts, despuesValor: valor });
  }
  async get() {
    let entradas = [...this.db.docs.entries()].filter(([path]) => path.startsWith(`${this.path}/`));
    if (this.opts.filtro) entradas = entradas.filter(([, v]) => v[this.opts.filtro!.campo] === this.opts.filtro!.valor);
    if (this.opts.orden) {
      const campo = this.opts.orden;
      entradas = entradas.slice().sort(([, a], [, b]) => Number(a[campo] ?? 0) - Number(b[campo] ?? 0));
    }
    if (this.opts.despuesValor !== undefined && this.opts.orden) {
      const campo = this.opts.orden;
      entradas = entradas.filter(([, v]) => Number(v[campo] ?? 0) > this.opts.despuesValor!);
    }
    if (this.opts.tope != null) entradas = entradas.slice(0, this.opts.tope);
    return {
      docs: entradas.map(([path, value]) => ({ id: path.split("/").at(-1)!, data: () => value })),
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
        const actual = working.get(ref.path);
        const siguiente = { ...actual };
        for (const [k, v] of Object.entries(values)) siguiente[k] = resolverValor(actual[k], v);
        working.set(ref.path, siguiente);
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

function hechoDePrueba(id: string, evidenciaId: string) {
  return {
    schemaVersion: 1,
    evidenciaId,
    tipo: "OPERADOR_INCORPORADO",
    resultado: "CONFIRMADO",
    origen: "SISTEMA",
    actor: { tipo: "SISTEMA", uid: null },
    facultad: null,
    comando: { id, tipo: "Test" },
    agregado: { tipo: "OPERADOR", id },
    empresaObjetivoId: null,
    revision: { esperada: null, resultante: 1 },
    correlacionId: id,
    causacionId: null,
    motivo: { codigo: "TEST", resumen: null },
    soporte: null,
    ocurrioEn: "ocurrio",
  };
}

test("el reconciliador converge sobre toda la cola pese a obligaciones permanentemente fallidas y una pagina pequena", async () => {
  const db = new FakeDb();
  // oblig_1 y oblig_2 son las mas antiguas y fallan en cada intento: su evidencia ya
  // existe con contenido distinto (AUDIT_EVIDENCE_CONFLICT es permanente, no transitorio).
  for (const [id, creadaEn] of [["oblig_1", 1], ["oblig_2", 2]] as const) {
    const evidenciaId = `${id}_ev`;
    const hecho = hechoDePrueba(id, evidenciaId);
    db.docs.set(`saas_auditoria_obligaciones/${id}`, {
      schemaVersion: 1, obligacionId: id, estado: "PENDIENTE", evidenciaId,
      dedupeKey: id, evidencia: hecho, creadaEn, emitidaEn: null, intentos: 0, ultimoErrorCodigo: null,
    });
    db.docs.set(`saas_auditoria/${evidenciaId}`, {
      ...hecho, motivo: { codigo: "OTRO_HECHO_YA_REGISTRADO", resumen: null }, registradoEn: "ya-existente",
    });
  }
  // oblig_3, oblig_4 y oblig_5 son mas recientes y sanas: deben emitirse en la misma
  // reconciliacion aunque las dos primeras de la cola sigan fallando y el lote sea de 2.
  for (const [id, creadaEn] of [["oblig_3", 3], ["oblig_4", 4], ["oblig_5", 5]] as const) {
    const evidenciaId = `${id}_ev`;
    db.docs.set(`saas_auditoria_obligaciones/${id}`, {
      schemaVersion: 1, obligacionId: id, estado: "PENDIENTE", evidenciaId,
      dedupeKey: id, evidencia: hechoDePrueba(id, evidenciaId), creadaEn, emitidaEn: null, intentos: 0, ultimoErrorCodigo: null,
    });
  }

  const emitidas = await reconciliarObligacionesAuditoria(db as never, 2);

  assert.equal(emitidas, 3);
  for (const id of ["oblig_3", "oblig_4", "oblig_5"]) {
    assert.equal(db.docs.get(`saas_auditoria_obligaciones/${id}`).estado, "EMITIDA");
  }
  for (const id of ["oblig_1", "oblig_2"]) {
    const doc = db.docs.get(`saas_auditoria_obligaciones/${id}`);
    assert.equal(doc.estado, "PENDIENTE");
    assert.equal(doc.intentos, 1);
    assert.equal(doc.ultimoErrorCodigo, "AUDIT_EVIDENCE_CONFLICT");
  }
});
