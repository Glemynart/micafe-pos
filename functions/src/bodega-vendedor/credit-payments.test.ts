import assert from "node:assert/strict";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { ejecutarConsultarCarteraClienteBodegaV1, ejecutarRegistrarAbonoVentaBodegaV1, normalizarComandoAbonoVentaBodega } from "./credit-payments";
import type { ContextoFinancieroOperativo } from "../bodega/operational-core";
import { SCHEMA_VERSION_VENTA_BODEGA_CREDITO } from "./ventas-contract";
import { crearIdentificadorInterno } from "../turnos/identificadores";

type Data = Record<string, any>;
class Snapshot {
  constructor(readonly id: string, readonly ref: Ref, private readonly value: Data | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}
class Query {
  constructor(private readonly db: FakeDb, private readonly name: string, private readonly filters: Array<[string, unknown]> = [], private readonly maxDocs = Number.MAX_SAFE_INTEGER) {}
  where(field: string, _operator: string, value: unknown) { return new Query(this.db, this.name, [...this.filters, [field, value]], this.maxDocs); }
  limit(value: number) { return new Query(this.db, this.name, this.filters, value); }
  get() {
    const prefix = `${this.name}/`;
    const docs = [...this.db.docs.entries()]
      .filter(([path, value]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/")
        && this.filters.every(([field, expected]) => value[field] === expected))
      .slice(0, this.maxDocs)
      .map(([path, value]) => new Snapshot(path.slice(prefix.length), new Ref(path, this.db), value));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}
class Ref {
  constructor(readonly path: string, private readonly db: FakeDb) {}
  get id() { return this.path.split("/").at(-1)!; }
  collection(name: string) { return new Collection(this.db, `${this.path}/${name}`); }
  async get() { return new Snapshot(this.id, this, this.db.docs.get(this.path)); }
}
class Collection extends Query {
  constructor(private readonly db: FakeDb, private readonly name: string) { super(db, name); }
  doc(id: string) { return new Ref(`${this.name}/${id}`, this.db); }
}
class Transaction {
  private readonly creates: Array<[Ref, Data]> = [];
  private readonly updates: Array<[Ref, Data]> = [];
  constructor(private readonly db: FakeDb) {}
  async get(ref: Ref | Query): Promise<any> { return ref instanceof Query ? ref.get() : new Snapshot(ref.id, ref, this.db.docs.get(ref.path)); }
  create(ref: Ref, data: Data) {
    if (this.db.docs.has(ref.path) || this.creates.some(([entry]) => entry.path === ref.path)) throw new Error("already-exists");
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
class FakeDb {
  readonly docs = new Map<string, Data>();
  private queue: Promise<void> = Promise.resolve();
  collection(name: string) { return new Collection(this, name); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const previous = this.queue; let release!: () => void; this.queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { const tx = new Transaction(this); const result = await work(tx); tx.commit(); return result; }
    finally { release(); }
  }
}

const empresaId = "empresa-credito-a";
const actorUid = "vendedor-credito-a";
const contexto: ContextoFinancieroOperativo = { empresaId, actorUid, rol: "vendedor" };
const contextoCartera = (tenant = empresaId) => ({ empresaId: tenant, rol: "vendedor", permisos: ["sell"], ventasHabilitadas: true, clientesHabilitados: true });
const command = (suffix: string, payload: Record<string, unknown> = {}) => ({
  commandId: `abono-${suffix}`, idempotencyKey: `idem-${suffix}`, correlationId: `corr-${suffix}`, causationId: null,
  payload: { ventaId: "venta-credito-a", montoCOP: 4000, metodoPago: "transferencia", ...payload },
});
const accountId = (method: string) => method === "transferencia" ? "bancolombia" : "caja-principal";
const movements = (db: FakeDb) => [...db.docs.keys()].filter(path => path.startsWith("transacciones_financieras/")).length;
const domain = (error: unknown, code: string) => error instanceof HttpsError && (error.details as { code?: string }).code === code;

function seed(overrides: { saldoPendienteCOP?: number; totalAbonadoCOP?: number; saldoCliente?: number } = {}) {
  const db = new FakeDb();
  db.docs.set(`empresas/${empresaId}`, { estado: "activa", esFundacional: true });
  db.docs.set(`membresias/${empresaId}_${actorUid}`, { empresaId, uid: actorUid, rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true });
  db.docs.set(`configuraciones/${empresaId}`, { empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["sell"] } });
  db.docs.set("clientes/cliente-credito-a", { empresaId, activo: true, nombre: "Tienda", saldoPendienteBodegaCOP: overrides.saldoCliente ?? 10000 });
  db.docs.set("ventas/venta-credito-a", {
    id: "venta-credito-a", empresaId, schemaVersion: SCHEMA_VERSION_VENTA_BODEGA_CREDITO,
    clienteId: "cliente-credito-a", cajeroId: actorUid, estado: "pendiente", estadoOperativo: "COMPLETO", metodoPago: "cuenta_cobro",
    totales: { total: 10000 }, totalAbonadoCOP: overrides.totalAbonadoCOP ?? 0,
    saldoPendienteCOP: overrides.saldoPendienteCOP ?? 10000, items: [{ costoUnitario: 500 }],
  });
  db.docs.set(`cuentas_bancarias/${accountId("transferencia")}`, { id: accountId("transferencia"), empresaId, claveOperativa: "bancolombia", saldo: 0, nombre: "Banco", estado: "activa" });
  db.docs.set(`cuentas_bancarias/${accountId("efectivo")}`, { id: accountId("efectivo"), empresaId, claveOperativa: "caja-principal", saldo: 0, nombre: "Caja", estado: "activa" });
  return db;
}

test("abono parcial append-only actualiza saldos e idempotencia sin exponer costos en la consulta", async () => {
  const db = seed();
  const reciboHistorico = { version: "BODEGA_RECIBO_INTERNO_V1", folioInterno: "BOD-000001", saldoInicialCOP: 10000, fechaConfirmacionIso: "2026-10-30T15:00:00.000Z" };
  db.docs.get("ventas/venta-credito-a")!.reciboInterno = reciboHistorico;
  const data = command("uno");
  const first = await ejecutarRegistrarAbonoVentaBodegaV1(db, contexto, data);
  const replay = await ejecutarRegistrarAbonoVentaBodegaV1(db, contexto, data);
  assert.deepEqual(replay, first);
  assert.equal(first.saldoPendienteCOP, 6000);
  assert.equal(db.docs.get("ventas/venta-credito-a")?.totalAbonadoCOP, 4000);
  assert.deepEqual(db.docs.get("ventas/venta-credito-a")?.reciboInterno, reciboHistorico);
  assert.equal(db.docs.get("clientes/cliente-credito-a")?.saldoPendienteBodegaCOP, 6000);
  assert.equal(db.docs.get("cuentas_bancarias/bancolombia")?.saldo, 4000);
  assert.equal(movements(db), 1);
  assert.equal([...db.docs.keys()].filter(path => path.includes("/abonos_bodega/")).length, 1);
  const cartera = await ejecutarConsultarCarteraClienteBodegaV1(db, contextoCartera(), { clienteId: "cliente-credito-a" });
  assert.deepEqual(cartera, { clienteId: "cliente-credito-a", saldoPendienteCOP: 6000, facturas: [{
    ventaId: "venta-credito-a", fecha: null, totalCOP: 10000, totalAbonadoCOP: 4000,
    saldoPendienteCOP: 6000, fechaCompromisoPagoLocal: null,
  }] });
  assert.equal(JSON.stringify(cartera).includes("costoUnitario"), false);
});

test("pago final exacto cierra venta y compromisos posteriores conservan historial", async () => {
  const db = seed();
  await ejecutarRegistrarAbonoVentaBodegaV1(db, contexto, command("uno", { fechaCompromisoPagoLocal: "2026-11-02" }));
  await ejecutarRegistrarAbonoVentaBodegaV1(db, contexto, command("dos", { montoCOP: 6000, fechaCompromisoPagoLocal: "2026-11-09" }));
  const venta = db.docs.get("ventas/venta-credito-a");
  assert.equal(venta?.estado, "pagada");
  assert.equal(venta?.totalAbonadoCOP, 10000);
  assert.equal(venta?.saldoPendienteCOP, 0);
  assert.equal(venta?.fechaCompromisoPagoLocal, "2026-11-09");
  assert.equal([...db.docs.keys()].filter(path => path.includes("/compromisos_pago_bodega/")).length, 2);
  assert.equal(movements(db), 2);
});

test("sobrepago, vendedor distinto y saldo agregado inconsistente fallan sin escrituras", async () => {
  const sobrepago = seed();
  const before = [...sobrepago.docs.entries()];
  await assert.rejects(ejecutarRegistrarAbonoVentaBodegaV1(sobrepago, contexto, command("alto", { montoCOP: 10001 })), error => domain(error, "ABONO_SUPERA_SALDO"));
  assert.deepEqual([...sobrepago.docs.entries()], before);

  const ajeno = seed();
  await assert.rejects(ejecutarRegistrarAbonoVentaBodegaV1(ajeno, { ...contexto, actorUid: "otro-vendedor" }, command("ajeno")), error => domain(error, "TENANT_ACCESS_DENIED"));

  const inconsistent = seed({ saldoCliente: 1000 });
  const beforeInconsistent = [...inconsistent.docs.entries()];
  await assert.rejects(ejecutarRegistrarAbonoVentaBodegaV1(inconsistent, contexto, command("saldo")), error => domain(error, "SALDO_CLIENTE_INCONSISTENTE"));
  assert.deepEqual([...inconsistent.docs.entries()], beforeInconsistent);
});

test("la lectura de cartera falla cerrada si la venta o el agregado del cliente no coinciden", async () => {
  const agregado = seed({ saldoCliente: 9000 });
  await assert.rejects(ejecutarConsultarCarteraClienteBodegaV1(agregado, contextoCartera(), { clienteId: "cliente-credito-a" }), error => domain(error, "SALDO_CLIENTE_INCONSISTENTE"));
  const venta = seed();
  venta.docs.set("ventas/venta-credito-a", { ...venta.docs.get("ventas/venta-credito-a"), totales: { total: 10000 }, saldoPendienteCOP: 9000 });
  await assert.rejects(ejecutarConsultarCarteraClienteBodegaV1(venta, contextoCartera(), { clienteId: "cliente-credito-a" }), error => domain(error, "SALDO_VENTA_INCONSISTENTE"));
});

test("efectivo sin turno es permitido, pero una venta de otro tenant no es visible", async () => {
  const db = seed();
  const data = command("cash", { metodoPago: "efectivo", montoCOP: 3000 });
  const result = await ejecutarRegistrarAbonoVentaBodegaV1(db, contexto, data);
  assert.equal(result.turnoId, null);
  assert.equal(db.docs.get("transacciones_financieras/" + result.movimientoFinancieroId)?.turnoId, null);
  await assert.rejects(ejecutarConsultarCarteraClienteBodegaV1(db, contextoCartera("empresa-ajena"), { clienteId: "cliente-credito-a" }), error => domain(error, "CLIENTE_NO_ENCONTRADO"));
});

test("la lectura de cartera exige venta, clientes y permiso sell activos", async () => {
  const db = seed();
  for (const overrides of [
    { permisos: [] }, { ventasHabilitadas: false }, { clientesHabilitados: false }, { rol: "admin" },
  ]) {
    await assert.rejects(ejecutarConsultarCarteraClienteBodegaV1(db, { ...contextoCartera(), ...overrides }, { clienteId: "cliente-credito-a" }), error => domain(error, "ROL_VENDEDOR_REQUERIDO"));
  }
});

test("otro vendedor activo del mismo tenant puede registrar el abono que recibió", async () => {
  const db = seed();
  const otroUid = "vendedor-credito-b";
  db.docs.set(`membresias/${empresaId}_${otroUid}`, { empresaId, uid: otroUid, rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true });
  const result = await ejecutarRegistrarAbonoVentaBodegaV1(db, { ...contexto, actorUid: otroUid }, command("recibido-por-otro", { montoCOP: 2500 }));
  assert.equal(result.saldoPendienteCOP, 7500);
  const recibo = [...db.docs.values()].find(value => value.commandId === "abono-recibido-por-otro" && value.actor?.uid === otroUid);
  assert.ok(recibo, "el recibo idempotente debe atribuir el abono al vendedor que lo registró");
  assert.equal(db.docs.get("ventas/venta-credito-a")?.cajeroId, actorUid);
});

test("contrato de abono rechaza importes, fechas y campos de autoridad inválidos", () => {
  assert.equal(normalizarComandoAbonoVentaBodega(command("valid", { fechaCompromisoPagoLocal: "2026-11-09" })).payload.fechaCompromisoPagoLocal, "2026-11-09");
  for (const invalid of [
    command("zero", { montoCOP: 0 }), command("negative", { montoCOP: -1 }), command("decimal", { montoCOP: 1.5 }),
    command("method", { metodoPago: "cheque" }), command("date", { fechaCompromisoPagoLocal: "2026-02-30" }),
    { ...command("tamper"), payload: { ...command("tamper").payload, empresaId: "other" } },
  ]) assert.throws(() => normalizarComandoAbonoVentaBodega(invalid));
});

const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
test("ADR-091 Emulator: abonos concurrentes no sobrepagan ni pierden saldo", { skip: !FIRESTORE_EMULATOR_HOST }, async () => {
  if (!FIRESTORE_EMULATOR_HOST?.startsWith("127.0.0.1:") || process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("ADR-091 requiere Firestore Emulator local sin credenciales reales.");
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const empresaId = `empresa-credito-${suffix}`;
  const actorUid = `vendedor-credito-${suffix}`;
  const clienteId = `cliente-${suffix}`;
  const ventaId = `venta-${suffix}`;
  const accountId = crearIdentificadorInterno(empresaId, "cuenta:bancolombia");
  const app = initializeApp({ projectId: "demo-bodega-credit-payments" }, `credit-payments-${suffix}`);
  const db = getFirestore(app);
  const context: ContextoFinancieroOperativo = { empresaId, actorUid, rol: "vendedor" };
  try {
    await Promise.all([
      db.collection("empresas").doc(empresaId).set({ estado: "activa", esFundacional: false }),
      db.collection("membresias").doc(`${empresaId}_${actorUid}`).set({ empresaId, uid: actorUid, rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true }),
      db.collection("configuraciones").doc(empresaId).set({ empresaId, vertical: "BODEGA_MVP1", modulos: { habilitados: ["sell"] } }),
      db.collection("clientes").doc(clienteId).set({ empresaId, activo: true, saldoPendienteBodegaCOP: 10000 }),
      db.collection("ventas").doc(ventaId).set({
        id: ventaId, empresaId, schemaVersion: SCHEMA_VERSION_VENTA_BODEGA_CREDITO,
        clienteId, cajeroId: actorUid, estado: "pendiente", estadoOperativo: "COMPLETO", metodoPago: "cuenta_cobro",
        totales: { total: 10000 }, totalAbonadoCOP: 0, saldoPendienteCOP: 10000,
      }),
      db.collection("cuentas_bancarias").doc(accountId).set({ id: accountId, empresaId, claveOperativa: "bancolombia", saldo: 0, nombre: "Banco", estado: "activa" }),
    ]);
    const make = (suffixCommand: string) => ({
      commandId: `abono-${suffixCommand}-${suffix}`, idempotencyKey: `idem-${suffixCommand}-${suffix}`,
      correlationId: `corr-${suffixCommand}-${suffix}`, causationId: null,
      payload: { ventaId, montoCOP: 7000, metodoPago: "transferencia" },
    });
    const results = await Promise.allSettled([
      ejecutarRegistrarAbonoVentaBodegaV1(db, context, make("uno")),
      ejecutarRegistrarAbonoVentaBodegaV1(db, context, make("dos")),
    ]);
    const fulfilled = results.filter(result => result.status === "fulfilled");
    const rejected = results.filter(result => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(domain((rejected[0] as PromiseRejectedResult).reason, "ABONO_SUPERA_SALDO"), true);
    const [venta, cliente, cuenta, abonos, movimientos, recibos] = await Promise.all([
      db.collection("ventas").doc(ventaId).get(),
      db.collection("clientes").doc(clienteId).get(),
      db.collection("cuentas_bancarias").doc(accountId).get(),
      db.collection("ventas").doc(ventaId).collection("abonos_bodega").get(),
      db.collection("transacciones_financieras").where("empresaId", "==", empresaId).where("categoria", "==", "cuentas_cobro").get(),
      db.collection("operaciones_comandos").where("empresaId", "==", empresaId).get(),
    ]);
    assert.equal(venta.data()?.totalAbonadoCOP, 7000);
    assert.equal(venta.data()?.saldoPendienteCOP, 3000);
    assert.equal(cliente.data()?.saldoPendienteBodegaCOP, 3000);
    assert.equal(cuenta.data()?.saldo, 7000);
    assert.equal(abonos.size, 1);
    assert.equal(movimientos.size, 1);
    assert.equal(recibos.size, 1);
  } finally {
    await deleteApp(app);
  }
});
