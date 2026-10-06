import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import {
  ejecutarCancelarSolicitudVentaBodegaV1,
  ejecutarCrearSolicitudVentaBodegaV1,
  ejecutarConsultarSolicitudesVentaBodegaV1,
  ejecutarResolverSolicitudVentaBodegaV1,
} from "./solicitudes-venta";
import type { ContextoFinancieroOperativo } from "../bodega/operational-core";

type Data = Record<string, any>;

class Ref {
  constructor(readonly path: string) {}
  get id() { return this.path.split("/").at(-1)!; }
  collection(name: string) { return new Collection(`${this.path}/${name}`); }
}
class Snap {
  constructor(readonly ref: Ref, private readonly value: Data | undefined) {}
  get id() { return this.ref.id; }
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}
class Query {
  private maximum = Number.POSITIVE_INFINITY;
  constructor(private readonly db: FakeDb, private readonly path: string, private readonly filters: Array<[string, string, unknown]> = []) {}
  where(field: string, operator: string, value: unknown) { return new Query(this.db, this.path, [...this.filters, [field, operator, value]]); }
  limit(value: number) { const query = new Query(this.db, this.path, this.filters); query.maximum = value; return query; }
  async get() {
    const docs = [...this.db.docs.entries()]
      .filter(([path, data]) => path.startsWith(`${this.path}/`) && path.slice(this.path.length + 1).split("/").length === 1
        && this.filters.every(([field, operator, value]) => operator === "==" ? data[field] === value : operator === "in" && Array.isArray(value) && value.includes(data[field])))
      .slice(0, this.maximum)
      .map(([path, data]) => new Snap(new Ref(path), data));
    return { docs, size: docs.length };
  }
}
class Collection {
  constructor(private readonly path: string) {}
  doc(id: string) { return new Ref(`${this.path}/${id}`); }
  where(field: string, operator: string, value: unknown) { return new Query(fakeDb!, this.path, [[field, operator, value]]); }
  limit(value: number) { return new Query(fakeDb!, this.path).limit(value); }
}
let fakeDb: FakeDb | null = null;
class Tx {
  readonly creates: Array<[Ref, Data]> = [];
  readonly updates: Array<[Ref, Data]> = [];
  constructor(private readonly db: FakeDb) {}
  async get(ref: Ref | Query): Promise<any> { return ref instanceof Query ? ref.get() : new Snap(ref, this.db.docs.get(ref.path)); }
  create(ref: Ref, data: Data) {
    if (this.db.docs.has(ref.path) || this.creates.some(([existing]) => existing.path === ref.path)) throw new Error("already-exists");
    this.creates.push([ref, { ...data }]);
  }
  update(ref: Ref, data: Data) {
    if (!this.db.docs.has(ref.path)) throw new Error("not-found");
    this.updates.push([ref, { ...data }]);
  }
  commit() {
    for (const [ref, data] of this.creates) this.db.docs.set(ref.path, data);
    for (const [ref, data] of this.updates) this.db.docs.set(ref.path, { ...this.db.docs.get(ref.path), ...data });
  }
}
class FakeDb {
  docs = new Map<string, Data>();
  collection(name: string) { fakeDb = this; return new Collection(name); }
  async runTransaction<T>(work: (tx: Tx) => Promise<T>) {
    const tx = new Tx(this);
    const result = await work(tx);
    tx.commit();
    return result;
  }
}

const empresaId = "empresa-bodega";
const seller: ContextoFinancieroOperativo = { empresaId, actorUid: "vendedor-1", rol: "vendedor" };
const admin: ContextoFinancieroOperativo = { empresaId, actorUid: "admin-1", rol: "admin" };
const collectionPath = `empresas/${empresaId}/solicitudes_venta_bodega`;
const envelope = (id: string, payload: Data) => ({ commandId: id, idempotencyKey: id, correlationId: `corr-${id}`, causationId: null, payload });
const createInput = (id = "crear-1", payload: Data = { clienteId: "cliente-1", lineas: [{ productoId: "producto-1", presentacionId: "presentacion-1", cantidad: 2 }] }) => envelope(id, payload);
const domain = (error: unknown) => String((error as { details?: { code?: string } })?.details?.code ?? (error as Error).message);

function seed(db: FakeDb) {
  db.docs.set(`empresas/${empresaId}`, { estado: "activa", esFundacional: true });
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["sell", "inventory"] } });
  for (const [context, permisos] of [[seller, ["sell", "shifts"]], [admin, ["sell", "inventory", "permissions"]]] as const) {
    db.docs.set(`membresias/${empresaId}_${context.actorUid}`, { empresaId, uid: context.actorUid, rol: context.rol, permisos, estado: "activa", activo: true });
  }
  db.docs.set("clientes/cliente-1", { empresaId, nombre: "Tienda Demo", cedula: "900", activo: true });
  db.docs.set("productos/producto-1", { empresaId, nombre: "Agua Demo", unidadMedida: "unidad", espacioId: "espacio-1", activo: true, stock: 20, secuenciaLedger: 1, costo: 100 });
  db.docs.set("presentaciones_producto/presentacion-1", { empresaId, productoId: "producto-1", nombre: "Caja x 10", factorUnidadBase: 10, precioCOP: 5000, activo: true });
}

async function crear(db: FakeDb, context = seller, id = "crear-1", payload?: Data, now = 1_800_000_000_000) {
  return ejecutarCrearSolicitudVentaBodegaV1(db, context, createInput(id, payload ?? createInput().payload), () => now) as Promise<Data>;
}

test("crear solicitud resuelve cliente, presentaciones, factor, precio y total server-side sin materializar efectos de venta", async () => {
  const db = new FakeDb(); seed(db);
  const result = await crear(db);
  assert.equal(result.estado, "PENDIENTE_APROBACION");
  assert.equal(result.totalCOP, 10_000);
  assert.equal(result.lineas[0].factorUnidadBase, 10);
  assert.equal(result.lineas[0].cantidadUnidadBase, 20);
  assert.equal(result.lineas[0].precioPresentacionCOP, 5_000);
  assert.equal("costoUnidadBaseCOP" in result.lineas[0], false);
  const stored = db.docs.get(`${collectionPath}/${result.solicitudId}`)!;
  assert.equal(stored.clienteId, "cliente-1");
  assert.equal("nombre" in stored, false);
  assert.equal("cedula" in stored, false);
  assert.equal("cliente" in stored, false);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ventas/")), false);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("transacciones_financieras/")), false);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("movimientos_inventario/")), false);
  assert.equal(db.docs.get("productos/producto-1")?.stock, 20);
});

test("solicitud rechaza total o tenant aportado por cliente y no deja efectos", async () => {
  for (const payload of [
    { clienteId: "cliente-1", lineas: [{ productoId: "producto-1", presentacionId: "presentacion-1", cantidad: 1 }], totalCOP: 1 },
    { clienteId: "cliente-1", lineas: [{ productoId: "producto-1", presentacionId: "presentacion-1", cantidad: 1 }], empresaId },
  ]) {
    const db = new FakeDb(); seed(db);
    await assert.rejects(crear(db, seller, "comando-forjado", payload), error => domain(error) === "SOLICITUD_VENTA_INVALIDA");
    assert.equal([...db.docs.keys()].some(path => path.includes("solicitudes_venta_bodega/")), false);
  }
});

test("comandos de solicitud limitan los identificadores de envelope antes de persistir", async () => {
  for (const field of ["commandId", "idempotencyKey", "correlationId", "causationId"]) {
    const db = new FakeDb(); seed(db);
    const input = envelope("identificador-valido", createInput().payload) as Data;
    input[field] = "x".repeat(161);
    await assert.rejects(ejecutarCrearSolicitudVentaBodegaV1(db, seller, input), error => domain(error) === "SOLICITUD_VENTA_INVALIDA");
    assert.equal([...db.docs.keys()].some(path => path.includes("solicitudes_venta_bodega/")), false);
  }
});

test("approval admin binds immutable revision and expires exactly after 24 hours", async () => {
  const db = new FakeDb(); seed(db); const now = 1_800_000_000_000;
  const created = await crear(db, seller, "crear-aprobar", undefined, now);
  const result = await ejecutarResolverSolicitudVentaBodegaV1(db, admin, envelope("aprobar-1", { solicitudId: created.solicitudId, revision: 1, decision: "aprobar" }), () => now) as Data;
  const persisted = db.docs.get(`${collectionPath}/${created.solicitudId}`)!;
  assert.equal(result.estado, "APROBADA");
  assert.equal(persisted.aprobacion.actorUid, admin.actorUid);
  assert.equal(persisted.aprobacion.revision, 1);
  assert.equal((persisted.aprobacion.expiraEn as Timestamp).toMillis(), now + 24 * 60 * 60 * 1000);
  assert.equal(db.docs.get("productos/producto-1")?.stock, 20);
});

test("approval revalidates a generated long request ID without violating the sale command contract", async () => {
  const db = new FakeDb(); seed(db);
  const created = await crear(db, seller, `crear-${"x".repeat(70)}`);
  assert.ok(created.solicitudId.length > 160 && created.solicitudId.length <= 180);
  const result = await ejecutarResolverSolicitudVentaBodegaV1(db, admin, envelope("aprobar-larga", {
    solicitudId: created.solicitudId, revision: 1, decision: "aprobar",
  })) as Data;
  assert.equal(result.estado, "APROBADA");
});

test("vendedor no puede aprobar/rechazar; admin sin sell no puede aprobar; autor no puede autoaprobar", async () => {
  const db = new FakeDb(); seed(db); const created = await crear(db);
  const input = envelope("resolver-1", { solicitudId: created.solicitudId, revision: 1, decision: "aprobar" });
  await assert.rejects(ejecutarResolverSolicitudVentaBodegaV1(db, seller, input), error => domain(error) === "SOLICITUD_ADMIN_REQUERIDO");
  const noSell: ContextoFinancieroOperativo = { ...admin, actorUid: "admin-sin-sell" };
  db.docs.set(`membresias/${empresaId}_${noSell.actorUid}`, { empresaId, uid: noSell.actorUid, rol: "admin", permisos: ["permissions"], estado: "activa", activo: true });
  await assert.rejects(ejecutarResolverSolicitudVentaBodegaV1(db, noSell, input), error => domain(error) === "ROLE_FORBIDDEN");
  const sameUidAdmin: ContextoFinancieroOperativo = { ...admin, actorUid: seller.actorUid };
  db.docs.set(`membresias/${empresaId}_${seller.actorUid}`, { empresaId, uid: seller.actorUid, rol: "admin", permisos: ["sell"], estado: "activa", activo: true });
  await assert.rejects(ejecutarResolverSolicitudVentaBodegaV1(db, sameUidAdmin, input), error => domain(error) === "AUTOAPROBACION_NO_PERMITIDA");
});

test("precio cambiado antes de aprobación invalida la solicitud sin autorizar el precio anterior", async () => {
  const db = new FakeDb(); seed(db); const created = await crear(db);
  db.docs.set("presentaciones_producto/presentacion-1", { ...db.docs.get("presentaciones_producto/presentacion-1"), precioCOP: 5100 });
  const result = await ejecutarResolverSolicitudVentaBodegaV1(db, admin, envelope("resolver-cambio", { solicitudId: created.solicitudId, revision: 1, decision: "aprobar" })) as Data;
  assert.equal(result.estado, "INVALIDADA");
  assert.equal(db.docs.get(`${collectionPath}/${created.solicitudId}`)?.estado, "INVALIDADA");
  assert.equal(db.docs.get(`${collectionPath}/${created.solicitudId}`)?.aprobacion, undefined);
});

test("cancelación es solo propia, solo antes de ejecución y conserva el historial", async () => {
  const db = new FakeDb(); seed(db); const created = await crear(db);
  await assert.rejects(ejecutarCancelarSolicitudVentaBodegaV1(db, { ...seller, actorUid: "otro-vendedor" }, envelope("cancelar-ajena", { solicitudId: created.solicitudId, revision: 1 })), error => domain(error) === "SOLICITUD_NO_ENCONTRADA");
  const result = await ejecutarCancelarSolicitudVentaBodegaV1(db, seller, envelope("cancelar-propia", { solicitudId: created.solicitudId, revision: 1 })) as Data;
  assert.equal(result.estado, "CANCELADA");
  assert.equal(db.docs.get(`${collectionPath}/${created.solicitudId}`)?.estado, "CANCELADA");
  await assert.rejects(ejecutarCancelarSolicitudVentaBodegaV1(db, seller, envelope("cancelar-replay-distinto", { solicitudId: created.solicitudId, revision: 1 })), error => domain(error) === "SOLICITUD_NO_CANCELABLE");
});

test("consultas de vendedor y administrador no cruzan tenant y vendedor solo ve sus solicitudes sin campos de costo", async () => {
  const db = new FakeDb(); seed(db);
  const propia = await crear(db, seller, "crear-propia");
  const otra: ContextoFinancieroOperativo = { ...seller, actorUid: "vendedor-2" };
  db.docs.set(`membresias/${empresaId}_${otra.actorUid}`, { empresaId, uid: otra.actorUid, rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true });
  await crear(db, otra, "crear-otra");
  db.docs.set(`empresas/empresa-ajena/solicitudes_venta_bodega/solicitud-ajena`, { empresaId: "empresa-ajena", solicitudId: "solicitud-ajena", solicitanteUid: seller.actorUid, estado: "PENDIENTE_APROBACION", totalCOP: 1 });
  const own = await ejecutarConsultarSolicitudesVentaBodegaV1(db, seller, {}) as Data;
  assert.deepEqual(own.solicitudes.map((item: Data) => item.solicitudId), [propia.solicitudId]);
  assert.equal(own.solicitudes.some((item: Data) => "costoUnidadBaseCOP" in item.lineas[0]), false);
  const queue = await ejecutarConsultarSolicitudesVentaBodegaV1(db, admin, {}) as Data;
  assert.equal(queue.solicitudes.length, 2);
  assert.equal(queue.solicitudes[0].cliente.nombre, "Tienda Demo");
  assert.equal("cedula" in queue.solicitudes[0].cliente, false);
  assert.equal(queue.solicitudes.some((item: Data) => item.solicitudId === "solicitud-ajena"), false);
});
