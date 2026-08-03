import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import {
  ejecutarRegistrarEgresoOperativoV1,
  ejecutarRegistrarMovimientoFinancieroV1,
  ejecutarTrasladarEntreCuentasV1,
  type ContextoFinancieroOperativo,
} from "./callables";

type Data = Record<string, any>;

class Snapshot {
  constructor(readonly id: string, private readonly value: Data | undefined, readonly ref: Ref) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class QuerySnapshot {
  constructor(readonly docs: Snapshot[]) {}
  get size() { return this.docs.length; }
}

class Ref {
  constructor(readonly path: string, private readonly db: FakeFirestore) {}
  get id() { return this.path.split("/").at(-1)!; }
}

class Query {
  private readonly filters: Array<[string, unknown]>;
  constructor(private readonly collection: string, private readonly db: FakeFirestore, filters: Array<[string, unknown]> = []) {
    this.filters = filters;
  }
  where(field: string, _operator: string, value: unknown) {
    return new Query(this.collection, this.db, [...this.filters, [field, value]]);
  }
  snapshot() {
    const docs = [...this.db.docs.entries()]
      .filter(([path]) => path.startsWith(`${this.collection}/`))
      .filter(([, data]) => this.filters.every(([field, value]) => data[field] === value))
      .map(([path, data]) => new Snapshot(path.split("/").at(-1)!, data, new Ref(path, this.db)));
    return new QuerySnapshot(docs);
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
  async get(target: Ref | Query): Promise<Snapshot | QuerySnapshot> {
    if (target instanceof Query) return target.snapshot();
    return new Snapshot(target.id, this.db.docs.get(target.path), target);
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
    for (const [ref, data] of this.creates) this.db.docs.set(ref.path, structuredClone(data));
    for (const [ref, data] of this.updates) this.db.docs.set(ref.path, { ...this.db.docs.get(ref.path), ...structuredClone(data) });
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

const contexto = (empresaId: string, actorUid = "admin") : ContextoFinancieroOperativo => ({ empresaId, actorUid: `${actorUid}-${empresaId}`, rol: "admin" });
const comando = (commandId: string, payload: Data) => ({
  commandId,
  idempotencyKey: `idem-${commandId}`,
  correlationId: `corr-${commandId}`,
  causationId: null,
  motivo: "prueba financiera",
  payload,
});
const dominio = (error: unknown, code: string) => error instanceof HttpsError && (error.details as { code?: string }).code === code;

function seedEmpresa(db: FakeFirestore, empresaId: string, esFundacional: boolean) {
  db.docs.set(`empresas/${empresaId}`, { estado: "activa", esFundacional });
}

function seedCuenta(db: FakeFirestore, empresaId: string, claveOperativa: string, saldo = 0, id = crearIdentificadorInterno(empresaId, `cuenta:${claveOperativa}`)) {
  db.docs.set(`cuentas_bancarias/${id}`, { id, empresaId, claveOperativa, saldo, nombre: claveOperativa, tipo: "banco" });
  return id;
}

test("P0-05: la misma clave reservada se aísla por tenant y conserva su ID físico", async () => {
  const db = new FakeFirestore();
  seedEmpresa(db, "tenant-a", false);
  seedEmpresa(db, "tenant-b", false);
  db.docs.set("turnos/turno-tenant-a", { empresaId: "tenant-a", estado: "abierto" });
  db.docs.set("turnos/turno-tenant-b", { empresaId: "tenant-b", estado: "abierto" });
  const cuentaA = seedCuenta(db, "tenant-a", "caja-principal", 10_000);
  const cuentaB = seedCuenta(db, "tenant-b", "caja-principal", 20_000);

  const resultadoA = await ejecutarRegistrarMovimientoFinancieroV1(db, contexto("tenant-a"), comando("mov-a", {
    cuentaClaveOperativa: "caja-principal", monto: 1_000, tipo: "ingreso", categoria: "prueba", turnoId: "turno-tenant-a",
  }));
  const resultadoB = await ejecutarRegistrarMovimientoFinancieroV1(db, contexto("tenant-b"), comando("mov-b", {
    cuentaClaveOperativa: "caja-principal", monto: 2_000, tipo: "ingreso", categoria: "prueba", turnoId: "turno-tenant-b",
  }));

  assert.equal(db.docs.get(`cuentas_bancarias/${cuentaA}`)?.saldo, 11_000);
  assert.equal(db.docs.get(`cuentas_bancarias/${cuentaB}`)?.saldo, 22_000);
  assert.equal(db.docs.get(`transacciones_financieras/${resultadoA.movimientoId}`)?.cuentaDocumentoId, cuentaA);
  assert.equal(db.docs.get(`transacciones_financieras/${resultadoB.movimientoId}`)?.cuentaDocumentoId, cuentaB);
});

test("P0-05: una cuenta definida por tenant no puede reutilizar una clave reservada", async () => {
  const db = new FakeFirestore();
  const empresaId = "tenant-reservado";
  seedEmpresa(db, empresaId, false);
  db.docs.set("turnos/turno-reservado", { empresaId, estado: "abierto" });
  const canonica = seedCuenta(db, empresaId, "caja-principal", 0);
  const impostora = seedCuenta(db, empresaId, "caja-principal", 99_000, "cuenta-definida-por-tenant");

  const resultado = await ejecutarRegistrarMovimientoFinancieroV1(db, contexto(empresaId), comando("mov-reservada", {
    cuentaClaveOperativa: "caja-principal", monto: 500, tipo: "ingreso", categoria: "prueba", turnoId: "turno-reservado",
  }));

  assert.equal(db.docs.get(`cuentas_bancarias/${canonica}`)?.saldo, 500);
  assert.equal(db.docs.get(`cuentas_bancarias/${impostora}`)?.saldo, 99_000);
  assert.equal(db.docs.get(`transacciones_financieras/${resultado.movimientoId}`)?.cuentaDocumentoId, canonica);
});

test("P0-05: una clave no reservada exige una única cuenta del tenant", async () => {
  const db = new FakeFirestore();
  const empresaId = "tenant-duplicado";
  seedEmpresa(db, empresaId, false);
  seedCuenta(db, empresaId, "banco-operativo", 5_000, "banco-1");
  seedCuenta(db, empresaId, "banco-operativo", 7_000, "banco-2");
  const antes = structuredClone([...db.docs]);

  await assert.rejects(
    ejecutarRegistrarMovimientoFinancieroV1(db, contexto(empresaId), comando("mov-duplicado", {
      cuentaClaveOperativa: "banco-operativo", monto: 100, tipo: "ingreso", categoria: "prueba", turnoId: null,
    })),
    error => dominio(error, "CUENTA_INVALIDA"),
  );
  assert.deepEqual([...db.docs], antes);
});

test("P0-05: un ID físico legado se rechaza sin escritura, incluso si se acompaña de una clave", async () => {
  const db = new FakeFirestore();
  const empresaId = "tenant-contrato";
  seedEmpresa(db, empresaId, false);
  seedCuenta(db, empresaId, "banco-operativo", 1_000);
  const antes = structuredClone([...db.docs]);

  await assert.rejects(
    ejecutarRegistrarMovimientoFinancieroV1(db, contexto(empresaId), comando("mov-fisico", {
      cuentaId: "caja-principal", cuentaClaveOperativa: "banco-operativo", monto: 100, tipo: "ingreso", categoria: "prueba", turnoId: null,
    })),
    error => dominio(error, "CUENTA_CLAVE_REQUERIDA"),
  );
  assert.deepEqual([...db.docs], antes);
});

test("P0-05: movimiento, egreso y traslado comparten resolución lógica y transacción", async () => {
  const db = new FakeFirestore();
  const empresaId = "tenant-comandos";
  seedEmpresa(db, empresaId, false);
  const caja = seedCuenta(db, empresaId, "caja-principal", 10_000);
  const banco = seedCuenta(db, empresaId, "banco-operativo", 1_000);
  db.docs.set("turnos/turno-abierto", { empresaId, estado: "abierto" });

  await ejecutarRegistrarEgresoOperativoV1(db, contexto(empresaId), comando("egreso-1", {
    cuentaClaveOperativa: "caja-principal", turnoId: "turno-abierto", monto: 2_000,
  }));
  await ejecutarTrasladarEntreCuentasV1(db, contexto(empresaId), comando("traslado-1", {
    cuentaOrigenClaveOperativa: "caja-principal", cuentaDestinoClaveOperativa: "banco-operativo", monto: 3_000, turnoId: null,
  }));

  assert.equal(db.docs.get(`cuentas_bancarias/${caja}`)?.saldo, 5_000);
  assert.equal(db.docs.get(`cuentas_bancarias/${banco}`)?.saldo, 4_000);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("egresos/")).length, 1);
});

test("P0-05: replay devuelve el mismo resultado y no duplica movimiento", async () => {
  const db = new FakeFirestore();
  const empresaId = "tenant-replay";
  seedEmpresa(db, empresaId, false);
  const cuenta = seedCuenta(db, empresaId, "banco-operativo", 0);
  const data = comando("mov-replay", { cuentaClaveOperativa: "banco-operativo", monto: 500, tipo: "ingreso", categoria: "prueba", turnoId: null });

  const primero = await ejecutarRegistrarMovimientoFinancieroV1(db, contexto(empresaId), data);
  const segundo = await ejecutarRegistrarMovimientoFinancieroV1(db, contexto(empresaId), data);

  assert.deepEqual(segundo, primero);
  assert.equal(db.docs.get(`cuentas_bancarias/${cuenta}`)?.saldo, 500);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("transacciones_financieras/")).length, 1);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("operaciones_comandos/")).length, 1);
});
