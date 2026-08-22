import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import { ejecutarAplicarEfectosVentaOperativaV1, ejecutarAplicarEfectosVentaSistemaWompiV1, ejecutarCerrarTurnoOperativoV1, type ContextoFinancieroOperativo } from "./callables";

type Data = Record<string, any>;

class Snapshot {
  constructor(readonly id: string, readonly ref: Ref, private readonly value: Data | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}
class Ref {
  constructor(readonly path: string, private readonly db: FakeFirestore) {}
  get id() { return this.path.split("/").at(-1)!; }
}
class Query {
  constructor(private readonly name: string, private readonly db: FakeFirestore, private readonly filters: Array<[string, unknown]> = []) {}
  where(field: string, op: "==", value: unknown) {
    assert.equal(op, "==");
    return new Query(this.name, this.db, [...this.filters, [field, value]]);
  }
  snapshot() {
    const prefix = `${this.name}/`;
    const docs = [...this.db.docs.entries()]
      .filter(([path, data]) => path.startsWith(prefix) && this.filters.every(([field, value]) => data[field] === value))
      .map(([path, data]) => new Snapshot(path.slice(prefix.length), new Ref(path, this.db), data));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}
class Collection extends Query {
  constructor(private readonly name: string, private readonly db: FakeFirestore) { super(name, db); }
  doc(id?: string) { return new Ref(`${this.name}/${id ?? `${this.name}-${this.db.nextId()}`}`, this.db); }
}
class Transaction {
  private readonly creates: Array<[Ref, Data]> = [];
  private readonly updates: Array<[Ref, Data]> = [];
  private readonly deletes: Ref[] = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: Ref | Query) {
    if (ref instanceof Query) return ref.snapshot();
    return new Snapshot(ref.id, ref, this.db.docs.get(ref.path));
  }
  create(ref: Ref, data: Data) {
    if (this.db.docs.has(ref.path) || this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("already-exists");
    this.creates.push([ref, data]);
  }
  update(ref: Ref, data: Data) {
    if (!this.db.docs.has(ref.path)) throw new Error("not-found");
    this.updates.push([ref, data]);
  }
  delete(ref: Ref) { this.deletes.push(ref); }
  commit() {
    for (const [ref, data] of this.creates) this.db.docs.set(ref.path, structuredClone(data));
    for (const [ref, data] of this.updates) this.db.docs.set(ref.path, { ...this.db.docs.get(ref.path), ...structuredClone(data) });
    for (const ref of this.deletes) this.db.docs.delete(ref.path);
  }
}
class FakeFirestore {
  readonly docs = new Map<string, Data>();
  private sequence = 0;
  private queue: Promise<void> = Promise.resolve();
  nextId() { this.sequence += 1; return String(this.sequence); }
  collection(name: string) { return new Collection(name, this); }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try { const tx = new Transaction(this); const result = await work(tx); tx.commit(); return result; }
    finally { release(); }
  }
}

const empresaId = "empresa-cierre";
const actor: ContextoFinancieroOperativo = { empresaId, actorUid: "cajero-a", rol: "cajero" };
const cierre = (suffix = "1", payload: Record<string, unknown> = {}) => ({
  commandId: `cierre-${suffix}`, idempotencyKey: `idem-cierre-${suffix}`, correlationId: `corr-cierre-${suffix}`,
  payload: { turnoId: "turno-a", efectivoContado: 130, ...payload },
});
const domain = (error: unknown, code: string) => error instanceof HttpsError && (error.details as { code?: string }).code === code;
const count = (db: FakeFirestore, collection: string) => [...db.docs.keys()].filter(path => path.startsWith(`${collection}/`)).length;

function seed(db: FakeFirestore, options: { relevo?: boolean; efectivo?: boolean } = {}) {
  db.docs.set(`empresas/${empresaId}`, { estado: "activa", esFundacional: false });
  db.docs.set(`configuraciones/${empresaId}`, { caja: { umbralAlertaFaltante: 20 } });
  db.docs.set(`membresias/${empresaId}_${actor.actorUid}`, {
    empresaId, uid: actor.actorUid, rol: actor.rol, permisos: ["shifts", "sell"], estado: "activa", activo: true,
  });
  const cajaId = crearIdentificadorInterno(empresaId, "cuenta:caja-principal");
  const fuerteId = crearIdentificadorInterno(empresaId, "cuenta:caja-fuerte");
  db.docs.set(`cuentas_bancarias/${cajaId}`, { id: cajaId, empresaId, claveOperativa: "caja-principal", saldo: 160, nombre: "Caja" });
  db.docs.set(`cuentas_bancarias/${fuerteId}`, { id: fuerteId, empresaId, claveOperativa: "caja-fuerte", saldo: 50, nombre: "Fuerte" });
  db.docs.set("turnos/turno-a", { id: "turno-a", empresaId, cajeroId: actor.actorUid, cajeroNombre: "Cajero A", estado: "abierto", baseApertura: 100 });
  db.docs.set(`turnos_activos/${crearIdentificadorInterno(empresaId, actor.actorUid)}`, { empresaId, cajeroId: actor.actorUid, turnoId: "turno-a" });
  const movimiento = (id: string, tipo: "ingreso" | "egreso", monto: number, categoria: string, turnoId = "turno-a", cuentaDocumentoId = cajaId) => db.docs.set(`transacciones_financieras/${id}`, { id, empresaId, tipo, monto, categoria, turnoId, cuentaDocumentoId });
  movimiento("venta-efectivo", "ingreso", 40, "ventas");
  movimiento("egreso-caja", "egreso", 10, "egreso");
  movimiento("ajeno", "ingreso", 999, "ventas", "otro-turno");
  movimiento("banco", "ingreso", 999, "ventas", "turno-a", "otra-cuenta");
  db.docs.set("ventas/venta-efectivo", { empresaId, turnoId: "turno-a", estadoOperativo: "COMPLETO", metodoPago: "efectivo", totales: { total: 40 } });
  db.docs.set("ventas/venta-tarjeta", { empresaId, turnoId: "turno-a", estadoOperativo: "COMPLETO", metodoPago: "tarjeta", totales: { total: 70 } });
  db.docs.set("egresos/egreso-caja", { empresaId, turnoId: "turno-a", monto: 10, estado: "confirmado" });
  if (options.relevo) {
    db.docs.set(`membresias/${empresaId}_cajero-b`, { empresaId, uid: "cajero-b", rol: "cajero", permisos: ["shifts"], estado: "activa", activo: true });
    db.docs.set("usuarios/cajero-b", { nombre: "Cajero B" });
  }
  return { cajaId, fuerteId };
}

test("R1-B.3: reconstruye el arqueo del ledger de caja tenant-safe y congela los totales", async () => {
  const db = new FakeFirestore(); const { cajaId, fuerteId } = seed(db);
  const result = await ejecutarCerrarTurnoOperativoV1(db, actor, cierre());
  const turno = db.docs.get("turnos/turno-a")!;
  assert.equal(result.efectivoEsperado, 130);
  assert.deepEqual({ ventasEfectivo: turno.ventasEfectivo, ventasOtrosMetodos: turno.ventasOtrosMetodos, totalEgresos: turno.totalEgresos, totalEsperadoEfectivo: turno.totalEsperadoEfectivo, diferenciaEfectivo: turno.diferenciaEfectivo, depositoNeto: turno.depositoNeto }, { ventasEfectivo: 40, ventasOtrosMetodos: 70, totalEgresos: 10, totalEsperadoEfectivo: 130, diferenciaEfectivo: 0, depositoNeto: 30 });
  assert.equal(db.docs.get(`cuentas_bancarias/${cajaId}`)?.saldo, 130);
  assert.equal(db.docs.get(`cuentas_bancarias/${fuerteId}`)?.saldo, 80);
  assert.equal(count(db, "transacciones_financieras"), 6);
  assert.equal(db.docs.has(`turnos_activos/${crearIdentificadorInterno(empresaId, actor.actorUid)}`), false);
});

test("R1-B.3: conserva nota, cierre definitivo y alerta de faltante desde configuración canónica", async () => {
  const db = new FakeFirestore(); seed(db);
  const result = await ejecutarCerrarTurnoOperativoV1(db, actor, {
    ...cierre("alerta", { efectivoContado: 100, relevoCajeroId: null }),
    motivo: "  Faltó efectivo; revisar comprobante 123.  ",
  });
  const turno = db.docs.get("turnos/turno-a")!;
  assert.equal(result.diferenciaEfectivo, -30);
  assert.equal(turno.notasCierre, "Faltó efectivo; revisar comprobante 123.");
  assert.equal(turno.esCierreDefinitivo, true);
  assert.equal(turno.umbralAlertaFaltante, 20);
  assert.equal(turno.alertaFaltante, true);
});

test("R1-B.3: depósito y sobrante se validan por saldo final, no por un débito intermedio", async () => {
  const db = new FakeFirestore(); const { cajaId } = seed(db);
  const result = await ejecutarCerrarTurnoOperativoV1(db, actor, cierre("sobrante", { efectivoContado: 250 }));
  assert.equal(result.diferenciaEfectivo, 120);
  assert.equal(db.docs.get(`cuentas_bancarias/${cajaId}`)?.saldo, 130);
  assert.equal([...db.docs.values()].filter(data => data.categoria === "sobrante_caja").length, 1);
});

test("R1-B.3: exige el candado coherente y un relevo elegible sin turno ni candado", async () => {
  const db = new FakeFirestore(); seed(db, { relevo: true });
  const result = await ejecutarCerrarTurnoOperativoV1(db, actor, cierre("relevo", { relevoCajeroId: "cajero-b" }));
  const relevo = db.docs.get(`turnos/${result.relevoTurnoId}`)!;
  assert.equal(relevo.cajeroId, "cajero-b");
  assert.equal(relevo.baseApertura, 100);
  assert.equal(db.docs.get(`turnos_activos/${crearIdentificadorInterno(empresaId, "cajero-b")}`)?.turnoId, result.relevoTurnoId);
  assert.equal(count(db, "transacciones_financieras"), 6);
});

test("R1-B.3: candado incoherente y reintento no producen un segundo cierre", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set(`turnos_activos/${crearIdentificadorInterno(empresaId, actor.actorUid)}`, { empresaId, cajeroId: actor.actorUid, turnoId: "otro" });
  await assert.rejects(ejecutarCerrarTurnoOperativoV1(db, actor, cierre("lock")), error => domain(error, "LOCK_CONFLICT"));
  const clean = new FakeFirestore(); seed(clean); const data = cierre("idem");
  const [first, second] = await Promise.all([ejecutarCerrarTurnoOperativoV1(clean, actor, data), ejecutarCerrarTurnoOperativoV1(clean, actor, data)]);
  assert.deepEqual(second, first);
  assert.equal(count(clean, "transacciones_financieras"), 6);
  assert.equal(count(clean, "operaciones_comandos"), 1);
});

test("R1-B.3: revalida empresa, membresía y capacidad shifts dentro de la transacción", async () => {
  const casos: Array<{ nombre: string; code: string; mutar(db: FakeFirestore): void }> = [
    {
      nombre: "empresa suspendida", code: "EMPRESA_NO_OPERATIVA",
      mutar: db => db.docs.set(`empresas/${empresaId}`, { estado: "suspendida", esFundacional: false }),
    },
    {
      nombre: "membresía revocada", code: "TENANT_ACCESS_DENIED",
      mutar: db => db.docs.set(`membresias/${empresaId}_${actor.actorUid}`, { empresaId, uid: actor.actorUid, rol: actor.rol, permisos: ["shifts"], estado: "revocada", activo: false }),
    },
    {
      nombre: "permiso shifts retirado", code: "ROLE_FORBIDDEN",
      mutar: db => db.docs.set(`membresias/${empresaId}_${actor.actorUid}`, { empresaId, uid: actor.actorUid, rol: actor.rol, permisos: [], estado: "activa", activo: true }),
    },
  ];

  for (const escenario of casos) {
    const db = new FakeFirestore(); seed(db); escenario.mutar(db);
    const before = structuredClone([...db.docs]);
    await assert.rejects(ejecutarCerrarTurnoOperativoV1(db, actor, cierre(escenario.nombre)), error => domain(error, escenario.code));
    assert.deepEqual([...db.docs], before, escenario.nombre);
  }
});

test("R1-B.2: una empresa no fundacional acredita la cuenta reservada mediante su clave lÃ³gica", async () => {
  const db = new FakeFirestore(); const { cajaId } = seed(db);
  db.docs.set("ventas/venta-pendiente", {
    empresaId,
    turnoId: "turno-a",
    estadoOperativo: "PENDIENTE_EFECTOS",
    metodoPago: "efectivo",
    totales: { total: 40 },
    items: [{ id: "quick-efectivo", cantidad: 1 }],
  });
  const result = await ejecutarAplicarEfectosVentaOperativaV1(db, actor, {
    commandId: "efectos-tenant-safe", idempotencyKey: "idem-efectos-tenant-safe", correlationId: "corr-efectos-tenant-safe",
    payload: { ventaId: "venta-pendiente" },
  });
  assert.equal(result.ventaId, "venta-pendiente");
  assert.equal(db.docs.get(`cuentas_bancarias/${cajaId}`)?.saldo, 200);
  assert.equal(db.docs.has("cuentas_bancarias/caja-principal"), false);
});

function seedVentaOperativa(db: FakeFirestore) {
  const bancoId = crearIdentificadorInterno("empresa-venta", "cuenta:bancolombia");
  db.docs.set("empresas/empresa-venta", { estado: "activa", esFundacional: false });
  db.docs.set("membresias/empresa-venta_cajero-venta", { empresaId: "empresa-venta", uid: "cajero-venta", rol: "cajero", permisos: ["sell"], estado: "activa", activo: true });
  db.docs.set(`cuentas_bancarias/${bancoId}`, { id: bancoId, empresaId: "empresa-venta", saldo: 0, claveOperativa: "bancolombia", nombre: "Banco" });
  db.docs.set("productos/cafe-venta", { empresaId: "empresa-venta", espacioId: "cafeteria", nombre: "Cafe venta", stock: 1, secuenciaLedger: 0, costo: 10, unidad: "und" });
  db.docs.set("turnos/turno-venta", { empresaId: "empresa-venta", estado: "abierto" });
  return { bancoId };
}

const contextoVenta: ContextoFinancieroOperativo = { empresaId: "empresa-venta", actorUid: "cajero-venta", rol: "cajero" };
const envelopeVenta = (ventaId: string) => ({
  commandId: `efectos-venta:${ventaId}`,
  idempotencyKey: `efectos-venta:${ventaId}`,
  correlationId: `corr-efectos-venta:${ventaId}`,
  causationId: `cmd_sale_${ventaId}`,
  payload: { ventaId },
});

test("P0-03: la Fase 2 server-side aplica inventario, tesoreria, incidencia y replay sin duplicar", async () => {
  const db = new FakeFirestore();
  const { bancoId } = seedVentaOperativa(db);
  db.docs.set("ventas/venta-server", {
    empresaId: "empresa-venta", estado: "pagada", estadoOperativo: "PENDIENTE_EFECTOS",
    turnoId: "turno-venta", metodoPago: "transferencia", totales: { total: 100 },
    items: [{ id: "cafe-venta", cantidad: 2 }],
  });

  const first = await ejecutarAplicarEfectosVentaOperativaV1(db, contextoVenta, envelopeVenta("venta-server"));
  const second = await ejecutarAplicarEfectosVentaOperativaV1(db, contextoVenta, envelopeVenta("venta-server"));

  assert.deepEqual(second, first);
  assert.equal(db.docs.get("ventas/venta-server")?.estadoOperativo, "COMPLETO");
  assert.equal(db.docs.get(`cuentas_bancarias/${bancoId}`)?.saldo, 100);
  assert.equal(db.docs.get("productos/cafe-venta")?.stock, -1);
  assert.equal(db.docs.get("productos/cafe-venta")?.secuenciaLedger, 2);
  assert.deepEqual(first.incidenciasInventario, [{ tipo: "stock_insuficiente", itemId: "cafe-venta", itemNombre: "Cafe venta", stockAnterior: 1, cantidadSolicitada: 2 }]);
  const apertura = db.docs.get("movimientos_inventario/inventario_inicial:producto:cafe-venta");
  const movimientoVenta = db.docs.get("movimientos_inventario/venta:venta-server:producto:cafe-venta:0");
  assert.equal(apertura?.tipo, "inventario_inicial");
  assert.equal(apertura?.secuenciaArticulo, 1);
  assert.equal(movimientoVenta?.tipo, "venta");
  assert.equal(movimientoVenta?.secuenciaArticulo, 2);
  assert.equal(movimientoVenta?.cantidad, -2);
  assert.equal(movimientoVenta?.costoUnitario, 10);
  assert.equal(movimientoVenta?.saldoCantidadDespues, -1);
  assert.equal(movimientoVenta?.referenciaColeccion, "ventas");
  assert.equal(movimientoVenta?.referenciaId, "venta-server");
  assert.equal(count(db, "transacciones_financieras"), 1);
  assert.equal(count(db, "movimientos_inventario"), 2);
  assert.equal(count(db, "operaciones_comandos"), 1);
  assert.equal(count(db, "operaciones_auditoria"), 1);
});

test("P1-09: un pago ya reclamado acredita la cuenta tenant-aware aunque se cierre la entrada pública", async () => {
  const db = new FakeFirestore();
  const empresaId = "empresa-wompi"; const cuentaId = crearIdentificadorInterno(empresaId, "cuenta:pasarela-reservas");
  db.docs.set(`empresas/${empresaId}`, { estado: "activa", esFundacional: false });
  db.docs.set(`configuraciones/${empresaId}`, { reservasPublicas: { habilitadas: false } });
  db.docs.set(`cuentas_bancarias/${cuentaId}`, { id: cuentaId, empresaId, saldo: 10, claveOperativa: "pasarela-reservas", nombre: "Pasarela" });
  db.docs.set("ventas/venta-wompi", { empresaId, estado: "pagada", estadoOperativo: "PENDIENTE_EFECTOS", metodoPago: "transferencia", cuentaClaveOperativa: "pasarela-reservas", totales: { total: 90 }, items: [{ id: "quick-reserva", cantidad: 1 }] });
  await ejecutarAplicarEfectosVentaSistemaWompiV1(db, { empresaId, actorUid: "wompi:tx-1", rol: "system" }, { commandId: "wompi-effects", idempotencyKey: "wompi-effects", correlationId: "wompi-corr", payload: { ventaId: "venta-wompi" } });
  assert.equal(db.docs.get(`cuentas_bancarias/${cuentaId}`)?.saldo, 100);
  assert.equal([...db.docs.values()].some(value => value?.cuentaDocumentoId === "bancolombia"), false);
});

test("P0-02: la Fase 2 procesa una venta DEMO sin snapshot fiscal ni consecutivo", async () => {
  const db = new FakeFirestore();
  const { bancoId } = seedVentaOperativa(db);
  db.docs.set("ventas/venta-demo-server", {
    empresaId: "empresa-venta", modoOperacion: "DEMO", referenciaOperacion: "DEMO-venta-demo-server",
    estado: "pagada", estadoOperativo: "PENDIENTE_EFECTOS", turnoId: "turno-venta",
    metodoPago: "transferencia", totales: { subtotalBase: 100, totalINC: 0, totalExcluido: 100, total: 100 },
    items: [{ id: "cafe-venta", cantidad: 1, precioUnitario: 100, subtotal: 100 }],
  });

  const result = await ejecutarAplicarEfectosVentaOperativaV1(db, contextoVenta, envelopeVenta("venta-demo-server"));

  assert.equal(result.ventaId, "venta-demo-server");
  assert.equal(db.docs.get("ventas/venta-demo-server")?.estadoOperativo, "COMPLETO");
  assert.equal(db.docs.get("ventas/venta-demo-server")?.modoOperacion, "DEMO");
  assert.equal(db.docs.get(`cuentas_bancarias/${bancoId}`)?.saldo, 100);
  assert.equal("snapshotFiscal" in db.docs.get("ventas/venta-demo-server")!, false);
  assert.equal("consecutivo" in db.docs.get("ventas/venta-demo-server")!, false);
});

test("P0-03: el cierre de pedido y comandas permanece dentro de la misma transaccion server-side", async () => {
  const db = new FakeFirestore();
  seedVentaOperativa(db);
  db.docs.set("pedidos_activos/pedido-server", { empresaId: "empresa-venta", estado: "abierto", activo: true, comandaIds: ["comanda-server"] });
  db.docs.set("comandas_cocina/comanda-server", { empresaId: "empresa-venta", pedidoId: "pedido-server", estado: "listo" });
  db.docs.set("ventas/venta-pedido-server", {
    empresaId: "empresa-venta", estado: "pagada", estadoOperativo: "PENDIENTE_EFECTOS",
    turnoId: "turno-venta", metodoPago: "transferencia", totales: { total: 50 },
    items: [{ id: "quick-pedido", cantidad: 1 }], pedidoId: "pedido-server",
  });

  const result = await ejecutarAplicarEfectosVentaOperativaV1(db, contextoVenta, envelopeVenta("venta-pedido-server"));

  assert.equal(result.pedidoId, "pedido-server");
  assert.equal(db.docs.get("pedidos_activos/pedido-server")?.estado, "pagado");
  assert.equal(db.docs.get("pedidos_activos/pedido-server")?.activo, false);
  assert.equal(db.docs.get("pedidos_activos/pedido-server")?.ventaId, "venta-pedido-server");
  assert.equal(db.docs.get("comandas_cocina/comanda-server")?.estado, "entregado");
  assert.equal(db.docs.get("ventas/venta-pedido-server")?.estadoOperativo, "COMPLETO");
});

test("P0-03: ventas no pagadas conservan inventario sin crear movimientos financieros", async () => {
  const db = new FakeFirestore();
  seedVentaOperativa(db);
  db.docs.set("ventas/venta-cuenta", {
    empresaId: "empresa-venta", estado: "pendiente", estadoOperativo: "PENDIENTE_EFECTOS",
    metodoPago: "cuenta_cobro", totales: { total: 50 }, items: [{ id: "quick-cuenta", cantidad: 1 }],
  });

  await ejecutarAplicarEfectosVentaOperativaV1(db, contextoVenta, envelopeVenta("venta-cuenta"));

  assert.equal(db.docs.get("ventas/venta-cuenta")?.estadoOperativo, "COMPLETO");
  assert.equal(count(db, "transacciones_financieras"), 0);
  assert.equal(count(db, "movimientos_inventario"), 0);
});

test("P0-03: una falla de validacion no deja efectos parciales y una membresia sin sell es rechazada", async () => {
  const db = new FakeFirestore();
  seedVentaOperativa(db);
  db.docs.set("ventas/venta-invalida", {
    empresaId: "empresa-venta", estado: "pagada", estadoOperativo: "PENDIENTE_EFECTOS",
    metodoPago: "transferencia", totales: { total: 50 }, items: [{ id: "articulo-inexistente", cantidad: 1 }],
  });
  const before = structuredClone([...db.docs]);
  await assert.rejects(ejecutarAplicarEfectosVentaOperativaV1(db, contextoVenta, envelopeVenta("venta-invalida")), error => domain(error, "ARTICULO_NO_ENCONTRADO"));
  assert.deepEqual([...db.docs], before);

  db.docs.set("membresias/empresa-venta_cajero-venta", { empresaId: "empresa-venta", uid: "cajero-venta", rol: "cajero", permisos: [], estado: "activa", activo: true });
  const beforePermission = structuredClone([...db.docs]);
  await assert.rejects(ejecutarAplicarEfectosVentaOperativaV1(db, contextoVenta, envelopeVenta("venta-invalida")), error => domain(error, "ROLE_FORBIDDEN"));
  assert.deepEqual([...db.docs], beforePermission);
});
