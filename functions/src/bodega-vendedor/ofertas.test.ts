import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import {
  ejecutarCerrarOfertaBodegaV1,
  ejecutarCrearOfertaBodegaV1,
  resolverOfertaPrecioBodegaEnTransaccion,
} from "./ofertas";
import type { ContextoFinancieroOperativo } from "../bodega/operational-core";

type Data = Record<string, any>;

class Ref { constructor(readonly path: string) {} get id() { return this.path.split("/").at(-1)!; } }
class Snapshot { constructor(readonly ref: Ref, private readonly value: Data | undefined) {} get exists() { return this.value !== undefined; } get id() { return this.ref.id; } data() { return this.value; } }
class Query {
  constructor(private readonly db: FakeDb, private readonly name: string, private readonly filters: Array<[string, unknown]> = []) {}
  where(field: string, _operator: string, value: unknown) { return new Query(this.db, this.name, [...this.filters, [field, value]]); }
  async get() {
    const prefix = `${this.name}/`;
    const docs = [...this.db.docs.entries()]
      .filter(([path, value]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/") && this.filters.every(([field, expected]) => value[field] === expected))
      .map(([path, value]) => new Snapshot(new Ref(path), value));
    return { docs };
  }
}
class Collection extends Query { constructor(private readonly db: FakeDb, private readonly name: string) { super(db, name); } doc(id: string) { return new Ref(`${this.name}/${id}`); } }
class Tx {
  private readonly creates: Array<[Ref, Data]> = []; private readonly updates: Array<[Ref, Data]> = [];
  constructor(private readonly db: FakeDb) {}
  async get(ref: Ref | Query): Promise<any> { return ref instanceof Query ? ref.get() : new Snapshot(ref, this.db.docs.get(ref.path)); }
  create(ref: Ref, data: Data) { if (this.db.docs.has(ref.path)) throw new Error("already-exists"); this.creates.push([ref, data]); }
  update(ref: Ref, data: Data) { if (!this.db.docs.has(ref.path)) throw new Error("not-found"); this.updates.push([ref, data]); }
  commit() { for (const [ref, value] of this.creates) this.db.docs.set(ref.path, value); for (const [ref, value] of this.updates) this.db.docs.set(ref.path, { ...this.db.docs.get(ref.path), ...value }); }
}
class FakeDb {
  readonly docs = new Map<string, Data>();
  collection(name: string) { return new Collection(this, name); }
  async runTransaction<T>(work: (tx: Tx) => Promise<T>) { const tx = new Tx(this); const result = await work(tx); tx.commit(); return result; }
}

const empresaId = "empresa-ofertas";
const admin: ContextoFinancieroOperativo = { empresaId, actorUid: "admin-ofertas", rol: "admin" };
const vendedor: ContextoFinancieroOperativo = { empresaId, actorUid: "vendedor-ofertas", rol: "vendedor" };
const envelope = (id: string, payload: Data) => ({ commandId: id, idempotencyKey: `idem-${id}`, correlationId: `corr-${id}`, payload });
const domain = (error: unknown, code: string) => error instanceof HttpsError && (error.details as Data).code === code;

function seed(db: FakeDb) {
  db.docs.set(`empresas/${empresaId}`, { estado: "activa" });
  db.docs.set(`membresias/${empresaId}_admin-ofertas`, { empresaId, uid: "admin-ofertas", rol: "admin", permisos: ["inventory"], estado: "activa", activo: true });
  db.docs.set(`membresias/${empresaId}_vendedor-ofertas`, { empresaId, uid: "vendedor-ofertas", rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true });
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["inventory", "sell"] } });
  db.docs.set("productos/producto-ofertas", { empresaId, nombre: "Producto", unidadMedida: "unidad", espacioId: "espacio", activo: true, costo: 100 });
  db.docs.set("presentaciones_producto/presentacion-ofertas", { empresaId, productoId: "producto-ofertas", nombre: "Unidad", factorUnidadBase: 1, precioCOP: 1_000, precioTiendaCOP: 1_000, precioConsumidorFinalCOP: 1_500, activo: true });
}

function payload(overrides: Data = {}) {
  return {
    nombre: "Oferta de prueba",
    inicioLocalBogota: "2026-10-26T08:00",
    finLocalBogota: "2026-10-26T10:00",
    lineas: [{ presentacionId: "presentacion-ofertas", canal: "tienda", precioFinalCOP: 800 }],
    ...overrides,
  };
}

test("oferta: alta admin guarda UTC Bogotá y aplica solo dentro de su ventana", async () => {
  const db = new FakeDb(); seed(db);
  const created = await ejecutarCrearOfertaBodegaV1(db, admin, envelope("crear", payload())) as any;
  const stored = db.docs.get(`ofertas_bodega/${created.ofertaId}`)!;
  assert.equal(stored.inicioEn.toMillis(), Date.UTC(2026, 9, 26, 13, 0));
  assert.equal(stored.finEn.toMillis(), Date.UTC(2026, 9, 26, 15, 0));
  const price = async (now: number) => db.runTransaction(tx => resolverOfertaPrecioBodegaEnTransaccion(tx, db, empresaId, { presentacionId: "presentacion-ofertas", canal: "tienda", precioBaseCOP: 1_000 }, now));
  assert.deepEqual(await price(Date.UTC(2026, 9, 26, 12, 59)), { ofertaId: null, precioAplicadoCOP: 1_000 });
  assert.deepEqual(await price(Date.UTC(2026, 9, 26, 13, 0)), { ofertaId: created.ofertaId, precioAplicadoCOP: 800 });
  assert.deepEqual(await price(Date.UTC(2026, 9, 26, 14, 59)), { ofertaId: created.ofertaId, precioAplicadoCOP: 800 });
  assert.deepEqual(await price(Date.UTC(2026, 9, 26, 15, 0)), { ofertaId: null, precioAplicadoCOP: 1_000 });
});

test("oferta: falla cerrada para vendedor, precio por encima de base y solape de presentación/canal", async () => {
  const db = new FakeDb(); seed(db);
  await assert.rejects(ejecutarCrearOfertaBodegaV1(db, vendedor, envelope("vendedor", payload())), error => domain(error, "ROLE_FORBIDDEN"));
  await assert.rejects(ejecutarCrearOfertaBodegaV1(db, admin, envelope("cara", payload({ lineas: [{ presentacionId: "presentacion-ofertas", canal: "tienda", precioFinalCOP: 1_001 }] }))), error => domain(error, "PRECIO_OFERTA_SUPERA_BASE"));
  await ejecutarCrearOfertaBodegaV1(db, admin, envelope("primera", payload()));
  await assert.rejects(ejecutarCrearOfertaBodegaV1(db, admin, envelope("solape", payload({ inicioLocalBogota: "2026-10-26T09:00" }))), error => domain(error, "OFERTA_SUPERPUESTA"));
});

test("oferta: cierre manual deja de aplicar y un cierre repetido no modifica de nuevo la oferta", async () => {
  const db = new FakeDb(); seed(db);
  const created = await ejecutarCrearOfertaBodegaV1(db, admin, envelope("crear-cerrar", payload({ finLocalBogota: null }))) as any;
  const first = await ejecutarCerrarOfertaBodegaV1(db, admin, envelope("cerrar", { ofertaId: created.ofertaId })) as any;
  const second = await ejecutarCerrarOfertaBodegaV1(db, admin, envelope("cerrar-otra-vez", { ofertaId: created.ofertaId })) as any;
  assert.equal(first.idempotente, false); assert.equal(second.idempotente, true);
  const effective = await db.runTransaction(tx => resolverOfertaPrecioBodegaEnTransaccion(tx, db, empresaId, { presentacionId: "presentacion-ofertas", canal: "tienda", precioBaseCOP: 1_000 }, Date.UTC(2026, 9, 27)));
  assert.deepEqual(effective, { ofertaId: null, precioAplicadoCOP: 1_000 });
});
