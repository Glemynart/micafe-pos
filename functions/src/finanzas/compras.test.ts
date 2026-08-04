import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { ejecutarRegistrarCompraOperativaV1, type ContextoFinancieroOperativo } from "./compras";

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

class Query {
  readonly filters: Array<[string, unknown]> = [];
  constructor(readonly collectionName: string, private readonly db: FakeFirestore) {}
  where(field: string, _operator: string, value: unknown) {
    const next = new Query(this.collectionName, this.db);
    next.filters.push(...this.filters, [field, value]);
    return next;
  }
}

class Collection {
  constructor(private readonly name: string, private readonly db: FakeFirestore) {}
  doc(id: string) { return new Ref(`${this.name}/${id}`, this.db); }
  where(field: string, operator: string, value: unknown) { return new Query(this.name, this.db).where(field, operator, value); }
}

class Transaction {
  private readonly creates: Array<[Ref, Data]> = [];
  private readonly updates: Array<[Ref, Data]> = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: Ref | Query): Promise<Snapshot & { size?: number; docs?: Snapshot[] }> {
    if (ref instanceof Query) {
      const docs = [...this.db.docs.entries()]
        .filter(([path]) => path.startsWith(`${ref.collectionName}/`))
        .filter(([, value]) => ref.filters.every(([field, expected]) => value[field] === expected))
        .map(([path, value]) => {
          const documentRef = new Ref(path, this.db);
          return new Snapshot(documentRef.id, value, documentRef);
        });
      return Object.assign(new Snapshot("query", undefined), { size: docs.length, docs });
    }
    return new Snapshot(ref.id, this.db.docs.get(ref.path), ref);
  }
  create(ref: Ref, data: Data) {
    if (this.db.docs.has(ref.path) || this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("already-exists");
    this.creates.push([ref, data]);
  }
  update(ref: Ref, data: Data) {
    if (!this.db.docs.has(ref.path) && !this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("not-found");
    this.updates.push([ref, data]);
  }
  commit() {
    for (const [ref, data] of this.creates) this.db.docs.set(ref.path, data);
    for (const [ref, data] of this.updates) this.db.docs.set(ref.path, { ...this.db.docs.get(ref.path), ...data });
  }
}

class FakeFirestore {
  readonly docs = new Map<string, Data>();
  private cola: Promise<void> = Promise.resolve();
  collection(name: string) { return new Collection(name, this); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const previa = this.cola;
    let liberar!: () => void;
    this.cola = new Promise<void>(resolve => { liberar = resolve; });
    await previa;
    try {
      const tx = new Transaction(this);
      const result = await work(tx);
      tx.commit();
      return result;
    } finally {
      liberar();
    }
  }
}

const empresaId = "empresa-a";
const contexto: ContextoFinancieroOperativo = { empresaId, actorUid: "admin-a", rol: "admin" };
const envelope = (suffix: string, payload: Record<string, unknown>) => ({
  commandId: `compra:${suffix}`,
  idempotencyKey: `compra:${suffix}`,
  correlationId: `corr:${suffix}`,
  causationId: null,
  motivo: "compra_proveedor",
  payload,
});
const domain = (error: unknown, code: string) => error instanceof HttpsError && (error.details as { code?: string }).code === code;

function seed(db: FakeFirestore, saldo = 0) {
  db.docs.set(`empresas/${empresaId}`, { estado: "activa", esFundacional: true });
  db.docs.set(`membresias/${empresaId}_${contexto.actorUid}`, { empresaId, uid: contexto.actorUid, rol: contexto.rol, permisos: ["purchases"], estado: "activa", activo: true, nombre: "Administradora" });
  db.docs.set("espacios/cafeteria", { empresaId, activo: true, nombre: "Cafetería" });
  db.docs.set("productos/cafe", { empresaId, espacioId: "cafeteria", nombre: "Café catálogo", unidad: "und", stock: 2, secuenciaLedger: 0, costo: 100 });
  db.docs.set("cuentas_bancarias/caja-principal", { id: "caja-principal", empresaId, claveOperativa: "caja-principal", nombre: "Caja principal", saldo });
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    proveedor: "Proveedor histórico",
    espacioId: "cafeteria",
    fechaCompra: "2026-08-04",
    items: [{ tipo: "producto", articuloId: "cafe", cantidad: 2, costoUnitario: 300, itemNombre: "Nombre manipulado", unidadMedida: "caja" }],
    ...overrides,
  };
}

test("P0-12: confirma compra con snapshots del catálogo, inventario y costo en la misma autoridad", async () => {
  const db = new FakeFirestore(); seed(db);
  const result = await ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("snapshot", payload()));
  const compra = db.docs.get(`compras/${result.compraId}`);
  assert.equal(compra?.proveedor, "Proveedor histórico");
  assert.deepEqual(compra?.items[0], {
    articuloId: "cafe", tipo: "producto", articuloNombre: "Café catálogo", unidad: "und", cantidad: 2, costoUnitario: 300, costoTotal: 600,
    itemId: "cafe", itemNombre: "Café catálogo", unidadMedida: "und",
  });
  assert.equal(compra?.snapshotComercial.version, 1);
  assert.equal(db.docs.get("productos/cafe")?.stock, 4);
  assert.equal(db.docs.get("productos/cafe")?.costo, 300);
  assert.equal(db.docs.get(`movimientos_inventario/compra:${result.compraId}:producto:cafe:0`)?.referenciaId, result.compraId);
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("transacciones_financieras/")).length, 0);
});

test("P1-03: resuelve proveedor por empresaId + proveedorId y congela su snapshot", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set("proveedores/proveedor-a", {
    empresaId,
    nombre: "Proveedor canónico",
    nit: "900123456",
    telefono: "3000000000",
    estado: "ACTIVO",
  });

  const command = envelope("proveedor-snapshot", payload({
    proveedor: "Nombre manipulado",
    proveedorId: "proveedor-a",
  }));
  const result = await ejecutarRegistrarCompraOperativaV1(db, contexto, command);
  const replay = await ejecutarRegistrarCompraOperativaV1(db, contexto, command);
  assert.deepEqual(replay, result);
  const compra = db.docs.get(`compras/${result.compraId}`);

  assert.equal(compra?.proveedor, "Proveedor canónico");
  assert.equal(compra?.proveedorId, "proveedor-a");
  assert.deepEqual(compra?.proveedorSnapshot, {
    id: "proveedor-a",
    nombre: "Proveedor canónico",
    nit: "900123456",
    telefono: "3000000000",
    estado: "ACTIVO",
  });
  assert.equal(compra?.snapshotComercial.proveedor, "Proveedor canónico");

  db.docs.set("proveedores/proveedor-a", { empresaId, nombre: "Proveedor renombrado", estado: "ACTIVO" });
  assert.equal(db.docs.get(`compras/${result.compraId}`)?.proveedorSnapshot.nombre, "Proveedor canónico");
});

test("P1-03: rechaza proveedor inactivo o ajeno sin efectos parciales", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set("proveedores/inactivo", { empresaId, nombre: "Inactivo", estado: "INACTIVO" });
  db.docs.set("proveedores/ajeno", { empresaId: "empresa-b", nombre: "Ajeno", estado: "ACTIVO" });
  const before = [...db.docs.entries()];

  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("proveedor-inactivo", payload({ proveedorId: "inactivo" }))),
    error => domain(error, "PROVEEDOR_INACTIVO"),
  );
  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("proveedor-ajeno", payload({ proveedorId: "ajeno" }))),
    error => domain(error, "PROVEEDOR_NO_ENCONTRADO"),
  );
  assert.deepEqual([...db.docs.entries()], before);
});

test("P0-12: resuelve la cuenta reservada por clave y el replay no duplica efectos", async () => {
  const db = new FakeFirestore(); seed(db, 1000);
  const data = envelope("idempotente", { ...payload(), cuentaClaveOperativa: "caja-principal" });
  const [first, second] = await Promise.all([
    ejecutarRegistrarCompraOperativaV1(db, contexto, data),
    ejecutarRegistrarCompraOperativaV1(db, contexto, data),
  ]);
  assert.deepEqual(second, first);
  assert.equal(db.docs.get("cuentas_bancarias/caja-principal")?.saldo, 400);
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("transacciones_financieras/")).length, 1);
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("compras/")).length, 1);
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("operaciones_comandos/")).length, 1);
});

test("P0-12: una compra sin fondos revierte ledger, costo, saldo, compra y auditoría", async () => {
  const db = new FakeFirestore(); seed(db, 100);
  const before = [...db.docs.entries()];
  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("rollback", { ...payload(), cuentaClaveOperativa: "caja-principal" })),
    error => domain(error, "FONDOS_INSUFICIENTES"),
  );
  assert.deepEqual([...db.docs.entries()], before);
});

test("P0-12: rechaza artículo de otro tenant sin escribir datos", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set("productos/cafe", { empresaId: "empresa-b", espacioId: "cafeteria", nombre: "Ajeno", unidad: "und", stock: 2, secuenciaLedger: 0, costo: 100 });
  const before = [...db.docs.entries()];
  await assert.rejects(ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("aislamiento", payload())), error => domain(error, "ARTICULO_NO_ENCONTRADO"));
  assert.deepEqual([...db.docs.entries()], before);
});

test("P0-12: la misma identidad con payload distinto se rechaza como conflicto", async () => {
  const db = new FakeFirestore(); seed(db);
  const first = envelope("conflict", payload());
  await ejecutarRegistrarCompraOperativaV1(db, contexto, first);
  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, { ...first, payload: payload({ proveedor: "Otro proveedor" }) }),
    error => domain(error, "COMMAND_ID_CONFLICT"),
  );
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("compras/")).length, 1);
});

test("P0-12: no acepta IDs físicos de cuenta como autoridad", async () => {
  const db = new FakeFirestore(); seed(db);
  await assert.rejects(
    ejecutarRegistrarCompraOperativaV1(db, contexto, envelope("cuenta-fisica", payload({ cuentaId: "caja-principal" }))),
    error => domain(error, "CUENTA_CLAVE_REQUERIDA"),
  );
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("compras/")).length, 0);
});
