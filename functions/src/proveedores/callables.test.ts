import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import {
  ejecutarActualizarProveedorOperativoV1,
  ejecutarCrearProveedorOperativoV1,
  ejecutarDesactivarProveedorOperativoV1,
  type ContextoProveedor,
} from "./callables";

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
  doc(id = `generated-${this.db.nextId++}`) { return new Ref(`${this.name}/${id}`, this.db); }
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
    if (!this.db.docs.has(ref.path)) throw new Error("not-found");
    this.updates.push([ref, data]);
  }
  commit() {
    for (const [ref, data] of this.creates) this.db.docs.set(ref.path, data);
    for (const [ref, data] of this.updates) this.db.docs.set(ref.path, { ...this.db.docs.get(ref.path), ...data });
  }
}

class FakeFirestore {
  readonly docs = new Map<string, Data>();
  nextId = 1;
  collection(name: string) { return new Collection(name, this); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const tx = new Transaction(this);
    const result = await work(tx);
    tx.commit();
    return result;
  }
}

const contexto: ContextoProveedor = { empresaId: "empresa-a", actorUid: "admin-a" };
const contextoAjeno: ContextoProveedor = { empresaId: "empresa-b", actorUid: "admin-b" };
const dominio = (error: unknown, code: string) => error instanceof HttpsError && (error.details as { code?: string }).code === code;

function seedEmpresa(db: FakeFirestore, empresaId = "empresa-a") {
  db.docs.set(`empresas/${empresaId}`, { estado: "trial" });
}

test("P1-03: crea un proveedor tenant-aware en estado ACTIVO y normaliza sus datos", async () => {
  const db = new FakeFirestore();
  seedEmpresa(db);

  const result = await ejecutarCrearProveedorOperativoV1(db, contexto, {
    nombre: "  Café Central  ", nit: " 900123456 ", telefono: " 3000000000 ",
  });

  const proveedor = db.docs.get(`proveedores/${result.proveedorId}`);
  assert.equal(proveedor?.empresaId, "empresa-a");
  assert.equal(proveedor?.nombre, "Café Central");
  assert.equal(proveedor?.nit, "900123456");
  assert.equal(proveedor?.telefono, "3000000000");
  assert.equal(proveedor?.estado, "ACTIVO");
  assert.ok(proveedor?.creadoEn);
  assert.ok(proveedor?.actualizadoEn);
});

test("P1-03: no permite que el cliente fuerce tenant, estado o identidad", async () => {
  const db = new FakeFirestore();
  seedEmpresa(db);
  seedEmpresa(db, "empresa-b");

  await assert.rejects(
    ejecutarCrearProveedorOperativoV1(db, contexto, { empresaId: "empresa-b", estado: "INACTIVO", proveedorId: "ajeno", nombre: "Proveedor" }),
    error => dominio(error, "PAYLOAD_INVALID"),
  );
  assert.equal([...db.docs.keys()].filter(key => key.startsWith("proveedores/")).length, 0);
});

test("P1-03: actualizar conserva empresaId y no reactiva mediante el CRUD de edición", async () => {
  const db = new FakeFirestore();
  seedEmpresa(db);
  seedEmpresa(db, "empresa-b");
  db.docs.set("proveedores/proveedor-1", { empresaId: "empresa-a", nombre: "Anterior", estado: "INACTIVO" });

  await ejecutarActualizarProveedorOperativoV1(db, contexto, { proveedorId: "proveedor-1", nombre: "Nuevo" });
  assert.equal(db.docs.get("proveedores/proveedor-1")?.nombre, "Nuevo");
  assert.equal(db.docs.get("proveedores/proveedor-1")?.estado, "INACTIVO");

  await assert.rejects(
    ejecutarActualizarProveedorOperativoV1(db, contextoAjeno, { proveedorId: "proveedor-1", nombre: "Intruso" }),
    error => dominio(error, "PROVEEDOR_NO_ENCONTRADO"),
  );
  assert.equal(db.docs.get("proveedores/proveedor-1")?.nombre, "Nuevo");
});

test("P1-03: desactivar cambia solo el estado y las compras históricas no bloquean", async () => {
  const db = new FakeFirestore();
  seedEmpresa(db);
  db.docs.set("proveedores/proveedor-1", { empresaId: "empresa-a", nombre: "Histórico", estado: "ACTIVO" });
  db.docs.set("compras/compra-historica", { empresaId: "empresa-a", proveedorId: "proveedor-1", estado: "CONFIRMADA", total: 100 });

  const result = await ejecutarDesactivarProveedorOperativoV1(db, contexto, { proveedorId: "proveedor-1" });
  assert.equal(result.estado, "INACTIVO");
  assert.equal(db.docs.get("proveedores/proveedor-1")?.estado, "INACTIVO");
  assert.equal(db.docs.get("compras/compra-historica")?.total, 100);
});

test("P1-03: una operación abierta dependiente impide desactivar el proveedor", async () => {
  const db = new FakeFirestore();
  seedEmpresa(db);
  db.docs.set("proveedores/proveedor-1", { empresaId: "empresa-a", nombre: "Abierto", estado: "ACTIVO" });
  db.docs.set("compras/compra-abierta", { empresaId: "empresa-a", proveedorId: "proveedor-1", estado: "ABIERTA" });

  await assert.rejects(
    ejecutarDesactivarProveedorOperativoV1(db, contexto, { proveedorId: "proveedor-1" }),
    error => dominio(error, "PROVEEDOR_CON_OPERACIONES_ABIERTAS"),
  );
  assert.equal(db.docs.get("proveedores/proveedor-1")?.estado, "ACTIVO");
});

test("P1-03: un proveedor inactivo no puede volver a activarse por el comando de desactivación", async () => {
  const db = new FakeFirestore();
  seedEmpresa(db);
  db.docs.set("proveedores/proveedor-1", { empresaId: "empresa-a", nombre: "Inactivo", estado: "INACTIVO" });

  const result = await ejecutarDesactivarProveedorOperativoV1(db, contexto, { proveedorId: "proveedor-1" });
  assert.equal(result.estado, "INACTIVO");
  assert.equal(db.docs.get("proveedores/proveedor-1")?.estado, "INACTIVO");
});
