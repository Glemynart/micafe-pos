import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import {
  ejecutarActualizarArticuloInventarioV1,
  ejecutarCrearArticuloInventarioV1,
  ejecutarRegistrarMermaOperativaV1,
} from "./callables";
import type { ContextoFinancieroOperativo } from "../finanzas/callables";

type Data = Record<string, any>;

class Snapshot {
  constructor(readonly id: string, private readonly value: Data | undefined, readonly ref?: Ref) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class Ref {
  constructor(readonly path: string, private readonly db: FakeFirestore) {}
  get id() { return this.path.split("/").at(-1)!; }
}

class Collection {
  constructor(private readonly name: string, private readonly db: FakeFirestore) {}
  doc(id: string) { return new Ref(`${this.name}/${id}`, this.db); }
}

class Transaction {
  private readonly creates: Array<[Ref, Data]> = [];
  private readonly updates: Array<[Ref, Data]> = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: Ref) { return new Snapshot(ref.id, this.db.docs.get(ref.path), ref); }
  create(ref: Ref, data: Data) {
    if (this.db.docs.has(ref.path) || this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("already-exists");
    this.creates.push([ref, structuredClone(data)]);
  }
  update(ref: Ref, data: Data) {
    if (!this.db.docs.has(ref.path)) throw new Error("not-found");
    this.updates.push([ref, structuredClone(data)]);
  }
  commit() {
    for (const [ref, data] of this.creates) this.db.docs.set(ref.path, data);
    for (const [ref, data] of this.updates) this.db.docs.set(ref.path, { ...this.db.docs.get(ref.path), ...data });
  }
}

class FakeFirestore {
  readonly docs = new Map<string, Data>();
  collection(name: string) { return new Collection(name, this); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const tx = new Transaction(this);
    const result = await work(tx);
    tx.commit();
    return result;
  }
}

const contexto: ContextoFinancieroOperativo = { empresaId: "empresa-a", actorUid: "admin-a", rol: "admin" };
const domain = (error: unknown, code: string) => error instanceof HttpsError && (error.details as { code?: string }).code === code;

function seedAuth(db: FakeFirestore, ctx = contexto, permisos = ["inventory", "waste"]) {
  db.docs.set(`empresas/${ctx.empresaId}`, { estado: "trial" });
  db.docs.set(`membresias/${ctx.empresaId}_${ctx.actorUid}`, {
    empresaId: ctx.empresaId, uid: ctx.actorUid, rol: ctx.rol, permisos, estado: "activa", activo: true,
  });
  db.docs.set(`usuarios/${ctx.actorUid}`, { nombre: "Administradora" });
  db.docs.set(`espacios/espacio-a`, { empresaId: ctx.empresaId, nombre: "Cafetería" });
}

const envelope = (commandId: string, payload: Data, motivo?: string) => ({
  commandId,
  idempotencyKey: `idem-${commandId}`,
  correlationId: `corr-${commandId}`,
  ...(motivo ? { motivo } : {}),
  payload,
});

test("G-SAAS-02: crear artículo con stock inicial emite catálogo y kardex atómicos", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  const result = await ejecutarCrearArticuloInventarioV1(db, contexto, envelope("crear-insumo-1", {
    articuloTipo: "insumo",
    data: { nombre: "Café", unidadMedida: "g", costo: 2, stock: 10, stockMinimo: 5, espacioId: "espacio-a", activo: true },
  }));

  const insumo = db.docs.get(`insumos/${result.articuloId}`);
  assert.equal(insumo?.empresaId, "empresa-a");
  assert.equal(insumo?.stock, 10);
  assert.equal(insumo?.secuenciaLedger, 1);
  assert.equal(db.docs.get(`movimientos_inventario/${result.movimientoId}`)?.motivo, "inventario_inicial");
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("operaciones_comandos/")).length, 1);
});

test("G-SAAS-02: ajustar stock resuelve el delta server-side y replay no duplica", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("productos/producto-1", { empresaId: "empresa-a", nombre: "Tinto", unidad: "und", costo: 0, stock: 10, secuenciaLedger: 1, espacioId: "espacio-a" });
  const data = envelope("ajuste-producto-1", { articuloTipo: "producto", articuloId: "producto-1", data: { stock: 7 } }, "conteo físico");

  const first = await ejecutarActualizarArticuloInventarioV1(db, contexto, data);
  const replay = await ejecutarActualizarArticuloInventarioV1(db, contexto, data);
  assert.deepEqual(replay, first);
  assert.equal(db.docs.get("productos/producto-1")?.stock, 7);
  assert.equal(db.docs.get("productos/producto-1")?.secuenciaLedger, 2);
  assert.equal(db.docs.get(`movimientos_inventario/${first.movimientoId}`)?.tipo, "ajuste_negativo");
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("movimientos_inventario/")).length, 1);
});

test("G-SAAS-02: merma deriva nombre, unidad, costo y actor del servidor", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("insumos/cafe", { empresaId: "empresa-a", nombre: "Café", unidadMedida: "g", costo: 3, stock: 10, secuenciaLedger: 1, espacioId: "espacio-a" });
  const result = await ejecutarRegistrarMermaOperativaV1(db, contexto, envelope("merma-1", {
    insumoId: "cafe", cantidad: 2, motivo: "expired", notas: "Lote vencido",
  }, "expired"));

  const merma = db.docs.get(`mermas/${result.mermaId}`);
  assert.equal(merma?.insumoNombre, "Café");
  assert.equal(merma?.unidadMedida, "g");
  assert.equal(merma?.costo, 6);
  assert.equal(merma?.registradoPor, "admin-a");
  assert.equal(db.docs.get("insumos/cafe")?.stock, 8);
  assert.equal(db.docs.get(`movimientos_inventario/${result.movimientoId}`)?.costoTotal, 6);
});

test("G-SAAS-02: merma no acepta autoridad calculada por cliente ni stock negativo", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("insumos/cafe", { empresaId: "empresa-a", nombre: "Café", unidadMedida: "g", costo: 3, stock: 1, secuenciaLedger: 1, espacioId: "espacio-a" });
  const before = structuredClone([...db.docs]);
  await assert.rejects(
    ejecutarRegistrarMermaOperativaV1(db, contexto, envelope("merma-invalida", {
      insumoId: "cafe", cantidad: 2, motivo: "expired", insumoNombre: "Falso", espacioId: "ajeno",
    }, "expired")),
    error => domain(error, "CAMPO_ARTICULO_NO_PERMITIDO"),
  );
  assert.deepEqual([...db.docs], before);
});

test("G-SAAS-02: tenant y capacidad se revalidan dentro de la transacción", async () => {
  const db = new FakeFirestore(); seedAuth(db);
  db.docs.set("productos/producto-1", { empresaId: "empresa-a", nombre: "Tinto", unidad: "und", costo: 0, stock: 1, secuenciaLedger: 1, espacioId: "espacio-a" });
  const sinCapacidad = { ...contexto, actorUid: "cajero-a", rol: "cajero" };
  seedAuth(db, sinCapacidad, []);
  await assert.rejects(
    ejecutarActualizarArticuloInventarioV1(db, sinCapacidad, envelope("sin-capacidad", { articuloTipo: "producto", articuloId: "producto-1", data: { stock: 2 } })),
    error => domain(error, "ROLE_FORBIDDEN"),
  );
  assert.equal(db.docs.get("productos/producto-1")?.stock, 1);
});
