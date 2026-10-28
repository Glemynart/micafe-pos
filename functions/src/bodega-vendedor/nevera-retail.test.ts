import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import type { ContextoFinancieroOperativo } from "../bodega/operational-core";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import { idCapaFifoNevera } from "../inventario/nevera-fifo";
import {
  crearHashLedgerProductoNevera,
  ejecutarAbrirProductoNeveraV1,
  ejecutarConsultarCatalogoNeveraVendedorV1,
  ejecutarPreflightAperturaNeveraV1,
  ejecutarRegistrarVentaRetailNeveraV1,
  normalizarComandoVentaRetailNevera,
} from "./nevera-retail";

type Data = Record<string, any>;
class Ref {
  constructor(readonly path: string, private readonly db: FakeDb) {}
  get id() { return this.path.split("/").at(-1)!; }
}
class Snap {
  constructor(readonly ref: Ref, private readonly value: Data | undefined) {}
  get id() { return this.ref.id; }
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}
class Query {
  constructor(private readonly db: FakeDb, private readonly name: string, private readonly filters: Array<[string, unknown]> = [], private readonly orders: Array<[string, "asc" | "desc"]> = [], private readonly max = Number.POSITIVE_INFINITY) {}
  where(field: string, _op: string, value: unknown) { return new Query(this.db, this.name, [...this.filters, [field, value]], this.orders, this.max); }
  orderBy(field: string, direction: "asc" | "desc" = "asc") { return new Query(this.db, this.name, this.filters, [...this.orders, [field, direction]], this.max); }
  limit(max: number) { return new Query(this.db, this.name, this.filters, this.orders, max); }
  async get() {
    let rows = [...this.db.docs.entries()]
      .filter(([path, data]) => path.startsWith(`${this.name}/`) && path.split("/").length === 2 && this.filters.every(([field, value]) => data[field] === value))
      .map(([path, data]) => new Snap(new Ref(path, this.db), data));
    for (const [field, direction] of [...this.orders].reverse()) rows = rows.sort((a, b) => ((a.data()?.[field] ?? 0) < (b.data()?.[field] ?? 0) ? -1 : (a.data()?.[field] ?? 0) > (b.data()?.[field] ?? 0) ? 1 : 0) * (direction === "asc" ? 1 : -1));
    rows = rows.slice(0, this.max);
    return { docs: rows, size: rows.length, empty: rows.length === 0 };
  }
}
class Collection extends Query {
  constructor(private readonly fake: FakeDb, private readonly collectionName: string) { super(fake, collectionName); }
  doc(id: string) { return new Ref(`${this.collectionName}/${id}`, this.fake); }
}
class Tx {
  private creates: Array<[Ref, Data]> = [];
  private updates: Array<[Ref, Data]> = [];
  constructor(private readonly db: FakeDb) {}
  async get(ref: Ref | Query): Promise<any> { return ref instanceof Query ? ref.get() : new Snap(ref, this.db.docs.get(ref.path)); }
  create(ref: Ref, data: Data) {
    if (this.db.docs.has(ref.path) || this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("already-exists");
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
  collection(name: string) { return new Collection(this, name); }
  async runTransaction<T>(work: (tx: Tx) => Promise<T>) { const tx = new Tx(this); const result = await work(tx); tx.commit(); return result; }
}

const empresaId = "nevera-tenant-a";
const contexto: ContextoFinancieroOperativo = { empresaId, actorUid: "vendedor-a", rol: "vendedor" };
const domain = (error: unknown, code: string) => error instanceof HttpsError && (error.details as any)?.code === code;
function command(overrides: Record<string, any> = {}) {
  return {
    commandId: "venta-nevera-command-a",
    idempotencyKey: "venta-nevera-idem-a",
    correlationId: "venta-nevera-correlation-a",
    causationId: null,
    ...overrides,
    payload: overrides.payload ?? { lineas: [{ productoId: "producto-nevera-a", presentacionId: "presentacion-nevera-a", cantidad: 2 }], metodoPago: "transferencia" },
  };
}
function seedAuthority(db: FakeDb, role = "vendedor", permissions = ["sell"]) {
  db.docs.set(`empresas/${empresaId}`, { estado: "activa", esFundacional: false });
  db.docs.set(`membresias/${empresaId}_vendedor-a`, { empresaId, uid: "vendedor-a", rol: role, permisos: permissions, estado: "activa", activo: true });
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["sell", "inventory"] } });
  db.docs.set("cuentas_bancarias/banco-nevera-a", { id: "banco-nevera-a", empresaId, claveOperativa: "bancolombia", nombre: "Banco", saldo: 0 });
}
function seedReadyProduct(db: FakeDb, { stock = 5, cost = 1_000, catalogoId = "NEVERA", fifo = "LISTO", price = 2_500 } = {}) {
  db.docs.set("productos/producto-nevera-a", { empresaId, catalogoId, nombre: "Agua retail", unidadMedida: "unidad", espacioId: "espacio-a", activo: true, stock, stockReservado: 0, secuenciaLedger: 1, costo: cost, fifoNeveraEstado: fifo });
  db.docs.set("presentaciones_producto/presentacion-nevera-a", { empresaId, catalogoId, productoId: "producto-nevera-a", nombre: "Unidad individual", factorUnidadBase: 1, precioCOP: price, precioTiendaCOP: price, activo: true });
  if (stock > 0 && fifo === "LISTO") {
    const layerId = idCapaFifoNevera(empresaId, "producto-nevera-a", "movimiento-entrada-a");
    db.docs.set(`capas_fifo_nevera/${layerId}`, { id: layerId, empresaId, catalogoId: "NEVERA", productoId: "producto-nevera-a", movimientoOrigenId: "movimiento-entrada-a", secuenciaArticulo: 1, unidadesIniciales: stock, unidadesRestantes: stock, costoUnitarioCOP: cost, estado: "ACTIVA" });
    db.docs.set(`cuentas_control_nevera/${empresaId}`, { empresaId, catalogoId: "NEVERA", schemaVersion: "NEVERA_CONTROL_V1", saldoCOP: stock * cost });
    db.docs.set("movimientos_inventario/movimiento-entrada-a", { empresaId, articuloTipo: "producto", articuloId: "producto-nevera-a", tipo: "ajuste_positivo", cantidad: stock, costoUnitario: cost, secuenciaArticulo: 1, saldoCantidadDespues: stock });
  }
}

test("la venta retail consume FIFO, registra el ingreso una vez y abona el costo interno idempotentemente", async () => {
  const db = new FakeDb(); seedAuthority(db); seedReadyProduct(db);
  db.docs.get("productos/producto-nevera-a")!.stock = 8;
  db.docs.get("productos/producto-nevera-a")!.secuenciaLedger = 2;
  db.docs.set("capas_fifo_nevera/capa-lote-2", { id: "capa-lote-2", empresaId, catalogoId: "NEVERA", productoId: "producto-nevera-a", secuenciaArticulo: 2, unidadesIniciales: 3, unidadesRestantes: 3, costoUnitarioCOP: 1_200, estado: "ACTIVA" });
  db.docs.get(`cuentas_control_nevera/${empresaId}`)!.saldoCOP = 8_600;
  db.docs.set("movimientos_inventario/movimiento-entrada-b", { empresaId, articuloTipo: "producto", articuloId: "producto-nevera-a", tipo: "ajuste_positivo", cantidad: 3, costoUnitario: 1_200, secuenciaArticulo: 2, saldoCantidadDespues: 8 });
  const sale = command();
  const result = await ejecutarRegistrarVentaRetailNeveraV1(db, contexto, sale);
  const retry = await ejecutarRegistrarVentaRetailNeveraV1(db, contexto, sale);
  assert.equal(result.ventaId, retry.ventaId);
  assert.equal(result.catalogoId, "NEVERA");
  assert.equal(result.total, 5_000);
  const venta = db.docs.get(`ventas/${result.ventaId}`)!;
  assert.equal(venta.schemaVersion, "BODEGA_MVP1_NEVERA_RETAIL_V1");
  assert.equal(venta.estado, "pagada");
  assert.equal(venta.items[0].costoTotalFIFOCOP, 2_000);
  assert.deepEqual(venta.items[0].capasConsumidasDetalle.map((item: any) => [item.cantidad, item.costoUnitarioCOP]), [[2, 1_000]]);
  assert.equal(db.docs.get("productos/producto-nevera-a")?.stock, 6);
  assert.equal(db.docs.get("capas_fifo_nevera/capa-lote-2")?.unidadesRestantes, 3);
  assert.equal(db.docs.get(`cuentas_control_nevera/${empresaId}`)?.saldoCOP, 6_600);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("ventas/")).length, 1);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("transacciones_financieras/")).length, 1);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("cuentas_control_nevera_movimientos/")).length, 1);
  assert.equal([...db.docs.values()].some(doc => doc.clienteId || doc.saldoPendienteCOP), false);
});

test("la venta falla sin escritura si FIFO, catálogo, permisos o tenant no coinciden", async () => {
  const notReady = new FakeDb(); seedAuthority(notReady); seedReadyProduct(notReady, { fifo: "APERTURA_PENDIENTE" });
  const beforeNotReady = [...notReady.docs.entries()];
  await assert.rejects(ejecutarRegistrarVentaRetailNeveraV1(notReady, contexto, command()), error => domain(error, "NEVERA_REQUIERE_APERTURA_FIFO"));
  assert.deepEqual([...notReady.docs.entries()], beforeNotReady);

  const bodega = new FakeDb(); seedAuthority(bodega); seedReadyProduct(bodega, { catalogoId: "BODEGA" });
  const beforeBodega = [...bodega.docs.entries()];
  await assert.rejects(ejecutarRegistrarVentaRetailNeveraV1(bodega, contexto, command()), error => domain(error, "PRODUCTO_FUERA_CATALOGO_NEVERA"));
  assert.deepEqual([...bodega.docs.entries()], beforeBodega);

  const noSell = new FakeDb(); seedAuthority(noSell, "vendedor", []); seedReadyProduct(noSell);
  const beforeNoSell = [...noSell.docs.entries()];
  await assert.rejects(ejecutarRegistrarVentaRetailNeveraV1(noSell, contexto, command()), error => domain(error, "ROLE_FORBIDDEN"));
  assert.deepEqual([...noSell.docs.entries()], beforeNoSell);

  const wrongTenant = new FakeDb(); seedAuthority(wrongTenant); seedReadyProduct(wrongTenant);
  wrongTenant.docs.set("productos/producto-ajeno", { empresaId: "tenant-b", catalogoId: "NEVERA", activo: true });
  const beforeTenant = [...wrongTenant.docs.entries()];
  await assert.rejects(ejecutarRegistrarVentaRetailNeveraV1(wrongTenant, contexto, command({ commandId: "cross", idempotencyKey: "cross", payload: { lineas: [{ productoId: "producto-ajeno", presentacionId: "presentacion-nevera-a", cantidad: 1 }], metodoPago: "transferencia" } })), error => domain(error, "PRODUCTO_NO_ENCONTRADO"));
  assert.deepEqual([...wrongTenant.docs.entries()], beforeTenant);
});

test("el preflight no escribe; la apertura recrea ledger exacto y repetirla no duplica capas ni cargos", async () => {
  const db = new FakeDb(); seedAuthority(db, "admin", ["sell", "inventory"]);
  db.docs.set("productos/producto-nevera-a", { empresaId, catalogoId: "NEVERA", nombre: "Agua retail", unidadMedida: "unidad", espacioId: "espacio-a", activo: true, stock: 4, stockReservado: 0, secuenciaLedger: 1, costo: 900 });
  db.docs.set("presentaciones_producto/presentacion-nevera-a", { empresaId, catalogoId: "NEVERA", productoId: "producto-nevera-a", nombre: "Unidad", factorUnidadBase: 1, precioCOP: 2_000, activo: true });
  db.docs.set("movimientos_inventario/movimiento-inicial-nevera", { empresaId, articuloTipo: "producto", articuloId: "producto-nevera-a", tipo: "ajuste_positivo", cantidad: 4, costoUnitario: 900, secuenciaArticulo: 1, saldoCantidadDespues: 4 });
  const before = [...db.docs.entries()];
  const preflight = await ejecutarPreflightAperturaNeveraV1(db, { ...contexto, rol: "admin" });
  assert.equal(preflight.reconstruible, true);
  assert.equal(preflight.productos[0]?.estado, "APERTURA_PENDIENTE");
  assert.equal(preflight.productos[0]?.valorExistenciaCOP, 3_600);
  assert.deepEqual([...db.docs.entries()], before);
  const hash = preflight.productos[0]?.ledgerHash as string;
  const apertura = { commandId: "apertura-1", idempotencyKey: "apertura-1", correlationId: "apertura-corr", causationId: null, payload: { productoId: "producto-nevera-a", ledgerHash: hash } };
  const opened = await ejecutarAbrirProductoNeveraV1(db, { ...contexto, rol: "admin" }, apertura);
  assert.equal(opened.estado, "LISTO");
  assert.equal(db.docs.get("productos/producto-nevera-a")?.stock, 4);
  assert.equal(db.docs.get(`cuentas_control_nevera/${empresaId}`)?.saldoCOP, 3_600);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("capas_fifo_nevera/")).length, 1);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("cuentas_control_nevera_movimientos/")).length, 1);
  const secondCommand = { ...apertura, commandId: "apertura-2", idempotencyKey: "apertura-2", correlationId: "apertura-corr-2" };
  const again = await ejecutarAbrirProductoNeveraV1(db, { ...contexto, rol: "admin" }, secondCommand);
  assert.equal(again.idempotente, true);
  assert.equal(db.docs.get(`cuentas_control_nevera/${empresaId}`)?.saldoCOP, 3_600);
  const after = await ejecutarPreflightAperturaNeveraV1(db, { ...contexto, rol: "admin" });
  assert.equal(after.todasLasCapasAbiertas, true);
  assert.equal(after.saldoControlCoincide, true);
  assert.equal(after.valorLedgerReconstruidoCOP, 3_600);
});

test("el preflight bloquea una apertura con capas parciales previas", async () => {
  const db = new FakeDb(); seedAuthority(db, "admin", ["sell", "inventory"]);
  db.docs.set("productos/producto-nevera-a", { empresaId, catalogoId: "NEVERA", nombre: "Agua retail", unidadMedida: "unidad", espacioId: "espacio-a", activo: true, stock: 4, stockReservado: 0, secuenciaLedger: 1, costo: 900 });
  db.docs.set("movimientos_inventario/movimiento-inicial-nevera", { empresaId, articuloTipo: "producto", articuloId: "producto-nevera-a", tipo: "ajuste_positivo", cantidad: 4, costoUnitario: 900, secuenciaArticulo: 1, saldoCantidadDespues: 4 });
  db.docs.set("capas_fifo_nevera/capa-parcial", { empresaId, productoId: "producto-nevera-a", catalogoId: "NEVERA", estado: "ACTIVA", secuenciaArticulo: 1, unidadesIniciales: 1, unidadesRestantes: 1, costoUnitarioCOP: 900 });
  const before = [...db.docs.entries()];
  const result = await ejecutarPreflightAperturaNeveraV1(db, { ...contexto, rol: "admin" });
  assert.equal(result.reconstruible, false);
  assert.equal(result.productos[0]?.estado, "CAPAS_DIVERGENTES");
  assert.deepEqual([...db.docs.entries()], before);
});

test("la normalización rechaza autoridad y costo suministrados por el cliente", () => {
  const valid = command();
  assert.throws(() => normalizarComandoVentaRetailNevera({ ...valid, payload: { ...valid.payload, empresaId } }), error => domain(error, "PAYLOAD_NEVERA_INVALIDO"));
  assert.throws(() => normalizarComandoVentaRetailNevera({ ...valid, payload: { ...valid.payload, precioCOP: 1 } }), error => domain(error, "PAYLOAD_NEVERA_INVALIDO"));
  assert.throws(() => normalizarComandoVentaRetailNevera({ ...valid, payload: { lineas: valid.payload.lineas, metodoPago: "pendiente" } }), error => domain(error, "METODO_PAGO_NEVERA_INVALIDO"));
});

test("el catálogo retail expone solo Nevera y nunca campos de costo", async () => {
  const db = new FakeDb(); seedAuthority(db);
  seedReadyProduct(db);
  db.docs.set("productos/producto-bodega", { empresaId, catalogoId: "BODEGA", nombre: "Producto Bodega", unidad: "unidad", espacioId: "espacio-a", activo: true, stock: 10, fifoNeveraEstado: "LISTO" });
  db.docs.set("presentaciones_producto/presentacion-bodega", { empresaId, catalogoId: "BODEGA", productoId: "producto-bodega", nombre: "Caja", factorUnidadBase: 6, precioCOP: 5_000, activo: true });
  const result = await ejecutarConsultarCatalogoNeveraVendedorV1(db, { empresaId, rol: "vendedor", permisos: ["sell"], vertical: "BODEGA_MVP1", inventoryHabilitado: true }, {});
  assert.equal(result.catalogoId, "NEVERA");
  assert.equal(result.presentaciones.length, 1);
  assert.equal(result.presentaciones[0]?.productoId, "producto-nevera-a");
  assert.equal(result.presentaciones[0]?.precioCOP, 2_500);
  assert.equal(result.presentaciones[0]?.maximoPresentacionesVendibles, 5);
  assert.equal("costo" in result.presentaciones[0]!, false);
  await assert.rejects(ejecutarConsultarCatalogoNeveraVendedorV1(db, { empresaId, rol: "vendedor", permisos: [], vertical: "BODEGA_MVP1", inventoryHabilitado: true }, {}), error => domain(error, "CATALOGO_NEVERA_NO_AUTORIZADO"));
});

test("el hash de apertura cambia si cambia el ledger o el stock observado", () => {
  const movements = [{ id: "m1", tipo: "ajuste_positivo", cantidad: 1, costoUnitario: 400, secuenciaArticulo: 1, saldoCantidadDespues: 1 }];
  assert.equal(crearHashLedgerProductoNevera("p", 1, 1, movements), crearHashLedgerProductoNevera("p", 1, 1, movements));
  assert.notEqual(crearHashLedgerProductoNevera("p", 1, 1, movements), crearHashLedgerProductoNevera("p", 2, 1, movements));
});
