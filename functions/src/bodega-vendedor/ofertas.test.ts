import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  ejecutarActualizarOfertaBodegaV1,
  ejecutarCerrarOfertaBodegaV1,
  ejecutarConsultarOfertasBodegaV1,
  ejecutarCrearOfertaBodegaV1,
  resolverOfertaPrecioBodegaEnTransaccion,
} from "./ofertas";
import type { ContextoFinancieroOperativo } from "../bodega/operational-core";

type Data = Record<string, any>;

class Ref { constructor(readonly path: string) {} get id() { return this.path.split("/").at(-1)!; } }
class Snapshot { constructor(readonly ref: Ref, private readonly value: Data | undefined) {} get exists() { return this.value !== undefined; } get id() { return this.ref.id; } data() { return this.value; } }
class Query {
  constructor(private readonly db: FakeDb, private readonly name: string, private readonly filters: Array<[string, unknown]> = [], private readonly max = Infinity) {}
  where(field: string, _operator: string, value: unknown) { return new Query(this.db, this.name, [...this.filters, [field, value]], this.max); }
  limit(value: number) { return new Query(this.db, this.name, this.filters, value); }
  async get() {
    const prefix = `${this.name}/`;
    const docs = [...this.db.docs.entries()]
      .filter(([path, value]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/") && this.filters.every(([field, expected]) => value[field] === expected))
      .slice(0, this.max)
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
  const created = await ejecutarCrearOfertaBodegaV1(db, admin, envelope("crear", payload({
    lineas: [{ presentacionId: "presentacion-ofertas", precioFinalCOP: 800 }],
  }))) as any;
  const stored = db.docs.get(`ofertas_bodega/${created.ofertaId}`)!;
  assert.equal(stored.catalogoId, "BODEGA");
  assert.equal(stored.lineas[0].canal, undefined, "las ofertas nuevas se guardan por catálogo y presentación");
  assert.equal(stored.inicioEn.toMillis(), Date.UTC(2026, 9, 26, 13, 0));
  assert.equal(stored.finEn.toMillis(), Date.UTC(2026, 9, 26, 15, 0));
  const price = async (now: number) => db.runTransaction(tx => resolverOfertaPrecioBodegaEnTransaccion(tx, db, empresaId, { presentacionId: "presentacion-ofertas", precioBaseCOP: 1_000 }, now));
  assert.deepEqual(await price(Date.UTC(2026, 9, 26, 12, 59)), { ofertaId: null, precioAplicadoCOP: 1_000 });
  assert.deepEqual(await price(Date.UTC(2026, 9, 26, 13, 0)), { ofertaId: created.ofertaId, precioAplicadoCOP: 800 });
  assert.deepEqual(await price(Date.UTC(2026, 9, 26, 14, 59)), { ofertaId: created.ofertaId, precioAplicadoCOP: 800 });
  assert.deepEqual(await price(Date.UTC(2026, 9, 26, 15, 0)), { ofertaId: null, precioAplicadoCOP: 1_000 });
});

test("oferta: falla cerrada para vendedor, precio por encima de base y solape de presentación", async () => {
  const db = new FakeDb(); seed(db);
  await assert.rejects(ejecutarCrearOfertaBodegaV1(db, vendedor, envelope("vendedor", payload())), error => domain(error, "ROLE_FORBIDDEN"));
  await assert.rejects(ejecutarCrearOfertaBodegaV1(db, admin, envelope("cara", payload({ lineas: [{ presentacionId: "presentacion-ofertas", canal: "tienda", precioFinalCOP: 1_001 }] }))), error => domain(error, "PRECIO_OFERTA_SUPERA_BASE"));
  const primera = await ejecutarCrearOfertaBodegaV1(db, admin, envelope("primera", payload())) as any;
  assert.equal(db.docs.get(`ofertas_bodega/${primera.ofertaId}`)!.lineas[0].canal, "tienda", "se conserva canal tienda para compatibilidad con resolvedores aún desplegados");
  const legacyClientPrice = await db.runTransaction(tx => resolverOfertaPrecioBodegaEnTransaccion(
    tx, db, empresaId, { presentacionId: "presentacion-ofertas", precioBaseCOP: 1_000 }, Date.UTC(2026, 9, 26, 13),
  ));
  assert.deepEqual(legacyClientPrice, { ofertaId: primera.ofertaId, precioAplicadoCOP: 800 });
  await assert.rejects(ejecutarCrearOfertaBodegaV1(db, admin, envelope("solape", payload({ inicioLocalBogota: "2026-10-26T09:00" }))), error => domain(error, "OFERTA_SUPERPUESTA"));
});

test("oferta: la callable Bodega rechaza precios de consumidor final", async () => {
  const db = new FakeDb(); seed(db);
  const consumerLine = [{ presentacionId: "presentacion-ofertas", canal: "consumidor_final", precioFinalCOP: 1_200 }];
  await assert.rejects(
    ejecutarCrearOfertaBodegaV1(db, admin, envelope("canal-retail", payload({ lineas: consumerLine }))),
    error => domain(error, "PRECIO_CONSUMIDOR_FINAL_PERTENECE_A_NEVERA"),
  );
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ofertas_bodega/")), false);
});

test("oferta: la callable Bodega rechaza presentaciones identificadas como Nevera", async () => {
  const db = new FakeDb(); seed(db);
  db.docs.set("productos/producto-nevera", { empresaId, catalogoId: "NEVERA", nombre: "Producto retail", unidadMedida: "unidad", espacioId: "espacio", activo: true, costo: 100 });
  db.docs.set("presentaciones_producto/presentacion-nevera", { empresaId, catalogoId: "NEVERA", productoId: "producto-nevera", nombre: "Unidad", factorUnidadBase: 1, precioCOP: 1_500, precioTiendaCOP: 1_500, activo: true });
  await assert.rejects(
    ejecutarCrearOfertaBodegaV1(db, admin, envelope("oferta-presentacion-nevera", payload({
      lineas: [{ presentacionId: "presentacion-nevera", precioFinalCOP: 1_200 }],
    }))),
    error => domain(error, "PRESENTACION_OFERTA_FUERA_CATALOGO_BODEGA"),
  );
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ofertas_bodega/")), false);
});

test("oferta: cierre manual deja de aplicar y un cierre repetido no modifica de nuevo la oferta", async () => {
  const db = new FakeDb(); seed(db);
  const created = await ejecutarCrearOfertaBodegaV1(db, admin, envelope("crear-cerrar", payload({ finLocalBogota: null }))) as any;
  const first = await ejecutarCerrarOfertaBodegaV1(db, admin, envelope("cerrar", { ofertaId: created.ofertaId })) as any;
  const second = await ejecutarCerrarOfertaBodegaV1(db, admin, envelope("cerrar-otra-vez", { ofertaId: created.ofertaId })) as any;
  assert.equal(first.idempotente, false); assert.equal(second.idempotente, true);
  const effective = await db.runTransaction(tx => resolverOfertaPrecioBodegaEnTransaccion(tx, db, empresaId, { presentacionId: "presentacion-ofertas", precioBaseCOP: 1_000 }, Date.UTC(2026, 9, 27)));
  assert.deepEqual(effective, { ofertaId: null, precioAplicadoCOP: 1_000 });
});

test("oferta: consulta devuelve DTO limitado al tenant y solo permite admin con permiso de catálogo", async () => {
  const db = new FakeDb(); seed(db);
  const created = await ejecutarCrearOfertaBodegaV1(db, admin, envelope("crear-consulta", payload())) as any;
  db.docs.set("ofertas_bodega/oferta-otro-tenant", {
    empresaId: "otra-empresa", nombre: "No debe filtrarse", estado: "ACTIVA",
    inicioEn: Timestamp.fromMillis(Date.UTC(2026, 9, 26, 13)), finEn: null,
    lineas: [{ presentacionId: "presentacion-ajena", canal: "tienda", precioFinalCOP: 10 }],
  });

  const result = await ejecutarConsultarOfertasBodegaV1(db, admin, {}) as any;
  assert.equal(result.ofertas.length, 1);
  assert.equal(result.ofertas[0].ofertaId, created.ofertaId);
  assert.equal(result.ofertas[0].nombre, "Oferta de prueba");
  assert.equal(result.ofertas[0].inicioEnMillis, Date.UTC(2026, 9, 26, 13));
  assert.equal(result.ofertas[0].finEnMillis, Date.UTC(2026, 9, 26, 15));
  assert.equal("creadoPor" in result.ofertas[0], false);
  await assert.rejects(ejecutarConsultarOfertasBodegaV1(db, vendedor, {}), error => domain(error, "ROLE_FORBIDDEN"));
  await assert.rejects(ejecutarConsultarOfertasBodegaV1(db, admin, { empresaId }), error => domain(error, "PAYLOAD_OFERTA_INVALIDO"));
});

test("oferta: consulta Bodega excluye Nevera y conserva las líneas históricas de solo lectura", async () => {
  const db = new FakeDb(); seed(db);
  const legacyRef = "ofertas_bodega/oferta-legada";
  db.docs.set(legacyRef, {
    empresaId, nombre: "Histórica", estado: "ACTIVA", inicioEn: Timestamp.fromMillis(Date.UTC(2099, 5, 1, 13)), finEn: null,
    lineas: [{ presentacionId: "presentacion-ofertas", canal: "consumidor_final", precioFinalCOP: 1_200 }],
  });
  db.docs.set("ofertas_bodega/oferta-nevera", {
    empresaId, catalogoId: "NEVERA", nombre: "Nevera", estado: "ACTIVA", inicioEn: Timestamp.fromMillis(Date.UTC(2099, 5, 1, 13)), finEn: null,
    lineas: [{ presentacionId: "presentacion-ofertas", precioFinalCOP: 700 }],
  });

  const result = await ejecutarConsultarOfertasBodegaV1(db, admin, {}) as any;
  assert.deepEqual(result.ofertas.map((offer: Data) => offer.ofertaId), ["oferta-legada"]);
  assert.equal(result.ofertas[0].lineas[0].canal, "consumidor_final");
  await assert.rejects(
    ejecutarActualizarOfertaBodegaV1(db, admin, envelope("editar-legada", {
      ofertaId: "oferta-legada", nombre: "Convertida", inicioLocalBogota: "2099-06-01T08:00", finLocalBogota: null,
      lineas: [{ presentacionId: "presentacion-ofertas", canal: "tienda", precioFinalCOP: 900 }],
    }), Date.UTC(2099, 4, 1)),
    error => domain(error, "OFERTA_LEGADA_FUERA_DE_CATALOGO_BODEGA"),
  );
  await assert.rejects(
    ejecutarCerrarOfertaBodegaV1(db, admin, envelope("cerrar-nevera", { ofertaId: "oferta-nevera" })),
    error => domain(error, "OFERTA_FUERA_CATALOGO_BODEGA"),
  );
  await assert.rejects(
    ejecutarActualizarOfertaBodegaV1(db, admin, envelope("editar-nevera", {
      ofertaId: "oferta-nevera", nombre: "Cambio", inicioLocalBogota: "2099-06-01T08:00", finLocalBogota: null,
      lineas: [{ presentacionId: "presentacion-ofertas", precioFinalCOP: 600 }],
    }), Date.UTC(2099, 4, 1)),
    error => domain(error, "OFERTA_FUERA_CATALOGO_BODEGA"),
  );
  const effective = await db.runTransaction(tx => resolverOfertaPrecioBodegaEnTransaccion(
    tx, db, empresaId, { presentacionId: "presentacion-ofertas", precioBaseCOP: 1_000 }, Date.UTC(2099, 5, 1, 14),
  ));
  assert.deepEqual(effective, { ofertaId: null, precioAplicadoCOP: 1_000 });
});

test("oferta: edición auditada permite cambiar una programación futura y replays conservan el resultado", async () => {
  const db = new FakeDb(); seed(db);
  const inicioAnterior = "2099-06-01T08:00";
  const finAnterior = "2099-06-01T10:00";
  const created = await ejecutarCrearOfertaBodegaV1(db, admin, envelope("crear-editar", payload({
    inicioLocalBogota: inicioAnterior, finLocalBogota: finAnterior,
  }))) as any;
  const actualizacion = envelope("editar-futura", {
    ofertaId: created.ofertaId,
    nombre: "Oferta actualizada",
    inicioLocalBogota: "2099-06-01T09:00",
    finLocalBogota: "2099-06-01T11:00",
    lineas: [{ presentacionId: "presentacion-ofertas", canal: "tienda", precioFinalCOP: 750 }],
  });
  const primera = await ejecutarActualizarOfertaBodegaV1(db, admin, actualizacion, Date.UTC(2099, 4, 1)) as any;
  const replay = await ejecutarActualizarOfertaBodegaV1(db, admin, actualizacion, Date.UTC(2099, 4, 1)) as any;
  assert.equal(primera.revision, 2);
  assert.equal(primera.antes.nombre, "Oferta de prueba");
  assert.equal(primera.despues.nombre, "Oferta actualizada");
  assert.deepEqual(replay, primera);
  const saved = db.docs.get(`ofertas_bodega/${created.ofertaId}`)!;
  assert.equal(saved.revision, 2);
  assert.equal(saved.nombre, "Oferta actualizada");
  assert.equal(saved.lineas[0].canal, "tienda", "se conserva canal tienda en la edición para compatibilidad con resolvedores aún desplegados");
  const audit = [...db.docs.values()].find(value => value.tipo === "actualizarOfertaBodegaV1");
  assert.deepEqual((audit?.referencias as Data).antes, primera.antes);
  assert.deepEqual((audit?.referencias as Data).despues, primera.despues);
});

test("oferta: no permite editar una oferta iniciada, cruzar tenant o solapar otra oferta", async () => {
  const db = new FakeDb(); seed(db);
  const active = await ejecutarCrearOfertaBodegaV1(db, admin, envelope("crear-iniciada", payload())) as any;
  const futureA = await ejecutarCrearOfertaBodegaV1(db, admin, envelope("crear-futura-a", payload({
    inicioLocalBogota: "2099-06-01T08:00", finLocalBogota: "2099-06-01T10:00",
  }))) as any;
  const foreign = { ...db.docs.get(`ofertas_bodega/${futureA.ofertaId}`)!, empresaId: "otra-empresa" };
  db.docs.set("ofertas_bodega/oferta-otro-tenant", foreign);
  await ejecutarCrearOfertaBodegaV1(db, admin, envelope("crear-futura-b", payload({
    inicioLocalBogota: "2099-06-01T10:00", finLocalBogota: "2099-06-01T12:00",
  })));

  const update = (ofertaId: string, start: string, end: string) => envelope(`update-${ofertaId}-${start}`, {
    ofertaId, nombre: "Cambio", inicioLocalBogota: start, finLocalBogota: end,
    lineas: [{ presentacionId: "presentacion-ofertas", canal: "tienda", precioFinalCOP: 700 }],
  });
  await assert.rejects(ejecutarActualizarOfertaBodegaV1(db, admin, update(active.ofertaId, "2099-06-01T07:00", "2099-06-01T08:00"), Date.UTC(2026, 9, 26, 13)), error => domain(error, "OFERTA_YA_INICIADA"));
  await assert.rejects(ejecutarActualizarOfertaBodegaV1(db, vendedor, update(futureA.ofertaId, "2099-06-01T08:00", "2099-06-01T10:00"), Date.UTC(2099, 4, 1)), error => domain(error, "ROLE_FORBIDDEN"));
  await assert.rejects(ejecutarActualizarOfertaBodegaV1(db, admin, update("oferta-otro-tenant", "2099-06-01T08:00", "2099-06-01T10:00"), Date.UTC(2099, 4, 1)), error => domain(error, "OFERTA_NO_ENCONTRADA"));
  await assert.rejects(ejecutarActualizarOfertaBodegaV1(db, admin, update(futureA.ofertaId, "2099-06-01T09:00", "2099-06-01T11:00"), Date.UTC(2099, 4, 1)), error => domain(error, "OFERTA_SUPERPUESTA"));
});
