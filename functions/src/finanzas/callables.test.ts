import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import { manejarAnularVentaOperativaV1, importesPagoVenta, type ContextoFinancieroOperativo } from "./anulaciones";

type Data = Record<string, any>;

class Snapshot {
  constructor(readonly id: string, private readonly value: Data | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}
class Ref {
  constructor(readonly path: string, private readonly db: FakeFirestore) {}
  get id() { return this.path.split("/").at(-1)!; }
  async get() { return new Snapshot(this.id, this.db.docs.get(this.path)); }
}
class Collection {
  constructor(private readonly name: string, private readonly db: FakeFirestore) {}
  doc(id: string) { return new Ref(`${this.name}/${id}`, this.db); }
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
    for (const [ref, data] of this.creates) this.db.docs.set(ref.path, structuredClone(data));
    for (const [ref, data] of this.updates) this.db.docs.set(ref.path, { ...this.db.docs.get(ref.path), ...structuredClone(data) });
  }
}
class FakeFirestore {
  readonly docs = new Map<string, Data>();
  private cola: Promise<void> = Promise.resolve();
  beforeNextTransaction: (() => void) | null = null;
  collection(name: string) { return new Collection(name, this); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const before = this.beforeNextTransaction;
    this.beforeNextTransaction = null;
    before?.();
    const previa = this.cola;
    let liberar!: () => void;
    this.cola = new Promise<void>((resolve) => { liberar = resolve; });
    await previa;
    try { const tx = new Transaction(this); const result = await work(tx); tx.commit(); return result; }
    finally { liberar(); }
  }
}

const empresaId = "empresa-a";
const actor: ContextoFinancieroOperativo = { empresaId, actorUid: "cajero-a", rol: "cajero" };
const envelope = (ventaId: string, suffix = "1") => ({ commandId: `anular-${ventaId}-${suffix}`, idempotencyKey: `idem-${ventaId}-${suffix}`, correlationId: `corr-${ventaId}`, causationId: ventaId, payload: { ventaId } });
const movimientoId = (ventaId: string, key: string) => crearIdentificadorInterno(empresaId, `movfin:${key.replace("{ventaId}", ventaId)}`);
const domain = (error: unknown, code: string) => error instanceof HttpsError && (error.details as { code?: string }).code === code;
function seedAuth(db: FakeFirestore, contexto: ContextoFinancieroOperativo = actor) {
  db.docs.set(`empresas/${contexto.empresaId}`, { estado: "activa" });
  db.docs.set(`membresias/${contexto.empresaId}_${contexto.actorUid}`, { empresaId: contexto.empresaId, uid: contexto.actorUid, rol: contexto.rol, permisos: ["pos"], estado: "activa", activo: true });
}
async function anular(db: FakeFirestore, contexto: ContextoFinancieroOperativo, data: ReturnType<typeof envelope>) {
  seedAuth(db, contexto);
  return manejarAnularVentaOperativaV1(db, { auth: { uid: contexto.actorUid, token: { empresaId: contexto.empresaId, rol: contexto.rol } }, data });
}

function seedCompleta(db: FakeFirestore, ventaId = "venta-1", saldo = 100) {
  db.docs.set(`ventas/${ventaId}`, { empresaId, estado: "pagada", estadoOperativo: "COMPLETO", metodoPago: "transferencia", totales: { total: 100 } });
  db.docs.set("cuentas_bancarias/bancolombia", { empresaId, saldo, claveOperativa: "bancolombia", nombre: "Banco" });
  const fuente = movimientoId(ventaId, "venta:{ventaId}:pago:0");
  db.docs.set(`transacciones_financieras/${fuente}`, { id: fuente, empresaId, ventaId, tipo: "ingreso", monto: 100, categoria: "ventas", cuentaDocumentoId: "bancolombia", cuentaClaveSnapshot: "bancolombia" });
  return fuente;
}
function count(db: FakeFirestore, collection: string) { return [...db.docs.keys()].filter(path => path.startsWith(`${collection}/`)).length; }

test("R1-B.1: las piernas se reconstruyen del hecho de pago fiscal congelado", () => {
  assert.deepEqual(importesPagoVenta({ metodoPago: "efectivo", totales: { total: 12000 } }), [12000]);
  assert.equal(importesPagoVenta({ metodoPago: "mixto", totales: { total: 12000 }, pagoMixtoDetalle: [{ monto: 7000 }, { monto: 4000 }] }), null);
});

test("R1-B.1: anulación pre-efectos no crea movimientos ni altera saldos", async () => {
  const db = new FakeFirestore();
  db.docs.set("ventas/pendiente", { empresaId, estado: "pagada", estadoOperativo: "PENDIENTE_EFECTOS" });
  const result = await anular(db, actor, envelope("pendiente"));
  assert.equal(result.estadoOperativo, "ANULADA_SIN_EFECTOS");
  assert.equal(db.docs.get("ventas/pendiente")?.estadoOperativo, "ANULADA_SIN_EFECTOS");
  assert.equal(count(db, "transacciones_financieras"), 0);
  assert.equal(count(db, "operaciones_comandos"), 1);
});

test("R1-B.1: cajero autorizado compensa post-efectos con nueva línea enlazada", async () => {
  const db = new FakeFirestore(); const fuente = seedCompleta(db);
  const result = await anular(db, actor, envelope("venta-1"));
  const key = movimientoId("venta-1", "anulacion:{ventaId}:pago:0");
  assert.equal(result.estadoOperativo, "ANULADA_CON_EFECTOS");
  assert.equal(db.docs.get("ventas/venta-1")?.estadoOperativo, "ANULADA_CON_EFECTOS");
  assert.equal(db.docs.get("cuentas_bancarias/bancolombia")?.saldo, 0);
  assert.equal(db.docs.get(`transacciones_financieras/${key}`)?.movimientoRelacionadoId, fuente);
  assert.equal(db.docs.get(`transacciones_financieras/${fuente}`)?.tipo, "ingreso");
});

test("R1-B.1: fondos insuficientes abortan atómicamente la compensación", async () => {
  const db = new FakeFirestore(); seedCompleta(db, "sin-fondos", 99); seedAuth(db); const before = structuredClone([...db.docs]);
  await assert.rejects(anular(db, actor, envelope("sin-fondos")), error => domain(error, "FONDOS_INSUFICIENTES"));
  assert.deepEqual([...db.docs], before);
});

test("R1-B.1: reintento y concurrencia devuelven un solo resultado y efecto", async () => {
  const db = new FakeFirestore(); seedCompleta(db, "idempotente"); const data = envelope("idempotente");
  const [first, second] = await Promise.all([anular(db, actor, data), anular(db, actor, data)]);
  assert.deepEqual(second, first);
  assert.equal(count(db, "transacciones_financieras"), 2);
  assert.equal(count(db, "operaciones_comandos"), 1);
  assert.equal(db.docs.get("cuentas_bancarias/bancolombia")?.saldo, 0);
});

test("R1-B.1: payload distinto con la misma identidad idempotente se rechaza", async () => {
  const db = new FakeFirestore();
  db.docs.set("ventas/payload-a", { empresaId, estado: "pagada", estadoOperativo: "PENDIENTE_EFECTOS" });
  db.docs.set("ventas/payload-b", { empresaId, estado: "pagada", estadoOperativo: "PENDIENTE_EFECTOS" });
  const primero = envelope("payload-a", "conflicto");
  await anular(db, actor, primero);
  await assert.rejects(anular(db, actor, { ...primero, payload: { ventaId: "payload-b" } }), error => domain(error, "COMMAND_ID_CONFLICT"));
  assert.equal(db.docs.get("ventas/payload-b")?.estadoOperativo, "PENDIENTE_EFECTOS");
});

test("R1-B.1: revalida empresa, membresÃ­a y permiso pos dentro de la transacciÃ³n", async () => {
  const casos: Array<{ codigo: string; mutar(db: FakeFirestore): void }> = [
    { codigo: "EMPRESA_NO_OPERATIVA", mutar: db => db.docs.set(`empresas/${empresaId}`, { estado: "suspendida" }) },
    { codigo: "TENANT_ACCESS_DENIED", mutar: db => db.docs.set(`membresias/${empresaId}_${actor.actorUid}`, { empresaId, uid: actor.actorUid, rol: actor.rol, permisos: ["pos"], estado: "revocada", activo: false }) },
    { codigo: "ROLE_FORBIDDEN", mutar: db => db.docs.set(`membresias/${empresaId}_${actor.actorUid}`, { empresaId, uid: actor.actorUid, rol: actor.rol, permisos: [], estado: "activa", activo: true }) },
  ];
  for (const escenario of casos) {
    const db = new FakeFirestore();
    db.docs.set("ventas/pendiente", { empresaId, estado: "pagada", estadoOperativo: "PENDIENTE_EFECTOS" });
    seedAuth(db);
    db.beforeNextTransaction = () => escenario.mutar(db);
    await assert.rejects(manejarAnularVentaOperativaV1(db, { auth: { uid: actor.actorUid, token: { empresaId, rol: actor.rol } }, data: envelope("pendiente", escenario.codigo) }), error => domain(error, escenario.codigo));
    assert.equal(db.docs.get("ventas/pendiente")?.estadoOperativo, "PENDIENTE_EFECTOS");
    assert.equal(count(db, "operaciones_comandos"), 0);
  }
});

test("R1-B.1: la ruta publicada conserva causationId en recibo, auditorÃ­a y movimiento", async () => {
  const db = new FakeFirestore(); seedCompleta(db, "trazable");
  const data = { ...envelope("trazable"), causationId: "causa-trazable" };
  await anular(db, actor, data);
  const recibo = [...db.docs.entries()].find(([path]) => path.startsWith("operaciones_comandos/"))?.[1];
  const auditoria = [...db.docs.entries()].find(([path]) => path.startsWith("operaciones_auditoria/"))?.[1];
  const movimiento = [...db.docs.entries()].find(([path, value]) => path.startsWith("transacciones_financieras/") && value.categoria === "anulacion_venta")?.[1];
  assert.equal(recibo?.causationId, "causa-trazable");
  assert.equal(auditoria?.causationId, "causa-trazable");
  assert.equal(auditoria?.comando?.causationId, "causa-trazable");
  assert.equal(movimiento?.causationId, "causa-trazable");
});

test("R1-B.1: tenant ajeno y rol no autorizado no pueden anular", async () => {
  const db = new FakeFirestore(); seedCompleta(db, "protegida");
  const tenantAjeno = { ...actor, empresaId: "empresa-b" }; const supervisor = { ...actor, actorUid: "supervisor-a", rol: "supervisor" };
  seedAuth(db); seedAuth(db, tenantAjeno); seedAuth(db, supervisor); const before = structuredClone([...db.docs]);
  await assert.rejects(anular(db, tenantAjeno, envelope("protegida")), error => domain(error, "VENTA_NO_ENCONTRADA"));
  await assert.rejects(anular(db, supervisor, envelope("protegida", "rol")), error => domain(error, "ROL_NO_AUTORIZADO"));
  assert.deepEqual([...db.docs], before);
});

test("R1-B.1: un conflicto de línea compensatoria no deja commit parcial", async () => {
  const db = new FakeFirestore(); seedCompleta(db, "colision");
  const destino = movimientoId("colision", "anulacion:{ventaId}:pago:0");
  db.docs.set(`transacciones_financieras/${destino}`, { empresaId, legado: true });
  seedAuth(db); const before = structuredClone([...db.docs]);
  await assert.rejects(anular(db, actor, envelope("colision")));
  assert.deepEqual([...db.docs], before);
});
