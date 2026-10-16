import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import {
  crearObligacionAuditoriaCorreccion,
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

test("ADR-SAAS-084: el escritor rechaza combinaciones tipo/estado incoherentes y transiciones inválidas", async () => {
  const db = new FakeDb();
  const base = {
    schemaVersion: 2 as const,
    resultado: "CONFIRMADO" as const,
    actor: { tipo: "SISTEMA" as const, uid: null },
    facultad: null,
    comando: { id: "cmd-v2", tipo: "TransicionarPausaComprasSaas" },
    agregado: { tipo: "CONTROL_RELEASE_COMPRAS" as const, id: "empresa-a" },
    empresaObjetivoId: "empresa-a",
    correlacionId: "corr-v2",
    causacionId: null,
    motivo: { codigo: "TEST", resumen: null },
  };
  const write = (tipo: any, estado: any, esperada: number, resultante: number, verificacionRelease?: unknown) => db.runTransaction(async (tx) => {
    crearObligacionAuditoria(db as never, tx, {
      ...base,
      tipo,
      revision: { esperada, resultante },
      detalle: { estado, fingerprint: "a".repeat(64), ...(verificacionRelease ? { verificacionRelease } : {}) },
    });
  });

  await assert.rejects(write("COMPRAS_PAUSADAS", "ACTIVA", 1, 2), /AUDIT_EVIDENCE_V2_DETAIL_INVALID/);
  await assert.rejects(write("COMPRAS_REANUDADAS", "PAUSADA", 1, 2, {
    functionArtifactSha: "a".repeat(64), rulesetHash: "b".repeat(64), releaseReferencia: "release-1",
  }), /AUDIT_EVIDENCE_V2_DETAIL_INVALID/);
  await assert.rejects(write("COMPRAS_CONTROL_INICIALIZADO", "ACTIVA", 1, 2), /AUDIT_EVIDENCE_V2_DETAIL_INVALID/);
  await assert.rejects(write("FUTURO", "ACTIVA", 0, 1), /AUDIT_TYPE_INVALID/);
});

test("el escritor canónico rechaza taxonomías runtime desconocidas aunque TypeScript se eluda", async () => {
  const db = new FakeDb();
  await assert.rejects(db.runTransaction(async (tx) => crearObligacionAuditoria(db as never, tx, {
    tipo: "EVENTO_NO_ENUMERADO" as never,
    resultado: "CONFIRMADO",
    actor: { tipo: "SISTEMA", uid: null },
    facultad: null,
    comando: { id: "cmd-unknown-type", tipo: "Unknown" },
    agregado: { tipo: "OPERADOR", id: "operator-a" },
    empresaObjetivoId: null,
    revision: { esperada: null, resultante: null },
    correlacionId: "corr-unknown-type",
    causacionId: null,
    motivo: { codigo: "TEST", resumen: null },
  })), /AUDIT_TYPE_INVALID/);
});

test("el escritor rechaza causacionId igual al ID de la evidencia propia", async () => {
  const db = new FakeDb();
  const evidenciaId = "b5b2a1b1-3ff9-4f84-896a-9fb0e86d0e1a";
  await assert.rejects(db.runTransaction(async (tx) => crearObligacionAuditoria(db as never, tx, {
    tipo: "OPERADOR_INCORPORADO",
    resultado: "CONFIRMADO",
    actor: { tipo: "SISTEMA", uid: null },
    facultad: null,
    comando: { id: "cmd-self-causation", tipo: "Test" },
    agregado: { tipo: "OPERADOR", id: "operator-a" },
    empresaObjetivoId: null,
    revision: { esperada: null, resultante: null },
    correlacionId: "corr-self-causation",
    causacionId: evidenciaId,
    motivo: { codigo: "TEST", resumen: null },
  }, { obligacionId: "obligation-self-causation", evidenciaId })), /AUDIT_CAUSATION_INVALID/);
});

test("ADR-SAAS-084: la corrección solo se crea al verificar transaccionalmente su evidencia fuente y no la modifica", async () => {
  const db = new FakeDb();
  const originalId = "d2b2a1b1-3ff9-4f84-896a-9fb0e86d0e1a";
  const original = {
    schemaVersion: 1,
    evidenciaId: originalId,
    tipo: "COMPRAS_REANUDADAS",
    resultado: "CONFIRMADO",
    origen: "PLATAFORMA",
    actor: { tipo: "OPERADOR", uid: "operator-a" },
    facultad: "RELEASE_COMPRAS_GOBERNAR",
    comando: { id: "command-original", tipo: "TransicionarPausaComprasSaas" },
    agregado: { tipo: "CONTROL_RELEASE_COMPRAS", id: "empresa-a" },
    empresaObjetivoId: "empresa-a",
    revision: { esperada: 0, resultante: 1 },
    correlacionId: "corr-original",
    causacionId: "causation-original",
    motivo: { codigo: "INICIALIZACION", resumen: null },
    soporte: null,
    detalle: { estado: "ACTIVA", fingerprint: "a".repeat(64) },
    ocurrioEn: Timestamp.fromMillis(1000),
    registradoEn: Timestamp.fromMillis(1000),
  };
  db.docs.set(`saas_auditoria/${originalId}`, original);
  const originalTime = original.ocurrioEn;
  let ids: { obligacionId: string; evidenciaId: string } | undefined;
  await db.runTransaction(async (tx) => {
    ids = await crearObligacionAuditoriaCorreccion(db as never, tx, {
      actor: { tipo: "SISTEMA", uid: null },
      facultad: null,
      comando: { id: "cmd-aclaracion", tipo: "AclararClasificacionAuditoriaCompras" },
      motivo: { codigo: "CORRECCION_SEMANTICA_AUDITORIA", resumen: null },
    }, originalId);
  });
  const obligacion = db.docs.get(`saas_auditoria_obligaciones/${ids!.obligacionId}`);
  assert.equal(obligacion.schemaVersion, 1);
  assert.equal(obligacion.evidencia.schemaVersion, 2);
  assert.equal(obligacion.evidencia.evidenciaId, ids!.evidenciaId);
  assert.equal(obligacion.evidencia.causacionId, original.causacionId);
  assert.equal(obligacion.evidencia.correlacionId, original.correlacionId);
  assert.equal(obligacion.evidencia.detalle.evidenciaOriginalId, originalId);
  assert.equal(obligacion.evidencia.detalle.ocurrioEnOriginal, original.ocurrioEn);
  const originalAfter = db.docs.get(`saas_auditoria/${originalId}`);
  assert.equal(originalAfter.tipo, original.tipo);
  assert.equal(originalAfter.ocurrioEn, originalTime);
  assert.deepEqual(originalAfter.detalle, original.detalle);

  await assert.rejects(db.runTransaction(async (tx) => crearObligacionAuditoriaCorreccion(db as never, tx, {
    actor: { tipo: "SISTEMA", uid: null }, facultad: null,
    comando: { id: "cmd-correction-null", tipo: "AclararClasificacionAuditoriaCompras" },
    motivo: { codigo: "CORRECCION_SEMANTICA_AUDITORIA", resumen: null },
  }, "f2b2a1b1-3ff9-4f84-896a-9fb0e86d0e1a")), /AUDIT_CORRECTION_SOURCE_NOT_FOUND/);
  const malformedSources = [
    ["null", null, {}],
    ["empty", {}, {}],
    ["wrong-type", "1000", {}],
    ["wrong-source", undefined, { tipo: "COMPRAS_PAUSADAS" }],
    ["wrong-command", undefined, { comando: { id: "other-command", tipo: "AnotherOperation" } }],
    ["wrong-revision", undefined, { revision: { esperada: 1, resultante: 2 } }],
    ["wrong-state", undefined, { detalle: { estado: "PAUSADA", fingerprint: "a".repeat(64) } }],
  ] as const;
  for (const [index, [suffix, timestamp, override]] of malformedSources.entries()) {
    const malformedId = `f${index + 3}b2a1b1-3ff9-4f84-896a-9fb0e86d0e1a`;
    db.docs.set(`saas_auditoria/${malformedId}`, {
      ...original,
      evidenciaId: malformedId,
      ocurrioEn: Timestamp.fromMillis(1000),
      ...(timestamp !== undefined ? { ocurrioEn: timestamp } : {}),
      ...override,
    });
    await assert.rejects(db.runTransaction(async (tx) => crearObligacionAuditoriaCorreccion(db as never, tx, {
      actor: { tipo: "SISTEMA", uid: null }, facultad: null,
      comando: { id: `cmd-${suffix}`, tipo: "AclararClasificacionAuditoriaCompras" },
      motivo: { codigo: "CORRECCION_SEMANTICA_AUDITORIA", resumen: null },
    }, malformedId)), /AUDIT_CORRECTION_SOURCE_(?:INVALID|TIMESTAMP_INVALID)/, suffix);
  }
  await db.runTransaction(async (tx) => {
    assert.throws(() => crearObligacionAuditoria(db as never, tx, {
      schemaVersion: 2,
      tipo: "COMPRAS_AUDITORIA_CLASIFICACION_CORREGIDA",
      resultado: "CONFIRMADO",
      actor: { tipo: "SISTEMA", uid: null }, facultad: null,
      comando: { id: "cmd-direct", tipo: "AclararClasificacionAuditoriaCompras" },
      agregado: { tipo: "CONTROL_RELEASE_COMPRAS", id: "empresa-a" }, empresaObjetivoId: "empresa-a",
      revision: { esperada: null, resultante: null }, correlacionId: "corr-original", causacionId: "causation-original",
      motivo: { codigo: "CORRECCION_SEMANTICA_AUDITORIA", resumen: null },
      detalle: {
        evidenciaOriginalId: originalId, tipoOriginal: "COMPRAS_REANUDADAS", tipoCorregido: "COMPRAS_CONTROL_INICIALIZADO",
        revisionOriginal: { esperada: 0, resultante: 1 }, estadoDestinoOriginal: "ACTIVA", ocurrioEnOriginal: null,
      },
    }), /AUDIT_CORRECTION_REQUIRES_SOURCE/);
  });
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
