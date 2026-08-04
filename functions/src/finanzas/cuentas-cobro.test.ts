import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import {
  ejecutarLiquidarCuentaCobroV1,
  type ContextoFinancieroOperativo,
} from "./callables";
import { manejarAnularVentaOperativaV1 } from "./anulaciones";

type Data = Record<string, any>;

class Snapshot {
  constructor(readonly id: string, readonly ref: Ref, private readonly value: Data | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class Ref {
  constructor(readonly path: string, private readonly db: FakeFirestore) {}
  get id() { return this.path.split("/").at(-1)!; }
  async get() { return new Snapshot(this.id, this, this.db.docs.get(this.path)); }
}

class Query {
  constructor(private readonly name: string, private readonly db: FakeFirestore, private readonly filters: Array<[string, unknown]> = []) {}
  where(field: string, _operator: string, value: unknown) {
    return new Query(this.name, this.db, [...this.filters, [field, value]]);
  }
  snapshot() {
    const prefix = `${this.name}/`;
    const docs = [...this.db.docs.entries()]
      .filter(([path, data]) => path.startsWith(prefix) && this.filters.every(([field, value]) => data[field] === value))
      .map(([path, data]) => new Snapshot(path.slice(prefix.length), new Ref(path, this.db), data));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}

class Collection extends Query {
  constructor(private readonly name: string, private readonly db: FakeFirestore) { super(name, db); }
  doc(id: string) { return new Ref(`${this.name}/${id}`, this.db); }
}

class Transaction {
  private readonly creates: Array<[Ref, Data]> = [];
  private readonly updates: Array<[Ref, Data]> = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(target: Ref | Query) {
    if (target instanceof Query) return target.snapshot();
    return new Snapshot(target.id, target, this.db.docs.get(target.path));
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
  private queue: Promise<void> = Promise.resolve();
  collection(name: string) { return new Collection(name, this); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { const tx = new Transaction(this); const result = await work(tx); tx.commit(); return result; }
    finally { release(); }
  }
}

const empresaId = "tenant-cobro";
const actor: ContextoFinancieroOperativo = { empresaId, actorUid: "cajero-cobro", rol: "cajero" };
const dominio = (error: unknown, code: string) => error instanceof HttpsError && (error.details as { code?: string }).code === code;
const cuentaId = (tenant: string, clave: string) => crearIdentificadorInterno(tenant, `cuenta:${clave}`);
const movimientoId = (tenant: string, ventaId: string) => crearIdentificadorInterno(tenant, `movfin:cuenta_cobro:${ventaId}`);
const turnoLockId = (tenant: string, uid: string) => crearIdentificadorInterno(tenant, uid);
const comando = (ventaId: string, metodoPagoFinal: "efectivo" | "transferencia", suffix = "1") => ({
  commandId: `liquidar-${ventaId}-${suffix}`,
  idempotencyKey: `idem-${ventaId}-${suffix}`,
  correlationId: `corr-${ventaId}-${suffix}`,
  causationId: `venta:${ventaId}`,
  motivo: "CUENTA_COBRO_LIQUIDACION",
  payload: { ventaId, metodoPagoFinal },
});
const count = (db: FakeFirestore, collection: string) => [...db.docs.keys()].filter(path => path.startsWith(`${collection}/`)).length;

function seedAuth(db: FakeFirestore, contexto: ContextoFinancieroOperativo = actor) {
  db.docs.set(`empresas/${contexto.empresaId}`, { estado: "activa", esFundacional: false });
  db.docs.set(`membresias/${contexto.empresaId}_${contexto.actorUid}`, {
    empresaId: contexto.empresaId,
    uid: contexto.actorUid,
    rol: contexto.rol,
    permisos: ["sell"],
    estado: "activa",
    activo: true,
  });
}

function seedCuenta(db: FakeFirestore, tenant: string, claveOperativa: string, saldo = 0, id = cuentaId(tenant, claveOperativa)) {
  db.docs.set(`cuentas_bancarias/${id}`, { id, empresaId: tenant, claveOperativa, saldo, nombre: claveOperativa, estado: "activa" });
  return id;
}

function seedVenta(db: FakeFirestore, ventaId: string, overrides: Data = {}) {
  const venta = {
    empresaId,
    estado: "pendiente",
    estadoOperativo: "COMPLETO",
    modoOperacion: "DEMO",
    metodoPago: "cuenta_cobro",
    clienteId: "cliente-1",
    clienteNombre: "Cliente demo",
    vendedorId: actor.actorUid,
    espacioId: "cafeteria",
    turnoId: "turno-origen",
    items: [{ id: "producto-1", nombre: "Café demo", cantidad: 2, precioUnitario: 50, subtotal: 100 }],
    totales: { subtotal: 100, iva: 0, impoconsumo: 0, total: 100 },
    ...overrides,
  };
  db.docs.set(`ventas/${ventaId}`, venta);
  return venta;
}

function seedTurnoActivo(db: FakeFirestore, contexto: ContextoFinancieroOperativo = actor) {
  db.docs.set(`turnos/turno-recaudo`, { empresaId: contexto.empresaId, cajeroId: contexto.actorUid, estado: "abierto" });
  db.docs.set(`turnos_activos/${turnoLockId(contexto.empresaId, contexto.actorUid)}`, {
    empresaId: contexto.empresaId,
    cajeroId: contexto.actorUid,
    turnoId: "turno-recaudo",
  });
}

async function liquidar(db: FakeFirestore, contexto: ContextoFinancieroOperativo, data: Data) {
  seedAuth(db, contexto);
  return ejecutarLiquidarCuentaCobroV1(db, contexto, data);
}

test("P0-04: liquida una venta DEMO sin alterar su contenido comercial ni crear evidencia fiscal", async () => {
  const db = new FakeFirestore();
  seedAuth(db);
  seedCuenta(db, empresaId, "bancolombia");
  const original = seedVenta(db, "venta-demo");
  const result = await liquidar(db, actor, comando("venta-demo", "transferencia"));
  const after = db.docs.get("ventas/venta-demo")!;

  assert.equal(result.movimientoId, movimientoId(empresaId, "venta-demo"));
  assert.equal(after.estado, "pagada");
  assert.equal(after.metodoPago, "cuenta_cobro");
  assert.equal(after.metodoPagoFinal, "transferencia");
  assert.deepEqual(after.items, original.items);
  assert.deepEqual(after.totales, original.totales);
  for (const field of ["clienteId", "clienteNombre", "vendedorId", "espacioId", "turnoId", "modoOperacion"]) assert.equal(after[field], original[field]);
  assert.equal(after.snapshotFiscal, undefined);
  assert.equal(after.cufe, undefined);
  assert.equal(after.numero, undefined);
  assert.equal(db.docs.get(`cuentas_bancarias/${cuentaId(empresaId, "bancolombia")}`)?.saldo, 100);
  assert.equal(db.docs.get(`transacciones_financieras/${result.movimientoId}`)?.categoria, "cuentas_cobro");
  assert.equal(count(db, "operaciones_comandos"), 1);
  assert.equal(count(db, "operaciones_auditoria"), 1);
  assert.equal(count(db, "fiscal_comandos"), 0);
  assert.equal(count(db, "asignaciones_numeracion"), 0);
});

test("P0-04: liquidar una venta FISCAL conserva snapshot, consecutivo y CUFE", async () => {
  const db = new FakeFirestore();
  seedAuth(db);
  seedCuenta(db, empresaId, "bancolombia");
  seedVenta(db, "venta-fiscal", {
    modoOperacion: "FISCAL",
    snapshotFiscal: { numero: "POS-42", impuestos: [{ tipo: "IVA", tarifa: 0 }] },
    numero: "POS-42",
    cufe: "cufe-de-prueba",
  });
  const original = structuredClone(db.docs.get("ventas/venta-fiscal"));
  await liquidar(db, actor, comando("venta-fiscal", "transferencia"));
  const after = db.docs.get("ventas/venta-fiscal")!;

  assert.deepEqual(after.snapshotFiscal, original?.snapshotFiscal);
  assert.equal(after.numero, original?.numero);
  assert.equal(after.cufe, original?.cufe);
  assert.equal(after.modoOperacion, "FISCAL");
  assert.equal(count(db, "fiscal_comandos"), 0);
});

test("P0-04: las mismas claves lógicas permanecen aisladas por tenant", async () => {
  const db = new FakeFirestore();
  const tenantB: ContextoFinancieroOperativo = { empresaId: "tenant-cobro-b", actorUid: "cajero-cobro-b", rol: "cajero" };
  seedAuth(db);
  seedAuth(db, tenantB);
  seedCuenta(db, empresaId, "bancolombia");
  seedCuenta(db, tenantB.empresaId, "bancolombia");
  seedVenta(db, "venta-tenant-a");
  seedVenta(db, "venta-tenant-b", { empresaId: tenantB.empresaId });
  await liquidar(db, actor, comando("venta-tenant-a", "transferencia"));

  assert.equal(db.docs.get("ventas/venta-tenant-a")?.estado, "pagada");
  assert.equal(db.docs.get("ventas/venta-tenant-b")?.estado, "pendiente");
  assert.equal(db.docs.get(`cuentas_bancarias/${cuentaId(empresaId, "bancolombia")}`)?.saldo, 100);
  assert.equal(db.docs.get(`cuentas_bancarias/${cuentaId(tenantB.empresaId, "bancolombia")}`)?.saldo, 0);
});

test("P0-04: efectivo deriva el turno activo en servidor y el replay no duplica el ingreso", async () => {
  const db = new FakeFirestore();
  seedAuth(db);
  seedCuenta(db, empresaId, "caja-principal");
  seedTurnoActivo(db);
  seedVenta(db, "venta-efectivo");
  const data = comando("venta-efectivo", "efectivo");
  const first = await liquidar(db, actor, data);
  const second = await liquidar(db, actor, data);

  assert.deepEqual(second, first);
  assert.equal(first.turnoRecaudoId, "turno-recaudo");
  assert.equal(db.docs.get(`cuentas_bancarias/${cuentaId(empresaId, "caja-principal")}`)?.saldo, 100);
  assert.equal(count(db, "transacciones_financieras"), 1);
  assert.equal(count(db, "operaciones_comandos"), 1);
});

test("P0-04: no acepta importe, turno ni ID físico del cliente y aborta sin mutación", async () => {
  const db = new FakeFirestore();
  seedAuth(db);
  seedCuenta(db, empresaId, "bancolombia");
  seedVenta(db, "venta-tamper");
  const before = structuredClone([...db.docs]);
  await assert.rejects(liquidar(db, actor, {
    ...comando("venta-tamper", "transferencia"),
    payload: { ventaId: "venta-tamper", metodoPagoFinal: "transferencia", monto: 1, cuentaId: "banco-fisico", turnoId: "turno-impuesto" },
  }), error => dominio(error, "PAYLOAD_INVALID"));
  assert.deepEqual([...db.docs], before);
});

test("P0-04: revalida la capacidad sell dentro de la transacción", async () => {
  const db = new FakeFirestore();
  seedAuth(db);
  db.docs.set(`membresias/${empresaId}_${actor.actorUid}`, {
    empresaId,
    uid: actor.actorUid,
    rol: actor.rol,
    permisos: [],
    estado: "activa",
    activo: true,
  });
  seedCuenta(db, empresaId, "bancolombia");
  seedVenta(db, "venta-sin-permiso");
  const before = structuredClone([...db.docs]);
  await assert.rejects(ejecutarLiquidarCuentaCobroV1(db, actor, comando("venta-sin-permiso", "transferencia")), error => dominio(error, "ROLE_FORBIDDEN"));
  assert.deepEqual([...db.docs], before);
});

test("P0-04: la cuenta lógica duplicada o un turno ausente no producen escrituras parciales", async () => {
  const duplicada = new FakeFirestore();
  seedAuth(duplicada);
  seedCuenta(duplicada, empresaId, "bancolombia", 10);
  seedCuenta(duplicada, empresaId, "bancolombia", 20, "cuenta-duplicada");
  seedVenta(duplicada, "venta-duplicada");
  const beforeDuplicada = structuredClone([...duplicada.docs]);
  await assert.rejects(liquidar(duplicada, actor, comando("venta-duplicada", "transferencia")), error => dominio(error, "CUENTA_INVALIDA"));
  assert.deepEqual([...duplicada.docs], beforeDuplicada);

  const sinTurno = new FakeFirestore();
  seedAuth(sinTurno);
  seedCuenta(sinTurno, empresaId, "caja-principal");
  seedVenta(sinTurno, "venta-sin-turno");
  const beforeSinTurno = structuredClone([...sinTurno.docs]);
  await assert.rejects(liquidar(sinTurno, actor, comando("venta-sin-turno", "efectivo")), error => dominio(error, "TURNO_CERRADO"));
  assert.deepEqual([...sinTurno.docs], beforeSinTurno);
});

test("P0-04: la anulación posterior usa el comando server-side y compensa la liquidación confirmada", async () => {
  const db = new FakeFirestore();
  seedAuth(db);
  seedCuenta(db, empresaId, "bancolombia");
  seedVenta(db, "venta-reversible");
  await liquidar(db, actor, comando("venta-reversible", "transferencia"));
  const resultado = await manejarAnularVentaOperativaV1(db, {
    auth: { uid: actor.actorUid, token: { empresaId, rol: actor.rol } },
    data: {
      commandId: "anular-venta-reversible",
      idempotencyKey: "idem-anular-venta-reversible",
      correlationId: "corr-anular-venta-reversible",
      causationId: "venta-reversible",
      payload: { ventaId: "venta-reversible" },
    },
  });
  const compensacion = [...db.docs.entries()].find(([path, value]) => path.startsWith("transacciones_financieras/") && value.categoria === "anulacion_venta");
  const liquidacion = [...db.docs.values()].find(value => value.categoria === "cuentas_cobro");

  assert.equal(resultado.estadoOperativo, "ANULADA_CON_EFECTOS");
  assert.equal(db.docs.get("ventas/venta-reversible")?.estadoOperativo, "ANULADA_CON_EFECTOS");
  assert.equal(db.docs.get(`cuentas_bancarias/${cuentaId(empresaId, "bancolombia")}`)?.saldo, 0);
  assert.equal(compensacion?.[1].movimientoRelacionadoId, movimientoId(empresaId, "venta-reversible"));
  assert.equal(liquidacion?.liquidacionId, crearIdentificadorInterno(empresaId, "liquidacion:cuenta_cobro:venta-reversible"));
  assert.equal(count(db, "operaciones_comandos"), 2);
  assert.equal(count(db, "operaciones_auditoria"), 2);
});
