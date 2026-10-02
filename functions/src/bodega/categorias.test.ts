import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { ejecutarCrearCategoriaBodegaV1 } from "./categorias";
import type { ContextoFinancieroOperativo } from "./operational-core";

type Data = Record<string, any>;

class Snapshot {
  constructor(readonly id: string, private readonly value: Data | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class Ref {
  constructor(readonly path: string, private readonly db: FakeFirestore) {}
  get id() { return this.path.split("/").at(-1)!; }
  async get() { return new Snapshot(this.id, this.db.docs.get(this.path)); }
}

class Collection {
  constructor(private readonly db: FakeFirestore, private readonly name: string) {}
  doc(id: string) { return new Ref(`${this.name}/${id}`, this.db); }
}

class Transaction {
  private readonly creates: Array<[Ref, Data]> = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: Ref) { return new Snapshot(ref.id, this.db.docs.get(ref.path)); }
  create(ref: Ref, data: Data) {
    if (this.db.docs.has(ref.path) || this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("already-exists");
    this.creates.push([ref, data]);
  }
  update(): never { throw new Error("UPDATE_NOT_EXPECTED"); }
  commit() { for (const [ref, data] of this.creates) this.db.docs.set(ref.path, data); }
}

class FakeFirestore {
  readonly docs = new Map<string, Data>();
  collection(name: string) { return new Collection(this, name); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const tx = new Transaction(this); const result = await work(tx); tx.commit(); return result;
  }
}

const adminA: ContextoFinancieroOperativo = { empresaId: "empresa-a", actorUid: "admin-a", rol: "admin" };
const vendedorA: ContextoFinancieroOperativo = { empresaId: "empresa-a", actorUid: "vendedor-a", rol: "vendedor" };
const envelope = (commandId: string, payload: Data) => ({ commandId, idempotencyKey: `idem-${commandId}`, correlationId: `corr-${commandId}`, payload });
const domain = (error: unknown, code: string) => error instanceof HttpsError && (error.details as { code?: string }).code === code;

function seed(db: FakeFirestore, empresaId = "empresa-a") {
  db.docs.set(`empresas/${empresaId}`, { estado: "trial" });
  db.docs.set(`membresias/${empresaId}_admin-a`, { empresaId, uid: "admin-a", rol: "admin", permisos: ["inventory"], estado: "activa", activo: true });
  db.docs.set(`membresias/${empresaId}_vendedor-a`, { empresaId, uid: "vendedor-a", rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true });
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["inventory", "sell"] } });
  db.docs.set(`espacios/espacio-${empresaId}`, { empresaId, nombre: `Espacio ${empresaId}`, activo: true });
}

test("ADR-052: admin Bodega crea categoría tenant-aware con auditoría", async () => {
  const db = new FakeFirestore(); seed(db);
  const result = await ejecutarCrearCategoriaBodegaV1(db, adminA, envelope("categoria-a", { espacioId: "espacio-empresa-a", nombre: "Bebidas", icono: "cup" }));
  assert.equal(result.idempotente, false);
  const categoria = db.docs.get(`categorias/${result.categoriaId}`);
  assert.equal(categoria?.empresaId, "empresa-a");
  assert.equal(categoria?.espacioId, "espacio-empresa-a");
  assert.equal(categoria?.nombre, "Bebidas");
  assert.equal(categoria?.activo, true);
  assert.equal(categoria?.creadoPor, "admin-a");
  assert.equal([...db.docs.values()].find(value => value.commandId === "categoria-a")?.estado, "CONFIRMADO");
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("operaciones_auditoria/")).length, 1);
});

test("ADR-052: replay compatible no duplica categoría ni auditoría", async () => {
  const db = new FakeFirestore(); seed(db);
  const data = envelope("categoria-idempotente", { espacioId: "espacio-empresa-a", nombre: "Abarrotes" });
  const first = await ejecutarCrearCategoriaBodegaV1(db, adminA, data);
  const replay = await ejecutarCrearCategoriaBodegaV1(db, adminA, data);
  assert.deepEqual(replay, { ...first, idempotente: true });
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("categorias/")).length, 1);
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("operaciones_auditoria/")).length, 1);
});

test("ADR-052: la operación rechaza autoridad de cliente y espacio de otro tenant", async () => {
  const db = new FakeFirestore(); seed(db); seed(db, "empresa-b");
  const before = structuredClone([...db.docs]);
  await assert.rejects(
    ejecutarCrearCategoriaBodegaV1(db, adminA, envelope("autoridad-cliente", { espacioId: "espacio-empresa-a", nombre: "Falsa", empresaId: "empresa-b" })),
    error => domain(error, "PAYLOAD_CATEGORIA_INVALIDO"),
  );
  await assert.rejects(
    ejecutarCrearCategoriaBodegaV1(db, adminA, envelope("espacio-ajeno", { espacioId: "espacio-empresa-b", nombre: "Falsa" })),
    error => domain(error, "ESPACIO_INVALIDO"),
  );
  assert.deepEqual([...db.docs], before);
});

test("ADR-052: vendedor, vertical ajeno o inventario inhabilitado no pueden crear", async () => {
  const vendedor = new FakeFirestore(); seed(vendedor);
  await assert.rejects(
    ejecutarCrearCategoriaBodegaV1(vendedor, vendedorA, envelope("vendedor", { espacioId: "espacio-empresa-a", nombre: "Bebidas" })),
    error => domain(error, "ROL_NO_AUTORIZADO"),
  );
  const sinModulo = new FakeFirestore(); seed(sinModulo);
  sinModulo.docs.set("configuraciones/empresa-a", { empresaId: "empresa-a", vertical: "BODEGA_MVP1", modulos: { habilitados: [] } });
  await assert.rejects(
    ejecutarCrearCategoriaBodegaV1(sinModulo, adminA, envelope("sin-modulo", { espacioId: "espacio-empresa-a", nombre: "Bebidas" })),
    error => domain(error, "CATALOGO_BODEGA_NO_AUTORIZADO"),
  );
});
