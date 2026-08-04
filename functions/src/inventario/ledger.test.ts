import assert from "node:assert/strict";
import test from "node:test";
import { aplicarMovimientosInventarioEnTransaccion, type MovimientoInventarioParams } from "./ledger";

type Data = Record<string, any>;

class Snapshot {
  constructor(private readonly value: Data | undefined) {}
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
  async get(ref: Ref) { return new Snapshot(this.db.docs.get(ref.path)); }
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

const base = (overrides: Partial<MovimientoInventarioParams> = {}): MovimientoInventarioParams => ({
  empresaId: "empresa-a",
  articuloTipo: "insumo",
  articuloId: "cafe",
  articuloNombre: "Café",
  unidad: "g",
  tipo: "ajuste_positivo",
  cantidad: 3,
  costoUnitario: 2,
  espacioId: "cafeteria",
  usuarioId: "admin-a",
  usuarioNombre: "Administradora",
  claveIdempotencia: "ajuste:uno:insumo:cafe:0",
  referenciaColeccion: "insumos",
  referenciaId: "insumo-cafe",
  ...overrides,
});

function seed(db: FakeFirestore) {
  db.docs.set("insumos/cafe", {
    empresaId: "empresa-a",
    espacioId: "cafeteria",
    nombre: "Café",
    unidadMedida: "g",
    stock: 5,
    secuenciaLedger: 0,
    costo: 2,
  });
}

test("P1-01: ajustes y mermas comparten el contrato canónico del kardex", async () => {
  const db = new FakeFirestore();
  seed(db);

  await db.runTransaction(tx => aplicarMovimientosInventarioEnTransaccion(tx, db, [base()]));
  await db.runTransaction(tx => aplicarMovimientosInventarioEnTransaccion(tx, db, [base({
    tipo: "merma",
    cantidad: -2,
    claveIdempotencia: "merma:dos:insumo:cafe:0",
    referenciaColeccion: "mermas",
    referenciaId: "merma-dos",
    motivo: "caducidad",
  })]));

  const apertura = db.docs.get("movimientos_inventario/inventario_inicial:insumo:cafe");
  const ajuste = db.docs.get("movimientos_inventario/ajuste:uno:insumo:cafe:0");
  const merma = db.docs.get("movimientos_inventario/merma:dos:insumo:cafe:0");
  assert.equal(apertura?.tipo, "inventario_inicial");
  assert.equal(apertura?.secuenciaArticulo, 1);
  assert.equal(ajuste?.clase, "entrada");
  assert.equal(ajuste?.signo, 1);
  assert.equal(ajuste?.secuenciaArticulo, 2);
  assert.equal(ajuste?.saldoCantidadDespues, 8);
  assert.equal(merma?.clase, "salida");
  assert.equal(merma?.signo, -1);
  assert.equal(merma?.secuenciaArticulo, 3);
  assert.equal(merma?.cantidad, -2);
  assert.equal(merma?.costoTotal, 4);
  assert.equal(merma?.saldoCantidadDespues, 6);
  assert.equal(db.docs.get("insumos/cafe")?.stock, 6);
  assert.equal(db.docs.get("insumos/cafe")?.secuenciaLedger, 3);
});

test("P1-01: replay de un movimiento no duplica saldo ni secuencia", async () => {
  const db = new FakeFirestore();
  seed(db);
  const params = base();

  const first = await db.runTransaction(tx => aplicarMovimientosInventarioEnTransaccion(tx, db, [params]));
  const second = await db.runTransaction(tx => aplicarMovimientosInventarioEnTransaccion(tx, db, [params]));

  assert.equal(second[0]?.id, first[0]?.id);
  assert.equal(second[0]?.secuenciaArticulo, first[0]?.secuenciaArticulo);
  assert.equal(second[0]?.saldoCantidadDespues, first[0]?.saldoCantidadDespues);
  assert.equal(db.docs.get("insumos/cafe")?.stock, 8);
  assert.equal(db.docs.get("insumos/cafe")?.secuenciaLedger, 2);
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("movimientos_inventario/")).length, 2);
});

test("P1-01: un artículo ajeno aborta el lote sin escritura parcial", async () => {
  const db = new FakeFirestore();
  seed(db);
  db.docs.set("productos/ajeno", { empresaId: "empresa-b", espacioId: "cafeteria", stock: 1, secuenciaLedger: 0, costo: 1 });
  const before = structuredClone([...db.docs.entries()]);

  await assert.rejects(
    db.runTransaction(tx => aplicarMovimientosInventarioEnTransaccion(tx, db, [
      base(),
      base({
        articuloTipo: "producto",
        articuloId: "ajeno",
        articuloNombre: "Ajeno",
        unidad: "und",
        tipo: "ajuste_positivo",
        cantidad: 1,
        claveIdempotencia: "ajuste:ajeno:producto:ajeno:0",
      }),
    ])),
    error => error instanceof Error && error.message === "ARTICULO_NO_ENCONTRADO",
  );
  assert.deepEqual([...db.docs.entries()], before);
});
