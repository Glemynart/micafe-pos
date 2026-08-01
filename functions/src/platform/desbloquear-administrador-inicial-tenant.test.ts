import assert from "node:assert/strict";
import test from "node:test";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { desbloquearAdministradorInicialTenant } from "./desbloquear-administrador-inicial-tenant";

const SERVER_TIMESTAMP = FieldValue.serverTimestamp();
const EMPRESA_ID = "empresa-1";
const OWNER_UID = "owner-1";
const CODIGO = "cafeat-aaaa";
const INCORPORACION_ID = "inc-inicial";

class Ref {
  constructor(public readonly path: string) {}
  get id() { return this.path.split("/").pop()!; }
}

class Snap {
  constructor(public readonly id: string, private readonly value: any) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
  get(field: string) { return this.value?.[field]; }
}

class Query {
  readonly __isQuery = true;
  constructor(
    private readonly collectionName: string,
    private readonly docsProvider: () => Map<string, any>,
    private readonly filters: [string, unknown][] = [],
  ) {}
  where(field: string, _operator: "==", value: unknown) {
    return new Query(this.collectionName, this.docsProvider, [...this.filters, [field, value]]);
  }
  orderBy(_field: string, _direction: "asc" | "desc" = "asc") { return this; }
  limit(_count: number) { return this; }
  ejecutarContra(docs: Map<string, any>) {
    const encontrados = [...docs.entries()]
      .filter(([path]) => path.startsWith(`${this.collectionName}/`))
      .filter(([, data]) => this.filters.every(([field, value]) => data?.[field] === value))
      .map(([path, data]) => new Snap(path.split("/").pop()!, data));
    return { size: encontrados.length, docs: encontrados, empty: encontrados.length === 0 };
  }
  async get() { return this.ejecutarContra(this.docsProvider()); }
}

class FakeDb {
  docs = new Map<string, any>();
  antesDePrimeraTransaccion: (() => void) | null = null;
  antesDeLecturaTransaccional: ((refOrQuery: any, reads: number, docs: Map<string, any>) => void) | null = null;
  private firstTransaction = true;

  seed(path: string, data: any) { this.docs.set(path, data); }
  collection(name: string) {
    const docs = () => this.docs;
    const ref = (path: string) => Object.assign(new Ref(path), {
      get: async () => new Snap(path.split("/").pop()!, docs().get(path)),
    });
    return Object.assign(ref(name), {
      doc: (id: string) => ref(`${name}/${id}`),
      where: (field: string, operator: "==", value: unknown) => new Query(name, docs).where(field, operator, value),
    });
  }
  async runTransaction<T>(callback: (tx: any) => Promise<T>) {
    if (this.firstTransaction) {
      this.firstTransaction = false;
      this.antesDePrimeraTransaccion?.();
    }
    const working = new Map(this.docs);
    let reads = 0;
    const tx = {
      get: async (refOrQuery: any) => {
        reads += 1;
        this.antesDeLecturaTransaccional?.(refOrQuery, reads, working);
        if (refOrQuery.__isQuery) return refOrQuery.ejecutarContra(working);
        return new Snap(refOrQuery.id, working.get(refOrQuery.path));
      },
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

function envelope(idempotencyKey: string) {
  return {
    commandId: `cmd_${idempotencyKey}`,
    idempotencyKey,
    correlationId: `corr_${idempotencyKey}`,
    causationId: null,
    motivoCodigo: "BACKOFFICE_DESBLOQUEAR_ADMIN_INICIAL",
    empresaId: EMPRESA_ID,
  };
}

const token = { saas: { operador: true, versionAutorizacion: 1, facultades: ["LIFECYCLE_GOBERNAR"] } };

function sembrarBase(db: FakeDb, temporal = false) {
  db.seed(`empresas/${EMPRESA_ID}`, { estado: "activa", ownerUid: OWNER_UID });
  db.seed(`membresias/${EMPRESA_ID}_${OWNER_UID}`, { rol: "admin", estado: "activa", activo: true });
  db.seed("saas_operadores/operador-1", {
    uid: "operador-1", estado: "ACTIVO", facultades: ["LIFECYCLE_GOBERNAR"], versionAutorizacion: 1,
  });
  db.seed(`incorporaciones/${INCORPORACION_ID}`, {
    empresaId: EMPRESA_ID, mecanismo: "DIRECTA", uid: OWNER_UID, codigo: CODIGO,
    estado: temporal ? "TEMP_CREDENTIAL" : "ACTIVE",
    ...(temporal ? { expiraEn: { toMillis: () => Date.now() + 60_000 } } : {}),
  });
  db.seed(`credenciales_operativas/${EMPRESA_ID}_${CODIGO}`, {
    empresaId: EMPRESA_ID, uid: OWNER_UID, codigo: CODIGO, incorporacionId: INCORPORACION_ID,
    activo: true, requiereCambio: temporal, fallosConsecutivos: 5,
    bloqueadoHasta: { toMillis: () => Date.now() + 60_000 }, pinHash: "hash-intocable",
  });
}

async function ejecutar(db: FakeDb, entrada = envelope("idem-1")) {
  return desbloquearAdministradorInicialTenant(db as any, "operador-1", entrada, token);
}

function error(codigo: string, mensaje: string) {
  return (cause: unknown) => cause instanceof HttpsError && cause.code === codigo && cause.message === mensaje;
}

test("desbloquea una credencial activa bloqueada, preserva sus datos y audita el hecho", async () => {
  const db = new FakeDb();
  sembrarBase(db);

  const result = await ejecutar(db) as any;

  assert.deepEqual(result.estado, "DESBLOQUEADA");
  assert.equal(result.idempotente, false);
  const credencial = db.docs.get(`credenciales_operativas/${EMPRESA_ID}_${CODIGO}`);
  assert.equal(credencial.fallosConsecutivos, 0);
  assert.equal(credencial.bloqueadoHasta, null);
  assert.equal(credencial.pinHash, "hash-intocable");
  assert.equal(credencial.uid, OWNER_UID);
  const auditoria = [...db.docs.entries()].find(([path]) => path.startsWith("saas_auditoria/"))?.[1];
  assert.equal(auditoria.tipo, "CREDENCIAL_INICIAL_DESBLOQUEADA");
  assert.deepEqual(auditoria.detalle, { camposLimpiados: ["fallosConsecutivos", "bloqueadoHasta"], idempotente: false });
  assert.equal(JSON.stringify(auditoria).includes("hash-intocable"), false);
});

test("desbloquea una credencial temporal vigente bloqueada", async () => {
  const db = new FakeDb();
  sembrarBase(db, true);

  const result = await ejecutar(db) as any;

  assert.equal(result.estado, "DESBLOQUEADA");
  const credencial = db.docs.get(`credenciales_operativas/${EMPRESA_ID}_${CODIGO}`);
  assert.equal(credencial.fallosConsecutivos, 0);
  assert.equal(credencial.bloqueadoHasta, null);
  assert.equal(credencial.requiereCambio, true);
});

test("deniega al operador sin LIFECYCLE_GOBERNAR", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.docs.set("saas_operadores/operador-1", { uid: "operador-1", estado: "ACTIVO", facultades: ["PLATAFORMA_CONSULTAR"], versionAutorizacion: 1 });

  await assert.rejects(ejecutar(db), error("permission-denied", "PLATFORM_ACCESS_DENIED"));
  assert.equal(db.docs.get(`credenciales_operativas/${EMPRESA_ID}_${CODIGO}`).bloqueadoHasta.toMillis() > Date.now(), true);
});

test("rechaza una empresa inexistente", async () => {
  const db = new FakeDb();
  db.seed("saas_operadores/operador-1", { uid: "operador-1", estado: "ACTIVO", facultades: ["LIFECYCLE_GOBERNAR"], versionAutorizacion: 1 });

  await assert.rejects(ejecutar(db), error("not-found", "EMPRESA_NOT_FOUND"));
});

test("rechaza una empresa no administrable", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.docs.set(`empresas/${EMPRESA_ID}`, { estado: "archivada", ownerUid: OWNER_UID });

  await assert.rejects(ejecutar(db), error("failed-precondition", "EMPRESA_NO_ADMINISTRABLE"));
});

test("rechaza una empresa sin owner", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.docs.set(`empresas/${EMPRESA_ID}`, { estado: "activa" });

  await assert.rejects(ejecutar(db), error("failed-precondition", "EMPRESA_SIN_OWNER"));
});

test("rechaza cuando falta la membresía admin del owner", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.docs.delete(`membresias/${EMPRESA_ID}_${OWNER_UID}`);

  await assert.rejects(ejecutar(db), error("failed-precondition", "OWNER_SIN_MEMBRESIA_ADMIN_ACTIVA"));
});

test("rechaza cuando la membresía admin está inactiva", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.docs.set(`membresias/${EMPRESA_ID}_${OWNER_UID}`, { rol: "admin", estado: "inactiva", activo: false });

  await assert.rejects(ejecutar(db), error("failed-precondition", "OWNER_SIN_MEMBRESIA_ADMIN_ACTIVA"));
});

test("rechaza si el owner cambia entre las lecturas transaccionales", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  let empresaLeida = 0;
  db.antesDeLecturaTransaccional = (ref, _reads, docs) => {
    if (ref.path === `empresas/${EMPRESA_ID}` && ++empresaLeida === 2) {
      docs.set(ref.path, { estado: "activa", ownerUid: "owner-nuevo" });
    }
  };

  await assert.rejects(ejecutar(db), error("failed-precondition", "OWNER_SIN_MEMBRESIA_ADMIN_ACTIVA"));
});

test("rechaza si la credencial inicial no existe", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.docs.delete(`credenciales_operativas/${EMPRESA_ID}_${CODIGO}`);

  await assert.rejects(ejecutar(db), error("failed-precondition", "CREDENCIAL_INICIAL_NO_DISPONIBLE"));
});

test("rechaza una credencial inconsistente con la incorporación inicial", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.docs.set(`credenciales_operativas/${EMPRESA_ID}_${CODIGO}`, {
    ...db.docs.get(`credenciales_operativas/${EMPRESA_ID}_${CODIGO}`), incorporacionId: "otra-incorporacion",
  });

  await assert.rejects(ejecutar(db), error("failed-precondition", "CREDENCIAL_INICIAL_NO_DISPONIBLE"));
});

test("rechaza una credencial que no está bloqueada", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.docs.set(`credenciales_operativas/${EMPRESA_ID}_${CODIGO}`, {
    ...db.docs.get(`credenciales_operativas/${EMPRESA_ID}_${CODIGO}`), bloqueadoHasta: null,
  });

  await assert.rejects(ejecutar(db), error("failed-precondition", "CREDENCIAL_INICIAL_NO_BLOQUEADA"));
});

test("reintenta idempotentemente sin crear una segunda auditoría", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  const entrada = envelope("idem-reintento");

  const primero = await ejecutar(db, entrada) as any;
  const segundo = await ejecutar(db, entrada) as any;

  assert.equal(primero.idempotente, false);
  assert.equal(segundo.idempotente, true);
  assert.equal([...db.docs.keys()].filter((path) => path.startsWith("saas_auditoria/")).length, 1);
  assert.equal([...db.docs.keys()].filter((path) => path.startsWith("saas_comandos/")).length, 1);
});

test("rechaza un reuso de idempotencyKey con huella distinta", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  await ejecutar(db, envelope("idem-conflicto"));

  await assert.rejects(
    ejecutar(db, { ...envelope("idem-conflicto"), commandId: "cmd_distinto" }),
    error("already-exists", "IDEMPOTENCY_CONFLICT"),
  );
});

test("revalida LIFECYCLE_GOBERNAR dentro de la transacción", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.antesDePrimeraTransaccion = () => {
    db.docs.set("saas_operadores/operador-1", {
      uid: "operador-1", estado: "ACTIVO", facultades: ["PLATAFORMA_CONSULTAR"], versionAutorizacion: 1,
    });
  };

  await assert.rejects(ejecutar(db), error("permission-denied", "PLATFORM_ACCESS_DENIED"));
  const credencial = db.docs.get(`credenciales_operativas/${EMPRESA_ID}_${CODIGO}`);
  assert.equal(credencial.fallosConsecutivos, 5);
  assert.equal(credencial.bloqueadoHasta.toMillis() > Date.now(), true);
});
