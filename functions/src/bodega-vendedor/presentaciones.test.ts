import assert from "node:assert/strict";
import test from "node:test";
import {
  ejecutarActualizarPresentacionComercialV1,
  ejecutarConsultarCatalogoPresentacionesVendedor,
  ejecutarCrearPresentacionComercialV1,
  normalizarReferenciaPresentacionComercial,
  resolverPresentacionComercialEnTransaccion,
} from "./presentaciones";
import type { ContextoFinancieroOperativo } from "../finanzas/callables";

type Data = Record<string, any>;

class Snapshot {
  constructor(readonly id: string, private readonly value: Data | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class Ref {
  constructor(readonly path: string) {}
  get id() { return this.path.split("/").at(-1)!; }
}

class Query {
  constructor(private readonly db: FakeFirestore, private readonly collectionName: string, private readonly filters: Array<[string, unknown]> = []) {}
  where(key: string, _operator: string, value: unknown) { return new Query(this.db, this.collectionName, [...this.filters, [key, value]]); }
  async get() {
    const prefix = `${this.collectionName}/`;
    const docs = [...this.db.docs.entries()]
      .filter(([path, data]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/") && this.filters.every(([key, value]) => data[key] === value))
      .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data }));
    return { docs };
  }
}

class Collection extends Query {
  constructor(private readonly db: FakeFirestore, private readonly name: string) { super(db, name); }
  doc(id: string) { return new Ref(`${this.name}/${id}`); }
}

class Transaction {
  private readonly creates: Array<[Ref, Data]> = [];
  private readonly updates: Array<[Ref, Data]> = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: Ref) { return new Snapshot(ref.id, this.db.docs.get(ref.path)); }
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
  collection(name: string) { return new Collection(this, name); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const tx = new Transaction(this);
    const result = await work(tx);
    tx.commit();
    return result;
  }
}

const adminA: ContextoFinancieroOperativo = { empresaId: "empresa-a", actorUid: "admin-a", rol: "admin" };
const vendedorA: ContextoFinancieroOperativo = { empresaId: "empresa-a", actorUid: "vendedor-a", rol: "vendedor" };
const envelope = (commandId: string, payload: Data) => ({ commandId, idempotencyKey: `idem-${commandId}`, correlationId: `corr-${commandId}`, payload });

function seed(db: FakeFirestore, empresaId = "empresa-a") {
  db.docs.set(`empresas/${empresaId}`, { estado: "trial" });
  db.docs.set(`membresias/${empresaId}_admin-a`, { empresaId, uid: "admin-a", rol: "admin", permisos: ["inventory"], estado: "activa", activo: true });
  db.docs.set(`membresias/${empresaId}_vendedor-a`, { empresaId, uid: "vendedor-a", rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true });
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["inventory", "sell"] } });
  db.docs.set(`productos/producto-${empresaId}`, { empresaId, nombre: `Producto ${empresaId}`, unidad: "unidad", activo: true, stock: 50, costo: 700 });
}

function payload(productoId: string, factorUnidadBase: number, precioCOP: number, nombre = "Unidad") {
  return { productoId, nombre, factorUnidadBase, precioCOP };
}

async function create(db: FakeFirestore, commandId: string, data: Data, contexto = adminA) {
  return ejecutarCrearPresentacionComercialV1(db, contexto, envelope(commandId, data));
}

test("U2-B: crea presentaciones válidas de factor 1, 6 y 24 sin duplicar stock", async () => {
  const db = new FakeFirestore(); seed(db);
  const productoId = "producto-empresa-a";
  const unidad = await create(db, "unidad", payload(productoId, 1, 1000, "Unidad"));
  const paca = await create(db, "paca", payload(productoId, 6, 5500, "Paca"));
  const caja = await create(db, "caja", payload(productoId, 24, 21000, "Caja"));

  assert.equal(db.docs.get(`presentaciones_producto/${unidad.presentacionId}`)?.factorUnidadBase, 1);
  assert.equal(db.docs.get(`presentaciones_producto/${paca.presentacionId}`)?.factorUnidadBase, 6);
  assert.equal(db.docs.get(`presentaciones_producto/${caja.presentacionId}`)?.factorUnidadBase, 24);
  assert.equal(db.docs.get(`productos/${productoId}`)?.stock, 50);
});

test("U2-B: rechaza factores y precios no enteros positivos", async () => {
  const invalidos: Array<[string, Data, RegExp]> = [
    ["factor-cero", payload("producto-empresa-a", 0, 1), /FACTOR_UNIDAD_BASE_INVALIDO/],
    ["factor-negativo", payload("producto-empresa-a", -1, 1), /FACTOR_UNIDAD_BASE_INVALIDO/],
    ["factor-decimal", payload("producto-empresa-a", 1.5, 1), /FACTOR_UNIDAD_BASE_INVALIDO/],
    ["precio-cero", payload("producto-empresa-a", 1, 0), /PRECIO_COP_INVALIDO/],
    ["precio-negativo", payload("producto-empresa-a", 1, -1), /PRECIO_COP_INVALIDO/],
    ["precio-decimal", payload("producto-empresa-a", 1, 1.5), /PRECIO_COP_INVALIDO/],
  ];
  for (const [commandId, entrada, expected] of invalidos) {
    const db = new FakeFirestore(); seed(db);
    await assert.rejects(create(db, commandId, entrada), expected);
  }
});

test("U2-B: administración Bodega con inventory crea y actualiza; vendedor no modifica precio ni factor", async () => {
  const db = new FakeFirestore(); seed(db);
  const creada = await create(db, "crear-admin", payload("producto-empresa-a", 1, 1000));
  await ejecutarActualizarPresentacionComercialV1(db, adminA, envelope("precio-admin", { presentacionId: creada.presentacionId, precioCOP: 12000 }));
  assert.equal(db.docs.get(`presentaciones_producto/${creada.presentacionId}`)?.precioCOP, 12000);
  const denegado = (error: any) => error?.details?.code === "ROLE_FORBIDDEN" || error?.message === "ROL_NO_AUTORIZADO";
  await assert.rejects(
    ejecutarActualizarPresentacionComercialV1(db, vendedorA, envelope("precio-vendedor", { presentacionId: creada.presentacionId, precioCOP: 1 })),
    denegado,
  );
  await assert.rejects(
    ejecutarActualizarPresentacionComercialV1(db, vendedorA, envelope("factor-vendedor", { presentacionId: creada.presentacionId, factorUnidadBase: 6 })),
    denegado,
  );
  const sinModulo = new FakeFirestore(); seed(sinModulo);
  sinModulo.docs.set("configuraciones/empresa-a", { empresaId: "empresa-a", vertical: "BODEGA_MVP1", modulos: { habilitados: ["sell"] } });
  await assert.rejects(create(sinModulo, "sin-inventory", payload("producto-empresa-a", 1, 1000)), /CATALOGO_BODEGA_NO_AUTORIZADO/);
});

test("U2-B: producto ajeno, presentación ajena, producto inactivo y presentación inactiva fallan cerrados", async () => {
  const db = new FakeFirestore(); seed(db); seed(db, "empresa-b");
  await assert.rejects(create(db, "producto-ausente", payload("producto-ausente", 1, 1000)), /PRODUCTO_NO_ENCONTRADO/);
  await assert.rejects(create(db, "producto-ajeno", payload("producto-empresa-b", 1, 1000)), /PRODUCTO_NO_ENCONTRADO/);
  const creada = await create(db, "presentacion-a", payload("producto-empresa-a", 6, 6000));
  db.docs.set("presentaciones_producto/presentacion-b", { empresaId: "empresa-b", productoId: "producto-empresa-b", nombre: "Caja B", factorUnidadBase: 24, precioCOP: 24000, activo: true });
  await assert.rejects(
    db.runTransaction(tx => resolverPresentacionComercialEnTransaccion(tx, db, "empresa-a", { productoId: "producto-empresa-a", presentacionId: "presentacion-b" })),
    /PRESENTACION_NO_ENCONTRADA/,
  );
  db.docs.set("productos/producto-empresa-a", { ...db.docs.get("productos/producto-empresa-a"), activo: false });
  await assert.rejects(
    db.runTransaction(tx => resolverPresentacionComercialEnTransaccion(tx, db, "empresa-a", { productoId: "producto-empresa-a", presentacionId: creada.presentacionId })),
    /PRODUCTO_INACTIVO/,
  );
  db.docs.set("productos/producto-empresa-a", { ...db.docs.get("productos/producto-empresa-a"), activo: true });
  db.docs.set(`presentaciones_producto/${creada.presentacionId}`, { ...db.docs.get(`presentaciones_producto/${creada.presentacionId}`), activo: false });
  await assert.rejects(
    db.runTransaction(tx => resolverPresentacionComercialEnTransaccion(tx, db, "empresa-a", { productoId: "producto-empresa-a", presentacionId: creada.presentacionId })),
    /PRESENTACION_INACTIVA/,
  );
  db.docs.set(`presentaciones_producto/${creada.presentacionId}`, { ...db.docs.get(`presentaciones_producto/${creada.presentacionId}`), activo: true, productoId: "producto-empresa-b" });
  await assert.rejects(
    ejecutarActualizarPresentacionComercialV1(db, adminA, envelope("corrupta", { presentacionId: creada.presentacionId, precioCOP: 7000 })),
    /PRESENTACION_PRODUCTO_INVALIDO/,
  );
});

test("U2-B: el resolver futuro usa factor/precio persistidos y rechaza precio enviado", async () => {
  const db = new FakeFirestore(); seed(db);
  const creada = await create(db, "resolver", payload("producto-empresa-a", 24, 12000, "Caja"));
  const canonica = await db.runTransaction(tx => resolverPresentacionComercialEnTransaccion(tx, db, "empresa-a", { productoId: "producto-empresa-a", presentacionId: creada.presentacionId }));
  assert.deepEqual({ factor: canonica.factorUnidadBase, precio: canonica.precioCOP, producto: canonica.productoId }, { factor: 24, precio: 12000, producto: "producto-empresa-a" });
  assert.throws(() => normalizarReferenciaPresentacionComercial({ productoId: "producto-empresa-a", presentacionId: creada.presentacionId, precioCOP: 500 }), /PAYLOAD_INVALIDO/);
  assert.throws(() => normalizarReferenciaPresentacionComercial({ empresaId: "empresa-b", productoId: "producto-empresa-a", presentacionId: creada.presentacionId }), /PAYLOAD_INVALIDO/);
});

test("U2-B: catálogo vendedor es tenant-aware, activo y no filtra costos", async () => {
  const db = new FakeFirestore(); seed(db); seed(db, "empresa-b");
  await create(db, "catalogo-a", payload("producto-empresa-a", 6, 6000, "Paca"));
  db.docs.set("presentaciones_producto/presentacion-b", { empresaId: "empresa-b", productoId: "producto-empresa-b", nombre: "Caja B", factorUnidadBase: 24, precioCOP: 24000, activo: true });
  const catalogo = await ejecutarConsultarCatalogoPresentacionesVendedor(db, { empresaId: "empresa-a", rol: "vendedor", permisos: ["sell"], vertical: "BODEGA_MVP1", inventoryHabilitado: true }, {});
  assert.equal(catalogo.presentaciones.length, 1);
  assert.equal(catalogo.presentaciones[0]?.precioCOP, 6000);
  assert.equal(catalogo.presentaciones[0]?.maximoPresentacionesVendibles, 8);
  assert.equal(JSON.stringify(catalogo).includes("costo"), false);
  await assert.rejects(
    ejecutarConsultarCatalogoPresentacionesVendedor(db, { empresaId: "empresa-a", rol: "vendedor", permisos: ["sell"], vertical: "BODEGA_MVP1", inventoryHabilitado: true }, { fields: ["costo"] }),
    /PAYLOAD_INVALIDO/,
  );
  await assert.rejects(
    ejecutarConsultarCatalogoPresentacionesVendedor(db, { empresaId: "empresa-a", rol: "vendedor", permisos: ["sell"], vertical: "GENERAL", inventoryHabilitado: true }, {}),
    /ROL_NO_AUTORIZADO/,
  );
});
