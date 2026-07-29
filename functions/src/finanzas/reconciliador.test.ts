import assert from "node:assert/strict";
import test from "node:test";
import { reconciliarVentasPendientes } from "./reconciliador";

type Data = Record<string, any>;
class Snapshot { constructor(readonly id: string, private readonly value: Data | undefined) {} get exists() { return this.value !== undefined; } data() { return this.value; } }
class Ref { constructor(readonly path: string, private readonly db: FakeFirestore) {} get id() { return this.path.split("/").at(-1)!; } async get() { return new Snapshot(this.id, this.db.docs.get(this.path)); } }
class Collection {
  constructor(private readonly name: string, private readonly db: FakeFirestore) {}
  doc(id: string) { return new Ref(`${this.name}/${id}`, this.db); }
  where(field: string, _op: string, value: unknown) { return { get: async () => {
    const docs = [...this.db.docs.entries()].filter(([path, data]) => path.startsWith(`${this.name}/`) && !path.slice(this.name.length + 1).includes("/") && data[field] === value).map(([path, data]) => new Snapshot(path.split("/").at(-1)!, data));
    return { docs, size: docs.length };
  }}; }
}
class Transaction {
  private creates: Array<[Ref, Data]> = []; private updates: Array<[Ref, Data]> = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: Ref) { return new Snapshot(ref.id, this.db.docs.get(ref.path)); }
  create(ref: Ref, data: Data) { if (this.db.docs.has(ref.path) || this.creates.some(([r]) => r.path === ref.path)) throw new Error("already-exists"); this.creates.push([ref, data]); }
  update(ref: Ref, data: Data) { if (!this.db.docs.has(ref.path)) throw new Error("not-found"); this.updates.push([ref, data]); }
  commit() { for (const [ref, data] of this.creates) this.db.docs.set(ref.path, structuredClone(data)); for (const [ref, data] of this.updates) this.db.docs.set(ref.path, { ...this.db.docs.get(ref.path), ...structuredClone(data) }); }
}
class FakeFirestore {
  readonly docs = new Map<string, Data>(); private queue: Promise<void> = Promise.resolve();
  collection(name: string) { return new Collection(name, this); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) { const previous = this.queue; let release!: () => void; this.queue = new Promise(resolve => { release = resolve; }); await previous; try { const tx = new Transaction(this); const result = await work(tx); tx.commit(); return result; } finally { release(); } }
}

const empresaId = "empresa-a";
function seed(db: FakeFirestore, ventaId: string, total = 100) {
  db.docs.set(`empresas/${empresaId}`, { estado: "activa", esFundacional: true });
  db.docs.set(`membresias/${empresaId}_cajero-a`, { empresaId, uid: "cajero-a", rol: "cajero", permisos: ["pos"], estado: "activa", activo: true });
  db.docs.set("cuentas_bancarias/caja-principal", { id: "caja-principal", empresaId, saldo: 0, claveOperativa: "caja-principal", nombre: "Caja" });
  db.docs.set("turnos/turno-1", { empresaId, estado: "cerrado" });
  db.docs.set("productos/cafe", { empresaId, nombre: "Café", stock: 5, secuenciaLedger: 0, costo: 10 });
  db.docs.set(`ventas/${ventaId}`, { empresaId, cajeroId: "no-es-actor-autoritativo", rolCajeroSnapshot: "admin", estado: "pagada", estadoOperativo: "PENDIENTE_EFECTOS", turnoId: "turno-1", metodoPago: "efectivo", totales: { total }, items: [{ id: "cafe", cantidad: 1 }] });
  db.docs.set(`fiscal_comandos/recibo-${ventaId}`, { ventaId, empresaId, actorOriginal: { uid: "cajero-a", rolEfectivo: "cajero" }, commandId: `confirmar-${ventaId}`, idempotencyKey: `idem-confirmar-${ventaId}`, correlationId: `corr-${ventaId}`, causationId: `causa-${ventaId}` });
}
function count(db: FakeFirestore, collection: string) { return [...db.docs.keys()].filter(path => path.startsWith(`${collection}/`)).length; }

test("R1-B.2: el reconciliador real aplica efectos, recibo, auditoría y ledger en un commit", async () => {
  const db = new FakeFirestore(); seed(db, "venta-ok");
  const result = await reconciliarVentasPendientes(db as any);
  assert.deepEqual(result, { procesadas: 1, completadas: 1, pendientes: 0 });
  assert.equal(db.docs.get("ventas/venta-ok")?.estadoOperativo, "COMPLETO");
  assert.equal(db.docs.get("cuentas_bancarias/caja-principal")?.saldo, 100);
  assert.equal(db.docs.get("productos/cafe")?.stock, 4);
  assert.equal(count(db, "transacciones_financieras"), 1);
  assert.equal(count(db, "movimientos_inventario"), 1);
  assert.equal(count(db, "operaciones_comandos"), 1);
  assert.equal(count(db, "operaciones_auditoria"), 1);
  const movimiento = [...db.docs.entries()].find(([path]) => path.startsWith("transacciones_financieras/"))?.[1];
  const auditoria = [...db.docs.entries()].find(([path]) => path.startsWith("operaciones_auditoria/"))?.[1];
  assert.equal(movimiento.usuarioId, "cajero-a");
  assert.equal(movimiento.rolEfectivoSnapshot, "cajero");
  assert.equal(movimiento.commandId, "confirmar-venta-ok");
  assert.deepEqual(auditoria.actor, { uid: "cajero-a", rolEfectivo: "cajero" });
  assert.equal(auditoria.comando.id, "confirmar-venta-ok");
  assert.equal(auditoria.comando.correlationId, "corr-venta-ok");
  assert.equal(auditoria.causationId, "causa-venta-ok");
  assert.equal(auditoria.ejecutorTecnico, "reconciliarVentasPendientesOperativas");
  const reciboOperativo = [...db.docs.entries()].find(([path]) => path.startsWith("operaciones_comandos/"))?.[1];
  assert.equal(reciboOperativo.commandId, "confirmar-venta-ok");
  assert.equal(reciboOperativo.causationId, "causa-venta-ok");
});

test("R1-B.2: reintento concurrente no duplica efectos ni confirmaciones", async () => {
  const db = new FakeFirestore(); seed(db, "venta-unica");
  await Promise.all([reconciliarVentasPendientes(db as any), reconciliarVentasPendientes(db as any)]);
  assert.equal(db.docs.get("ventas/venta-unica")?.estadoOperativo, "COMPLETO");
  assert.equal(count(db, "transacciones_financieras"), 1);
  assert.equal(count(db, "movimientos_inventario"), 1);
  assert.equal(count(db, "operaciones_comandos"), 1);
});

test("R1-B.2: una venta fallida no bloquea las posteriores", async () => {
  const db = new FakeFirestore(); seed(db, "venta-invalida"); seed(db, "venta-posterior");
  db.docs.set("ventas/venta-invalida", { ...db.docs.get("ventas/venta-invalida"), items: [{ id: "faltante", cantidad: 1 }] });
  const result = await reconciliarVentasPendientes(db as any);
  assert.deepEqual(result, { procesadas: 2, completadas: 1, pendientes: 1 });
  assert.equal(db.docs.get("ventas/venta-invalida")?.estadoOperativo, "PENDIENTE_EFECTOS");
  assert.equal(db.docs.get("ventas/venta-posterior")?.estadoOperativo, "COMPLETO");
});

test("R1-B.2: una venta sin recibo fiscal canÃ³nico permanece pendiente sin inferir identidad desde la venta", async () => {
  const db = new FakeFirestore(); seed(db, "venta-sin-recibo");
  db.docs.delete("fiscal_comandos/recibo-venta-sin-recibo");
  const result = await reconciliarVentasPendientes(db as any);
  assert.deepEqual(result, { procesadas: 1, completadas: 0, pendientes: 1 });
  assert.equal(db.docs.get("ventas/venta-sin-recibo")?.estadoOperativo, "PENDIENTE_EFECTOS");
  assert.equal(count(db, "transacciones_financieras"), 0);
  assert.equal(count(db, "operaciones_comandos"), 0);
});
