import assert from "node:assert/strict";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { ejecutarConfirmarVentaBodegaV1 } from "./ventas-confirmation";
import type { ContextoFinancieroOperativo } from "../finanzas/callables";
import { crearIdentificadorInterno } from "../turnos/identificadores";

type Data = Record<string, any>;
class Ref { constructor(readonly path: string) {} get id() { return this.path.split("/").at(-1)!; } }
class Snap { constructor(readonly ref: Ref, private readonly value: Data | undefined) {} get id() { return this.ref.id; } get exists() { return this.value !== undefined; } data() { return this.value; } }
class Query { constructor(private db: FakeDb, private name: string, private filters: Array<[string, unknown]>) {} where(field: string, _op: string, value: unknown) { return new Query(this.db, this.name, [...this.filters, [field, value]]); } async get() { const docs = [...this.db.docs.entries()].filter(([path, data]) => path.startsWith(`${this.name}/`) && this.filters.every(([field, value]) => data[field] === value)).map(([path, data]) => new Snap(new Ref(path), data)); return { docs, size: docs.length }; } }
class Collection { constructor(private db: FakeDb, private name: string) {} doc(id: string) { return new Ref(`${this.name}/${id}`); } where(field: string, _op: string, value: unknown) { return new Query(this.db, this.name, [[field, value]]); } }
class Tx {
  creates: Array<[Ref, Data]> = []; updates: Array<[Ref, Data]> = [];
  constructor(private db: FakeDb) {}
  async get(ref: Ref | Query): Promise<any> { return ref instanceof Query ? ref.get() : new Snap(ref, this.db.docs.get(ref.path)); }
  create(ref: Ref, data: Data) { if (this.db.docs.has(ref.path) || this.creates.some(([r]) => r.path === ref.path)) throw new Error("already-exists"); this.creates.push([ref, structuredClone(data)]); }
  update(ref: Ref, data: Data) { if (!this.db.docs.has(ref.path)) throw new Error("not-found"); this.updates.push([ref, structuredClone(data)]); }
  commit() { for (const [r, d] of this.creates) this.db.docs.set(r.path, d); for (const [r, d] of this.updates) this.db.docs.set(r.path, { ...this.db.docs.get(r.path), ...d }); }
}
class FakeDb {
  docs = new Map<string, Data>(); collection(name: string) { return new Collection(this, name); }
  async runTransaction<T>(work: (tx: Tx) => Promise<T>) { const tx = new Tx(this); const result = await work(tx); tx.commit(); return result; }
}
const empresaId = "empresa-u3c";
const contexto: ContextoFinancieroOperativo = { empresaId, actorUid: "vendedor-u3c", rol: "vendedor" };
const dominio = (error: unknown, code: string) => error instanceof HttpsError && (error.details as any)?.code === code;
function comando(overrides: Record<string, unknown> = {}) { return {
  commandId: "cmd-u3c", idempotencyKey: "idem-u3c", correlationId: "corr-u3c", causationId: null,
  payload: { clienteId: "cliente-u3c", lineas: [{ productoId: "producto-u3c", presentacionId: "caja-u3c", cantidad: 2 }], metodoPago: "efectivo" }, ...overrides,
}; }
function seed(db: FakeDb) {
  db.docs.set(`empresas/${empresaId}`, { estado: "activa", esFundacional: true });
  db.docs.set(`membresias/${empresaId}_vendedor-u3c`, { empresaId, uid: "vendedor-u3c", rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true });
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["sell"] } });
  db.docs.set("clientes/cliente-u3c", { empresaId, nombre: "Tienda", cedula: "900", activo: true });
  db.docs.set("productos/producto-u3c", { empresaId, nombre: "Producto", unidadMedida: "unidad", espacioId: "espacio", activo: true, stock: 100, secuenciaLedger: 1, costo: 100 });
  db.docs.set("presentaciones_producto/caja-u3c", { empresaId, productoId: "producto-u3c", nombre: "Caja", factorUnidadBase: 24, precioCOP: 20000, activo: true });
  db.docs.set("cuentas_bancarias/caja-principal", { id: "caja-principal", empresaId, claveOperativa: "caja-principal", nombre: "Caja", saldo: 0 });
  db.docs.set(`turnos_activos/${crearIdentificadorInterno(empresaId, "vendedor-u3c")}`, { empresaId, cajeroId: "vendedor-u3c", turnoId: "turno-u3c" });
  db.docs.set("turnos/turno-u3c", { empresaId, cajeroId: "vendedor-u3c", estado: "abierto" });
}

test("U3-C: efectivo completa una venta Bodega con 48 unidades base, caja, turno e idempotencia", async () => {
  const db = new FakeDb(); seed(db);
  const result = await ejecutarConfirmarVentaBodegaV1(db, contexto, comando()) as any;
  assert.equal(result.estadoOperativo, "COMPLETO"); assert.equal(result.total, 40000); assert.equal(result.turnoId, "turno-u3c");
  const venta = db.docs.get(`ventas/${result.ventaId}`)!;
  assert.equal(venta.schemaVersion, "BODEGA_MVP1_V1"); assert.equal(venta.items[0].cantidadUnidadBase, 48); assert.equal(venta.estadoOperativo, "COMPLETO");
  assert.equal(db.docs.get("productos/producto-u3c")?.stock, 52);
  assert.equal(db.docs.get("cuentas_bancarias/caja-principal")?.saldo, 40000);
  const replay = await ejecutarConfirmarVentaBodegaV1(db, contexto, comando()) as any;
  assert.equal(replay.ventaId, result.ventaId);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("ventas/")).length, 1);
});

test("U3-C: datos económicos y autoridad de cliente se rechazan antes de efectos", async () => {
  const db = new FakeDb(); seed(db);
  await assert.rejects(ejecutarConfirmarVentaBodegaV1(db, contexto, comando({ empresaId: "ajena" })), error => dominio(error, "COMANDO_BODEGA_INVALIDO"));
  await assert.rejects(ejecutarConfirmarVentaBodegaV1(db, contexto, comando({ payload: { clienteId: "cliente-u3c", lineas: [{ productoId: "producto-u3c", presentacionId: "caja-u3c", cantidad: 1, precio: 1 }], metodoPago: "efectivo" } })), error => dominio(error, "LINEA_BODEGA_INVALIDA"));
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ventas/")), false);
});

test("U3-C: efectivo exige turno propio, stock suficiente y sell vigente sin efectos parciales", async () => {
  const sinTurno = new FakeDb(); seed(sinTurno);
  sinTurno.docs.delete(`turnos_activos/${crearIdentificadorInterno(empresaId, "vendedor-u3c")}`);
  await assert.rejects(ejecutarConfirmarVentaBodegaV1(sinTurno, contexto, comando()), error => dominio(error, "TURNO_CERRADO"));
  assert.equal([...sinTurno.docs.keys()].some(path => path.startsWith("ventas/")), false);

  const sinStock = new FakeDb(); seed(sinStock); sinStock.docs.set("productos/producto-u3c", { ...sinStock.docs.get("productos/producto-u3c"), stock: 47 });
  await assert.rejects(ejecutarConfirmarVentaBodegaV1(sinStock, contexto, comando()), error => error instanceof Error && error.message === "STOCK_INSUFICIENTE");
  assert.equal([...sinStock.docs.keys()].some(path => path.startsWith("ventas/")), false);
  assert.equal(sinStock.docs.get("productos/producto-u3c")?.stock, 47);

  const sinSell = new FakeDb(); seed(sinSell); sinSell.docs.set(`membresias/${empresaId}_vendedor-u3c`, { ...sinSell.docs.get(`membresias/${empresaId}_vendedor-u3c`), permisos: [] });
  await assert.rejects(ejecutarConfirmarVentaBodegaV1(sinSell, contexto, comando()), error => dominio(error, "ROLE_FORBIDDEN"));
});

test("U3-C: transferencia usa la cuenta canónica sin turno ni movimiento de caja", async () => {
  const db = new FakeDb(); seed(db);
  db.docs.delete(`turnos_activos/${crearIdentificadorInterno(empresaId, "vendedor-u3c")}`);
  db.docs.delete("turnos/turno-u3c");
  db.docs.set("cuentas_bancarias/banco-u3c", { id: "banco-u3c", empresaId, claveOperativa: "bancolombia", nombre: "Banco", saldo: 0 });
  const result = await ejecutarConfirmarVentaBodegaV1(db, contexto, comando({ commandId: "cmd-transfer", idempotencyKey: "idem-transfer", payload: { clienteId: "cliente-u3c", lineas: [{ productoId: "producto-u3c", presentacionId: "caja-u3c", cantidad: 1 }], metodoPago: "transferencia" } })) as any;
  assert.equal(result.turnoId, null);
  const ingreso = db.docs.get(`transacciones_financieras/${result.movimientoFinancieroId}`)!;
  assert.equal(ingreso.cuentaDocumentoId, "banco-u3c");
  assert.equal(ingreso.cuentaClaveSnapshot, "bancolombia");
  assert.equal(ingreso.turnoId, null);
  assert.equal(db.docs.get("cuentas_bancarias/caja-principal")?.saldo, 0);
  assert.equal(db.docs.get("cuentas_bancarias/banco-u3c")?.saldo, 20000);
});

const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
test("U3-C Emulator: doble confirmación real conserva un único conjunto atómico de efectos", { skip: !FIRESTORE_EMULATOR_HOST }, async () => {
  if (!FIRESTORE_EMULATOR_HOST?.startsWith("127.0.0.1:") || process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("U3-C requiere Emulator local sin credenciales reales.");
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const empresa = `empresa-u3c-${suffix}`; const actor = `vendedor-u3c-${suffix}`;
  const app = initializeApp({ projectId: "demo-bodega-u3c-confirmacion" }, `u3c-${suffix}`); const db = getFirestore(app);
  const command = { commandId: `cmd-u3c-${suffix}`, idempotencyKey: `idem-u3c-${suffix}`, correlationId: `corr-u3c-${suffix}`, causationId: null, payload: { clienteId: `cliente-${suffix}`, lineas: [{ productoId: `producto-${suffix}`, presentacionId: `presentacion-${suffix}`, cantidad: 6 }], metodoPago: "efectivo" } };
  try {
    const [clienteId, productoId, presentacionId] = [command.payload.clienteId, command.payload.lineas[0].productoId, command.payload.lineas[0].presentacionId];
    const lockId = crearIdentificadorInterno(empresa, actor);
    const batch = db.batch();
    batch.set(db.collection("empresas").doc(empresa), { estado: "activa", esFundacional: true });
    batch.set(db.collection("membresias").doc(`${empresa}_${actor}`), { empresaId: empresa, uid: actor, rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true });
    batch.set(db.collection("configuraciones").doc(empresa), { empresaId: empresa, vertical: "BODEGA_MVP1", modulos: { habilitados: ["sell"] } });
    batch.set(db.collection("clientes").doc(clienteId), { empresaId: empresa, nombre: "Cliente", cedula: "900", activo: true });
    batch.set(db.collection("productos").doc(productoId), { empresaId: empresa, nombre: "Producto", unidadMedida: "unidad", espacioId: "espacio", activo: true, stock: 10, secuenciaLedger: 1, costo: 100 });
    batch.set(db.collection("presentaciones_producto").doc(presentacionId), { empresaId: empresa, productoId, nombre: "Unidad", factorUnidadBase: 1, precioCOP: 1000, activo: true });
    batch.set(db.collection("cuentas_bancarias").doc("caja-principal"), { id: "caja-principal", empresaId: empresa, claveOperativa: "caja-principal", nombre: "Caja", saldo: 0 });
    batch.set(db.collection("turnos").doc(`turno-${suffix}`), { empresaId: empresa, cajeroId: actor, estado: "abierto" });
    batch.set(db.collection("turnos_activos").doc(lockId), { empresaId: empresa, cajeroId: actor, turnoId: `turno-${suffix}` }); await batch.commit();
    const contextoEmulator: ContextoFinancieroOperativo = { empresaId: empresa, actorUid: actor, rol: "vendedor" };
    const [a, b] = await Promise.all([ejecutarConfirmarVentaBodegaV1(db, contextoEmulator, command), ejecutarConfirmarVentaBodegaV1(db, contextoEmulator, command)]) as any[];
    assert.equal(a.ventaId, b.ventaId);
    assert.equal((await db.collection("ventas").where("empresaId", "==", empresa).get()).size, 1);
    assert.equal((await db.collection("operaciones_comandos").where("empresaId", "==", empresa).get()).size, 1);
    assert.equal((await db.collection("transacciones_financieras").where("empresaId", "==", empresa).get()).size, 1);
    const inventario = await db.collection("movimientos_inventario").where("empresaId", "==", empresa).get();
    assert.equal(inventario.size, 1); assert.equal(inventario.docs[0]?.data().cantidad, -6);
    assert.equal((await db.collection("productos").doc(productoId).get()).data()?.stock, 4);
  } finally { await deleteApp(app); }
});
