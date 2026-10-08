import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import {
  ejecutarCancelarProgramacionPedidoBodegaV1,
  ejecutarConsultarAgendaPedidosBodegaV1,
  ejecutarConvertirProgramacionPedidoBodegaV1,
  ejecutarCrearProgramacionPedidoBodegaV1,
  ejecutarResolverProgramacionPedidoBodegaV1,
} from "./agenda-pedidos";
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
      .slice(0, this.maximum).map(([path, data]) => new Snap(new Ref(path), data));
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
const NOW = Date.parse("2026-10-07T15:00:00.000Z");
const lineas = [{ productoId: "producto-1", presentacionId: "presentacion-1", cantidad: 1 }];
const envelope = (id: string, payload: Data) => ({ commandId: id, idempotencyKey: id, correlationId: `corr-${id}`, causationId: null, payload });
const createInput = (id = "agenda-crear-1", payload: Data = { clienteId: "cliente-1", fechaLocal: "2026-10-08", franja: { desde: "11:00", hasta: "13:00" }, lineas }) => envelope(id, payload);
const domain = (error: unknown) => String((error as { details?: { code?: string } })?.details?.code ?? (error as Error).message);

function seed(db: FakeDb) {
  db.docs.set(`empresas/${empresaId}`, { estado: "activa", esFundacional: true });
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", localizacion: { zonaHoraria: "America/Bogota" }, modulos: { habilitados: ["sell", "inventory"] } });
  for (const [context, permisos] of [[seller, ["sell", "shifts"]], [admin, ["sell", "inventory"]]] as const) {
    db.docs.set(`membresias/${empresaId}_${context.actorUid}`, { empresaId, uid: context.actorUid, rol: context.rol, permisos, estado: "activa", activo: true });
  }
  db.docs.set("clientes/cliente-1", { empresaId, nombre: "Tienda Demo", cedula: "900", direccion: "Carrera 1 # 2-3", activo: true });
  db.docs.set("productos/producto-1", { empresaId, nombre: "Agua Demo", unidadMedida: "unidad", espacioId: "espacio-1", activo: true, stock: 20, stockReservado: 0, secuenciaLedger: 1, costo: 100 });
  db.docs.set("presentaciones_producto/presentacion-1", { empresaId, productoId: "producto-1", nombre: "Caja x 10", factorUnidadBase: 10, precioCOP: 5_000, activo: true });
}

async function create(db: FakeDb, input = createInput()) {
  return ejecutarCrearProgramacionPedidoBodegaV1(db, seller, input, () => NOW) as Promise<Data>;
}
async function resolve(db: FakeDb, programacionId: string, decision: "aceptar" | "rechazar" = "aceptar") {
  const revision = db.docs.get(`empresas/${empresaId}/agenda_pedidos_bodega/${programacionId}`)?.revision ?? 1;
  return ejecutarResolverProgramacionPedidoBodegaV1(db, admin, envelope(`agenda-resolver-${decision}`, { programacionId, revision, decision }), () => NOW) as Promise<Data>;
}

test("ADR-064: agenda pendiente guarda solo referencias/snapshots y no toca venta ni inventario", async () => {
  const db = new FakeDb(); seed(db);
  const result = await create(db);
  const stored = db.docs.get(`empresas/${empresaId}/agenda_pedidos_bodega/${result.programacionId}`)!;
  assert.equal(result.estado, "PENDIENTE_REVISION");
  assert.equal(stored.fechaLocal, "2026-10-08");
  assert.equal(stored.franja.desde, "11:00");
  assert.equal(stored.lineas[0].cantidadUnidadBase, 10);
  assert.equal("cliente" in stored, false);
  assert.equal("precioCOP" in stored.lineas[0], false);
  assert.equal("costoUnitarioCOP" in stored.lineas[0], false);
  assert.equal(db.docs.get("productos/producto-1")?.stock, 20);
  assert.equal(db.docs.get("productos/producto-1")?.stockReservado, 0);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ventas/")), false);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("movimientos_inventario/")), false);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("transacciones_financieras/")), false);
  const event = [...db.docs.values()].find(doc => doc.tipo === "RECORDATORIO_AGENDA_PEDIDO");
  assert.equal(event?.payloadOperativo.etapa, "creada");
});

test("ADR-064: fecha pasada y franja ya vencida para hoy se rechazan", async () => {
  const db = new FakeDb(); seed(db);
  await assert.rejects(create(db, createInput("agenda-pasada", { clienteId: "cliente-1", fechaLocal: "2026-10-06", franja: null, lineas })), error => domain(error) === "AGENDA_FECHA_PASADA");
  await assert.rejects(create(db, createInput("agenda-hora-pasada", { clienteId: "cliente-1", fechaLocal: "2026-10-07", franja: { desde: "09:00", hasta: "10:00" }, lineas })), error => domain(error) === "AGENDA_FRANJA_PASADA");
  assert.equal([...db.docs.keys()].some(path => path.includes("agenda_pedidos_bodega/")), false);
});

test("ADR-064: aceptar agenda reserva unidades base sin descontar stock físico ni crear venta", async () => {
  const db = new FakeDb(); seed(db);
  const created = await create(db);
  const result = await resolve(db, created.programacionId);
  const schedule = db.docs.get(`empresas/${empresaId}/agenda_pedidos_bodega/${created.programacionId}`)!;
  assert.equal(result.estado, "RESERVADA");
  assert.equal(result.stockReservadoUnidadBase, 10);
  assert.equal((result.reservaExpiraEn as Timestamp).toMillis(), Date.parse("2026-10-09T05:00:00.000Z"));
  assert.equal(db.docs.get("productos/producto-1")?.stock, 20);
  assert.equal(db.docs.get("productos/producto-1")?.stockReservado, 10);
  assert.equal(schedule.estado, "RESERVADA");
  assert.equal(schedule.reservaIds.length, 1);
  assert.equal([...db.docs.values()].filter(doc => doc.estado === "ACTIVA" && typeof doc.cantidadUnidadBase === "number").length, 1);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ventas/")), false);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("movimientos_inventario/")), false);
});

test("ADR-064: stock insuficiente rechaza toda la reserva sin escritura parcial", async () => {
  const db = new FakeDb(); seed(db);
  db.docs.set("productos/producto-1", { ...db.docs.get("productos/producto-1"), stockReservado: 15 });
  const created = await create(db);
  await assert.rejects(resolve(db, created.programacionId), error => domain(error) === "AGENDA_STOCK_INSUFICIENTE");
  assert.equal(db.docs.get("productos/producto-1")?.stock, 20);
  assert.equal(db.docs.get("productos/producto-1")?.stockReservado, 15);
  assert.equal(db.docs.get(`empresas/${empresaId}/agenda_pedidos_bodega/${created.programacionId}`)?.estado, "PENDIENTE_REVISION");
  assert.equal([...db.docs.keys()].some(path => path.includes("reservas_stock_bodega/")), false);
});

test("ADR-064: cancelar reserva propia administrativa libera proyección, sin borrar historial", async () => {
  const db = new FakeDb(); seed(db);
  const created = await create(db);
  await resolve(db, created.programacionId);
  const scheduleRef = `empresas/${empresaId}/agenda_pedidos_bodega/${created.programacionId}`;
  const revision = db.docs.get(scheduleRef)?.revision;
  const command = envelope("agenda-cancelar-admin", { programacionId: created.programacionId, revision });
  const result = await ejecutarCancelarProgramacionPedidoBodegaV1(db, admin, command, () => NOW) as Data;
  assert.equal(result.estado, "CANCELADA");
  assert.equal(db.docs.get("productos/producto-1")?.stock, 20);
  assert.equal(db.docs.get("productos/producto-1")?.stockReservado, 0);
  const reservation = [...db.docs.values()].find(doc => doc.programacionId === created.programacionId && doc.cantidadUnidadBase === 10);
  assert.equal(reservation?.estado, "LIBERADA");
  assert.equal(db.docs.get(scheduleRef)?.estado, "CANCELADA");
});

test("ADR-064: aceptar conserva tenant y presentación vigentes", async () => {
  const db = new FakeDb(); seed(db);
  const created = await create(db);
  db.docs.set("presentaciones_producto/presentacion-1", { ...db.docs.get("presentaciones_producto/presentacion-1"), factorUnidadBase: 12 });
  await assert.rejects(resolve(db, created.programacionId), error => domain(error) === "AGENDA_PRESENTACION_NO_DISPONIBLE");
  assert.equal(db.docs.get("productos/producto-1")?.stockReservado, 0);
});

test("ADR-064: no reserva stock si el cliente se desactiva antes de la aprobación", async () => {
  const db = new FakeDb(); seed(db);
  const created = await create(db);
  db.docs.set("clientes/cliente-1", { ...db.docs.get("clientes/cliente-1"), activo: false });

  await assert.rejects(resolve(db, created.programacionId), error => domain(error) === "AGENDA_CLIENTE_NO_DISPONIBLE");

  assert.equal(db.docs.get("productos/producto-1")?.stock, 20);
  assert.equal(db.docs.get("productos/producto-1")?.stockReservado, 0);
  assert.equal(db.docs.get(`empresas/${empresaId}/agenda_pedidos_bodega/${created.programacionId}`)?.estado, "PENDIENTE_REVISION");
  assert.equal([...db.docs.keys()].some(path => path.includes("reservas_stock_bodega/")), false);
});

test("ADR-064: el vendedor convierte agenda de hoy en solicitud idempotente sin liberar stock", async () => {
  const db = new FakeDb(); seed(db);
  const created = await create(db, createInput("agenda-hoy", { clienteId: "cliente-1", fechaLocal: "2026-10-07", franja: { desde: "11:00", hasta: "12:00" }, lineas }));
  await resolve(db, created.programacionId);
  const command = envelope("agenda-convertir-hoy", { programacionId: created.programacionId });
  const result = await ejecutarConvertirProgramacionPedidoBodegaV1(db, seller, command, () => NOW) as Data;
  const replay = await ejecutarConvertirProgramacionPedidoBodegaV1(db, seller, command, () => NOW) as Data;

  assert.equal(result.estado, "CONVERTIDA_A_SOLICITUD");
  assert.equal(result.solicitudId, replay.solicitudId);
  assert.equal(db.docs.get(`empresas/${empresaId}/agenda_pedidos_bodega/${created.programacionId}`)?.estado, "CONVERTIDA_A_SOLICITUD");
  assert.equal(db.docs.get(`empresas/${empresaId}/solicitudes_venta_bodega/${result.solicitudId}`)?.estado, "PENDIENTE_APROBACION");
  assert.equal(db.docs.get(`empresas/${empresaId}/solicitudes_venta_bodega/${result.solicitudId}`)?.programacionId, created.programacionId);
  assert.equal(db.docs.get("productos/producto-1")?.stock, 20);
  assert.equal(db.docs.get("productos/producto-1")?.stockReservado, 10);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ventas/")), false);
});

test("ADR-064: consulta de agenda limita al vendedor y muestra dirección vigente del tenant", async () => {
  const db = new FakeDb(); seed(db);
  const own = await create(db);
  db.docs.set("membresias/empresa-bodega_vendedor-2", { empresaId, uid: "vendedor-2", rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true });
  db.docs.set(`empresas/${empresaId}/agenda_pedidos_bodega/agenda-ajena`, {
    empresaId, programacionId: "agenda-ajena", solicitanteUid: "vendedor-2", clienteId: "cliente-1",
    estado: "PENDIENTE_REVISION", revision: 1, fechaLocal: "2026-10-08", lineas: [],
  });
  const ownAgenda = await ejecutarConsultarAgendaPedidosBodegaV1(db, seller) as { programaciones: Data[] };
  const otherSeller: ContextoFinancieroOperativo = { empresaId, actorUid: "vendedor-2", rol: "vendedor" };
  const otherAgenda = await ejecutarConsultarAgendaPedidosBodegaV1(db, otherSeller) as { programaciones: Data[] };
  const adminAgenda = await ejecutarConsultarAgendaPedidosBodegaV1(db, admin) as { programaciones: Data[] };

  assert.deepEqual(ownAgenda.programaciones.map(item => item.programacionId), [own.programacionId]);
  assert.equal((ownAgenda.programaciones[0].cliente as Data).direccion, "Carrera 1 # 2-3");
  assert.deepEqual(otherAgenda.programaciones.map(item => item.programacionId), ["agenda-ajena"]);
  assert.equal(adminAgenda.programaciones.length, 2);
});
