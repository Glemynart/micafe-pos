import assert from "node:assert/strict";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { ejecutarConfirmarVentaBodegaV1 } from "./ventas-confirmation";
import { crearHuellaSemantica, type ContextoFinancieroOperativo } from "../bodega/operational-core";
import { crearIdentificadorInterno } from "../turnos/identificadores";

type Data = Record<string, any>;
class Ref { constructor(readonly path: string, private readonly db?: FakeDb) {} get id() { return this.path.split("/").at(-1)!; } collection(name: string) { return new Collection(this.db!, `${this.path}/${name}`); } }
class Snap { constructor(readonly ref: Ref, private readonly value: Data | undefined) {} get id() { return this.ref.id; } get exists() { return this.value !== undefined; } data() { return this.value; } }
class Query { constructor(private db: FakeDb, private name: string, private filters: Array<[string, unknown]>) {} where(field: string, _op: string, value: unknown) { return new Query(this.db, this.name, [...this.filters, [field, value]]); } async get() { const docs = [...this.db.docs.entries()].filter(([path, data]) => path.startsWith(`${this.name}/`) && this.filters.every(([field, value]) => data[field] === value)).map(([path, data]) => new Snap(new Ref(path, this.db), data)); return { docs, size: docs.length }; } }
class Collection { constructor(private db: FakeDb, private name: string) {} doc(id: string) { return new Ref(`${this.name}/${id}`, this.db); } where(field: string, _op: string, value: unknown) { return new Query(this.db, this.name, [[field, value]]); } }
class Tx {
  creates: Array<[Ref, Data]> = []; updates: Array<[Ref, Data]> = [];
  sets: Array<[Ref, Data, boolean]> = [];
  constructor(private db: FakeDb) {}
  async get(ref: Ref | Query): Promise<any> { return ref instanceof Query ? ref.get() : new Snap(ref, this.db.docs.get(ref.path)); }
  create(ref: Ref, data: Data) { if (this.db.docs.has(ref.path) || this.creates.some(([r]) => r.path === ref.path)) throw new Error("already-exists"); this.creates.push([ref, structuredClone(data)]); }
  update(ref: Ref, data: Data) { if (!this.db.docs.has(ref.path)) throw new Error("not-found"); this.updates.push([ref, structuredClone(data)]); }
  set(ref: Ref, data: Data, options: { merge?: boolean } = {}) { this.sets.push([ref, data, options.merge === true]); }
  commit() {
    for (const [r, d] of this.creates) this.db.docs.set(r.path, d);
    for (const [r, d] of this.updates) this.db.docs.set(r.path, { ...this.db.docs.get(r.path), ...d });
    for (const [r, d, merge] of this.sets) {
      const current = this.db.docs.get(r.path) ?? {};
      const next = merge ? { ...current } : {};
      for (const [key, value] of Object.entries(d)) next[key] = value && typeof value === "object" && value.constructor?.name === "NumericIncrementTransform"
        ? Number(current[key] ?? 0) + Number((value as { operand: number }).operand) : value;
      this.db.docs.set(r.path, next);
    }
  }
}
class FakeDb {
  docs = new Map<string, Data>(); collection(name: string) { return new Collection(this, name); }
  async runTransaction<T>(work: (tx: Tx) => Promise<T>) { const tx = new Tx(this); const result = await work(tx); tx.commit(); return result; }
}
const empresaId = "empresa-u3c";
const contexto: ContextoFinancieroOperativo = { empresaId, actorUid: "vendedor-u3c", rol: "vendedor" };
const dominio = (error: unknown, code: string) => error instanceof HttpsError && (error.details as any)?.code === code;
function comando(overrides: Record<string, any> = {}) { return {
  commandId: "cmd-u3c", idempotencyKey: "idem-u3c", correlationId: "corr-u3c", causationId: null,
  ...overrides,
  payload: overrides.payload ?? { clienteId: "cliente-u3c", lineas: [{ productoId: "producto-u3c", presentacionId: "caja-u3c", cantidad: 2 }], metodoPago: "efectivo", montoRecibidoCOP: 50000, solicitudId: "solicitud-u3c" },
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
  db.docs.set(`membresias/${empresaId}_admin-u3c`, { empresaId, uid: "admin-u3c", rol: "admin", permisos: ["sell"], estado: "activa", activo: true });
  const intentLineas = [{ productoId: "producto-u3c", presentacionId: "caja-u3c", cantidad: 2 }];
  const commercialLine = { productoId: "producto-u3c", productoNombre: "Producto", unidadBase: "unidad", presentacionId: "caja-u3c", presentacionNombre: "Caja", cantidad: 2, factorUnidadBase: 24, cantidadUnidadBase: 48, canal: "tienda", precioBasePresentacionCOP: 20000, precioPresentacionCOP: 20000, ofertaId: null, subtotalCOP: 40000 };
  const huellaComercial = crearHuellaSemantica({ clienteId: "cliente-u3c", lineas: [commercialLine], totalCOP: 40000 });
  db.docs.set(`empresas/${empresaId}/solicitudes_venta_bodega/solicitud-u3c`, {
    solicitudId: "solicitud-u3c", empresaId, solicitanteUid: contexto.actorUid, clienteId: "cliente-u3c", intentoLineas: intentLineas,
    lineas: [commercialLine], totalCOP: 40000, huellaComercial, revision: 1, estado: "APROBADA",
    aprobacion: { actorUid: "admin-u3c", revision: 1, totalCOP: 40000, huellaComercial, expiraEn: Timestamp.fromMillis(Date.now() + 60_000) },
  });
}

function seedAgendaReservation(db: FakeDb, expiraEn: Timestamp) {
  const programacionId = "agenda-u3c";
  const reservaId = crearIdentificadorInterno(empresaId, `agenda-hold:${programacionId}:producto-u3c`);
  const solicitudPath = `empresas/${empresaId}/solicitudes_venta_bodega/solicitud-u3c`;
  db.docs.set(solicitudPath, {
    ...db.docs.get(solicitudPath), programacionId, reservaIds: [reservaId],
  });
  db.docs.set("productos/producto-u3c", { ...db.docs.get("productos/producto-u3c"), stockReservado: 48 });
  db.docs.set(`empresas/${empresaId}/agenda_pedidos_bodega/${programacionId}`, {
    empresaId, programacionId, solicitanteUid: contexto.actorUid, solicitudId: "solicitud-u3c",
    estado: "CONVERTIDA_A_SOLICITUD", revision: 3, reservaIds: [reservaId],
    lineas: [{ productoId: "producto-u3c", presentacionId: "caja-u3c", cantidad: 2, cantidadUnidadBase: 48 }],
  });
  db.docs.set(`empresas/${empresaId}/reservas_stock_bodega/${reservaId}`, {
    empresaId, programacionId, productoId: "producto-u3c", cantidadUnidadBase: 48,
    estado: "ACTIVA", expiraEn,
  });
  return { programacionId, reservaId };
}

test("U3-C: efectivo completa una venta Bodega con 48 unidades base, caja, turno e idempotencia", async () => {
  const db = new FakeDb(); seed(db);
  const result = await ejecutarConfirmarVentaBodegaV1(db, contexto, comando()) as any;
  assert.equal(result.estadoOperativo, "COMPLETO"); assert.equal(result.total, 40000); assert.equal(result.turnoId, "turno-u3c");
  assert.equal(result.montoRecibidoCOP, 50000); assert.equal(result.cambioCOP, 10000);
  assert.equal(result.reciboInterno.folioInterno, "BOD-000001");
  assert.equal(result.reciboInterno.consecutivo, 1);
  assert.equal(result.reciboInterno.totalCOP, 40000);
  assert.equal(result.reciboInterno.cliente.nombre, "Tienda");
  assert.equal("costoPresentacionCOP" in result.reciboInterno.lineas[0], false);
  const venta = db.docs.get(`ventas/${result.ventaId}`)!;
  assert.equal(venta.schemaVersion, "BODEGA_MVP1_V1"); assert.equal(venta.items[0].cantidadUnidadBase, 48); assert.equal(venta.estadoOperativo, "COMPLETO");
  assert.equal(venta.cajeroId, contexto.actorUid);
  assert.deepEqual(venta.pago, { metodo: "efectivo", montoRecibidoCOP: 50000, cambioCOP: 10000 });
  assert.equal(db.docs.get(`empresas/${empresaId}/solicitudes_venta_bodega/solicitud-u3c`)?.estado, "EJECUTADA");
  assert.equal(db.docs.get(`empresas/${empresaId}/bodega_senales/disponibilidad`)?.version, 1);
  assert.equal(db.docs.get(`empresas/${empresaId}/bodega_senales/solicitudes_admin`)?.version, 1);
  assert.equal(db.docs.get(`empresas/${empresaId}/bodega_senales_vendedor/${contexto.actorUid}`)?.version, 1);
  assert.equal(db.docs.get("productos/producto-u3c")?.stock, 52);
  assert.equal(db.docs.get("cuentas_bancarias/caja-principal")?.saldo, 40000);
  assert.deepEqual(venta.reciboInterno, result.reciboInterno);
  assert.equal(db.docs.get(`empresas/${empresaId}/secuencias_documentales/recibo-interno-venta-bodega`)?.ultimoConsecutivo, 1);
  const replay = await ejecutarConfirmarVentaBodegaV1(db, contexto, comando()) as any;
  assert.equal(replay.ventaId, result.ventaId);
  assert.deepEqual(replay.reciboInterno, result.reciboInterno);
  assert.equal(db.docs.get(`empresas/${empresaId}/secuencias_documentales/recibo-interno-venta-bodega`)?.ultimoConsecutivo, 1);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("ventas/")).length, 1);
});

test("ADR-068: efectivo sin turno conserva pago, ledger total e inventario en una sola transacción", async () => {
  const db = new FakeDb(); seed(db);
  db.docs.delete(`turnos_activos/${crearIdentificadorInterno(empresaId, contexto.actorUid)}`);
  db.docs.delete("turnos/turno-u3c");

  const result = await ejecutarConfirmarVentaBodegaV1(db, contexto, comando()) as any;
  const venta = db.docs.get(`ventas/${result.ventaId}`)!;
  const movimiento = db.docs.get(`transacciones_financieras/${result.movimientoFinancieroId}`)!;
  assert.equal(result.turnoId, null);
  assert.equal(result.montoRecibidoCOP, 50000);
  assert.equal(result.cambioCOP, 10000);
  assert.equal(venta.turnoId, null);
  assert.deepEqual(venta.pago, { metodo: "efectivo", montoRecibidoCOP: 50000, cambioCOP: 10000 });
  assert.equal(movimiento.turnoId, null);
  assert.equal(movimiento.monto, 40000);
  assert.equal(db.docs.get("cuentas_bancarias/caja-principal")?.saldo, 40000);
  assert.equal(db.docs.get("productos/producto-u3c")?.stock, 52);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("ventas/")).length, 1);
});

test("ADR-068: recibido menor al total falla sin efectos parciales", async () => {
  const db = new FakeDb(); seed(db);
  db.docs.delete(`turnos_activos/${crearIdentificadorInterno(empresaId, contexto.actorUid)}`);
  await assert.rejects(
    ejecutarConfirmarVentaBodegaV1(db, contexto, comando({ payload: { ...comando().payload, montoRecibidoCOP: 39999 } })),
    error => dominio(error, "MONTO_RECIBIDO_INVALIDO"),
  );
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ventas/")), false);
  assert.equal(db.docs.get("productos/producto-u3c")?.stock, 100);
  assert.equal(db.docs.get("cuentas_bancarias/caja-principal")?.saldo, 0);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("transacciones_financieras/")), false);
  assert.equal([...db.docs.keys()].some(path => path.includes("/secuencias_documentales/")), false);
});

test("ADR-068: administrador puede registrar efectivo sin turno y queda visible en ledger", async () => {
  const db = new FakeDb(); seed(db);
  const adminContext: ContextoFinancieroOperativo = { empresaId, actorUid: "admin-u3c", rol: "admin" };
  db.docs.delete(`turnos_activos/${crearIdentificadorInterno(empresaId, contexto.actorUid)}`);
  db.docs.delete("turnos/turno-u3c");
  const result = await ejecutarConfirmarVentaBodegaV1(db, adminContext, comando({
    commandId: "cmd-admin-cash", idempotencyKey: "idem-admin-cash",
    payload: { clienteId: "cliente-u3c", lineas: [{ productoId: "producto-u3c", presentacionId: "caja-u3c", cantidad: 1 }], metodoPago: "efectivo", montoRecibidoCOP: 25000 },
  })) as any;
  const venta = db.docs.get(`ventas/${result.ventaId}`)!;
  const movimiento = db.docs.get(`transacciones_financieras/${result.movimientoFinancieroId}`)!;
  assert.equal(result.total, 20000);
  assert.equal(result.turnoId, null);
  assert.equal(venta.pago.montoRecibidoCOP, 25000);
  assert.equal(venta.pago.cambioCOP, 5000);
  assert.equal(movimiento.monto, 20000);
  assert.equal(movimiento.turnoId, null);
});

test("ADR-068: replay con el mismo recibido es idempotente y con recibido distinto entra en conflicto", async () => {
  const db = new FakeDb(); seed(db);
  const original = comando();
  const result = await ejecutarConfirmarVentaBodegaV1(db, contexto, original) as any;
  const replay = await ejecutarConfirmarVentaBodegaV1(db, contexto, original) as any;
  assert.equal(replay.ventaId, result.ventaId);

  await assert.rejects(
    ejecutarConfirmarVentaBodegaV1(db, contexto, comando({ payload: { ...original.payload, montoRecibidoCOP: 60000 } })),
    error => dominio(error, "COMMAND_ID_CONFLICT"),
  );
  assert.equal(db.docs.get("productos/producto-u3c")?.stock, 52);
  assert.equal(db.docs.get("cuentas_bancarias/caja-principal")?.saldo, 40000);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("ventas/")).length, 1);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("transacciones_financieras/")).length, 1);
});

test("ADR-064: venta vinculada consume hold, stock físico y agenda en una transacción idempotente", async () => {
  const db = new FakeDb(); seed(db);
  const { programacionId, reservaId } = seedAgendaReservation(db, Timestamp.fromMillis(Date.now() + 60_000));
  const result = await ejecutarConfirmarVentaBodegaV1(db, contexto, comando()) as any;
  assert.equal(result.programacionId, programacionId);
  assert.equal(db.docs.get("productos/producto-u3c")?.stock, 52);
  assert.equal(db.docs.get("productos/producto-u3c")?.stockReservado, 0);
  assert.equal(db.docs.get(`empresas/${empresaId}/reservas_stock_bodega/${reservaId}`)?.estado, "CONSUMIDA");
  assert.equal(db.docs.get(`empresas/${empresaId}/agenda_pedidos_bodega/${programacionId}`)?.estado, "CUMPLIDA");
  assert.equal(db.docs.get(`ventas/${result.ventaId}`)?.programacionId, programacionId);
  const replay = await ejecutarConfirmarVentaBodegaV1(db, contexto, comando()) as any;
  assert.equal(replay.ventaId, result.ventaId);
  assert.equal(db.docs.get("productos/producto-u3c")?.stock, 52);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("ventas/")).length, 1);
});

test("ADR-064: confirmación posterior al vencimiento no consume el hold ya liberado", async () => {
  const db = new FakeDb(); seed(db);
  const { programacionId, reservaId } = seedAgendaReservation(db, Timestamp.fromMillis(Date.now() - 1));
  const result = await ejecutarConfirmarVentaBodegaV1(db, contexto, comando()) as any;
  assert.equal(result.programacionId, programacionId);
  assert.equal(db.docs.get("productos/producto-u3c")?.stock, 52);
  assert.equal(db.docs.get("productos/producto-u3c")?.stockReservado, 0);
  assert.equal(db.docs.get(`empresas/${empresaId}/reservas_stock_bodega/${reservaId}`)?.estado, "VENCIDA");
  assert.equal(db.docs.get(`empresas/${empresaId}/agenda_pedidos_bodega/${programacionId}`)?.estado, "CUMPLIDA");
});

test("ADR-064: agenda vencida no puede consumir un hold futuro inconsistente", async () => {
  const db = new FakeDb(); seed(db);
  const { programacionId } = seedAgendaReservation(db, Timestamp.fromMillis(Date.now() + 60_000));
  const agendaRef = `empresas/${empresaId}/agenda_pedidos_bodega/${programacionId}`;
  db.docs.set(agendaRef, { ...db.docs.get(agendaRef), estado: "VENCIDA" });

  await assert.rejects(ejecutarConfirmarVentaBodegaV1(db, contexto, comando()), error => dominio(error, "AGENDA_RESERVA_INCONSISTENTE"));
  assert.equal(db.docs.get("productos/producto-u3c")?.stock, 100);
  assert.equal(db.docs.get("productos/producto-u3c")?.stockReservado, 48);
  assert.equal(db.docs.get(`empresas/${empresaId}/reservas_stock_bodega/${crearIdentificadorInterno(empresaId, `agenda-hold:${programacionId}:producto-u3c`)}`)?.estado, "ACTIVA");
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ventas/")), false);
});

test("U3-C: datos económicos y autoridad de cliente se rechazan antes de efectos", async () => {
  const db = new FakeDb(); seed(db);
  await assert.rejects(ejecutarConfirmarVentaBodegaV1(db, contexto, comando({ empresaId: "ajena" })), error => dominio(error, "COMANDO_BODEGA_INVALIDO"));
  await assert.rejects(ejecutarConfirmarVentaBodegaV1(db, contexto, comando({ cajeroId: "otro-vendedor" })), error => dominio(error, "COMANDO_BODEGA_INVALIDO"));
  await assert.rejects(ejecutarConfirmarVentaBodegaV1(db, contexto, comando({ payload: { clienteId: "cliente-u3c", lineas: [{ productoId: "producto-u3c", presentacionId: "caja-u3c", cantidad: 1, precio: 1 }], metodoPago: "efectivo", montoRecibidoCOP: 25000 } })), error => dominio(error, "LINEA_BODEGA_INVALIDA"));
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ventas/")), false);
});

test("venta de vendedor exige aprobación; aprobación expirada no crea efectos", async () => {
  const missing = new FakeDb(); seed(missing);
  await assert.rejects(ejecutarConfirmarVentaBodegaV1(missing, contexto, comando({ payload: { clienteId: "cliente-u3c", lineas: [{ productoId: "producto-u3c", presentacionId: "caja-u3c", cantidad: 2 }], metodoPago: "efectivo", montoRecibidoCOP: 50000 } })), error => dominio(error, "SOLICITUD_APROBACION_REQUERIDA"));
  assert.equal([...missing.docs.keys()].some(path => path.startsWith("ventas/")), false);
  assert.equal([...missing.docs.keys()].some(path => path.includes("/secuencias_documentales/")), false);

  const expired = new FakeDb(); seed(expired);
  const requestPath = `empresas/${empresaId}/solicitudes_venta_bodega/solicitud-u3c`;
  expired.docs.set(requestPath, { ...expired.docs.get(requestPath), aprobacion: { ...expired.docs.get(requestPath)?.aprobacion, expiraEn: Timestamp.fromMillis(Date.now() - 1) } });
  await assert.rejects(ejecutarConfirmarVentaBodegaV1(expired, contexto, comando()), error => dominio(error, "SOLICITUD_APROBACION_EXPIRADA"));
  assert.equal([...expired.docs.keys()].some(path => path.startsWith("ventas/")), false);
  assert.equal([...expired.docs.keys()].some(path => path.includes("/secuencias_documentales/")), false);
});

test("precio cambiado después de aprobación invalida la solicitud atómicamente y no materializa venta", async () => {
  const db = new FakeDb(); seed(db);
  db.docs.set("presentaciones_producto/caja-u3c", { ...db.docs.get("presentaciones_producto/caja-u3c"), precioCOP: 21000 });
  const result = await ejecutarConfirmarVentaBodegaV1(db, contexto, comando()) as any;
  assert.equal(result.estado, "INVALIDADA");
  assert.equal(db.docs.get(`empresas/${empresaId}/solicitudes_venta_bodega/solicitud-u3c`)?.estado, "INVALIDADA");
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ventas/")), false);
  assert.equal(db.docs.get("productos/producto-u3c")?.stock, 100);
  assert.equal(db.docs.get("cuentas_bancarias/caja-principal")?.saldo, 0);
  assert.equal([...db.docs.keys()].some(path => path.includes("/secuencias_documentales/")), false);
});

test("solicitud aprobada con el snapshot previo se invalida y no reinterpreta el precio por canal", async () => {
  const db = new FakeDb(); seed(db);
  const requestPath = `empresas/${empresaId}/solicitudes_venta_bodega/solicitud-u3c`;
  const current = db.docs.get(requestPath)!;
  const legacyLine = {
    productoId: "producto-u3c", productoNombre: "Producto", unidadBase: "unidad",
    presentacionId: "caja-u3c", presentacionNombre: "Caja", cantidad: 2,
    factorUnidadBase: 24, cantidadUnidadBase: 48, precioPresentacionCOP: 20000, subtotalCOP: 40000,
  };
  const legacyHash = crearHuellaSemantica({ clienteId: "cliente-u3c", lineas: [legacyLine], totalCOP: 40000 });
  db.docs.set(requestPath, {
    ...current,
    lineas: [legacyLine],
    huellaComercial: legacyHash,
    aprobacion: { ...current.aprobacion, huellaComercial: legacyHash },
  });

  const result = await ejecutarConfirmarVentaBodegaV1(db, contexto, comando()) as any;
  assert.equal(result.estado, "INVALIDADA");
  assert.equal(result.motivo, "CATALOGO_CAMBIADO");
  assert.equal(db.docs.get(requestPath)?.estado, "INVALIDADA");
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ventas/")), false);
  assert.equal([...db.docs.keys()].some(path => path.includes("/secuencias_documentales/")), false);
  assert.equal(db.docs.get("productos/producto-u3c")?.stock, 100);
  assert.equal(db.docs.get("cuentas_bancarias/caja-principal")?.saldo, 0);
});

test("ADR-068: un bloqueo de turno inconsistente falla cerrado antes de efectos", async () => {
  const sinTurno = new FakeDb(); seed(sinTurno);
  sinTurno.docs.set(`turnos_activos/${crearIdentificadorInterno(empresaId, "vendedor-u3c")}`, { empresaId, cajeroId: "vendedor-u3c", turnoId: "turno-inexistente" });
  await assert.rejects(ejecutarConfirmarVentaBodegaV1(sinTurno, contexto, comando()), error => dominio(error, "TURNO_CERRADO"));
  assert.equal([...sinTurno.docs.keys()].some(path => path.startsWith("ventas/")), false);
  assert.equal([...sinTurno.docs.keys()].some(path => path.includes("/secuencias_documentales/")), false);

  const sinStock = new FakeDb(); seed(sinStock); sinStock.docs.set("productos/producto-u3c", { ...sinStock.docs.get("productos/producto-u3c"), stock: 47 });
  await assert.rejects(ejecutarConfirmarVentaBodegaV1(sinStock, contexto, comando()), error => dominio(error, "STOCK_INSUFICIENTE"));
  assert.equal([...sinStock.docs.keys()].some(path => path.startsWith("ventas/")), false);
  assert.equal([...sinStock.docs.keys()].some(path => path.includes("/secuencias_documentales/")), false);
  assert.equal(sinStock.docs.get("productos/producto-u3c")?.stock, 47);

  const sinSell = new FakeDb(); seed(sinSell); sinSell.docs.set(`membresias/${empresaId}_vendedor-u3c`, { ...sinSell.docs.get(`membresias/${empresaId}_vendedor-u3c`), permisos: [] });
  await assert.rejects(ejecutarConfirmarVentaBodegaV1(sinSell, contexto, comando()), error => dominio(error, "ROLE_FORBIDDEN"));
});

test("U3-C: transferencia usa la cuenta canónica sin turno ni movimiento de caja", async () => {
  const db = new FakeDb(); seed(db);
  const adminContext: ContextoFinancieroOperativo = { empresaId, actorUid: "admin-u3c", rol: "admin" };
  db.docs.delete(`turnos_activos/${crearIdentificadorInterno(empresaId, "vendedor-u3c")}`);
  db.docs.delete("turnos/turno-u3c");
  db.docs.set("cuentas_bancarias/banco-u3c", { id: "banco-u3c", empresaId, claveOperativa: "bancolombia", nombre: "Banco", saldo: 0 });
  const result = await ejecutarConfirmarVentaBodegaV1(db, adminContext, comando({ commandId: "cmd-transfer", idempotencyKey: "idem-transfer", payload: { clienteId: "cliente-u3c", lineas: [{ productoId: "producto-u3c", presentacionId: "caja-u3c", cantidad: 1 }], metodoPago: "transferencia" } })) as any;
  assert.equal(result.turnoId, null);
  const ingreso = db.docs.get(`transacciones_financieras/${result.movimientoFinancieroId}`)!;
  assert.equal(ingreso.cuentaDocumentoId, "banco-u3c");
  assert.equal(ingreso.cuentaClaveSnapshot, "bancolombia");
  assert.equal(ingreso.turnoId, null);
  assert.equal(db.docs.get("cuentas_bancarias/caja-principal")?.saldo, 0);
  assert.equal(db.docs.get("cuentas_bancarias/banco-u3c")?.saldo, 20000);
});

test("ADR-091: vendedor confirma entrega pendiente sin ingreso y actualiza cartera solo una vez", async () => {
  const db = new FakeDb(); seed(db);
  const pendingCommand = comando({
    commandId: "cmd-pendiente", idempotencyKey: "idem-pendiente",
    payload: { clienteId: "cliente-u3c", lineas: [{ productoId: "producto-u3c", presentacionId: "caja-u3c", cantidad: 2 }], metodoPago: "pendiente", solicitudId: "solicitud-u3c" },
  });
  const result = await ejecutarConfirmarVentaBodegaV1(db, contexto, pendingCommand) as any;
  const replay = await ejecutarConfirmarVentaBodegaV1(db, contexto, pendingCommand) as any;
  assert.equal(result.ventaId, replay.ventaId);
  assert.equal(result.estado, "pendiente");
  assert.equal(result.saldoPendienteCOP, 40000);
  const venta = db.docs.get(`ventas/${result.ventaId}`)!;
  assert.equal(venta.schemaVersion, "BODEGA_MVP1_V2");
  assert.equal(venta.metodoPago, "cuenta_cobro");
  assert.equal(venta.estado, "pendiente");
  assert.equal(venta.totalAbonadoCOP, 0);
  assert.equal(venta.saldoPendienteCOP, 40000);
  assert.equal(result.reciboInterno.estadoPagoInicial, "PENDIENTE");
  assert.equal(result.reciboInterno.saldoInicialCOP, 40000);
  assert.equal(result.reciboInterno.metodoPago, "cuenta_cobro");
  assert.deepEqual(venta.reciboInterno, result.reciboInterno);
  assert.equal(db.docs.get("clientes/cliente-u3c")?.saldoPendienteBodegaCOP, 40000);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("transacciones_financieras/")).length, 0);
  assert.equal([...db.docs.keys()].filter(path => path.startsWith("movimientos_inventario/")).length, 1);
  assert.equal(db.docs.get("productos/producto-u3c")?.stock, 52);
});

test("ADR-091: administración no puede marcar una venta a crédito sin la ruta de cuenta autorizada", async () => {
  const db = new FakeDb(); seed(db);
  const before = [...db.docs.entries()];
  const adminContext: ContextoFinancieroOperativo = { empresaId, actorUid: "admin-u3c", rol: "admin" };
  await assert.rejects(ejecutarConfirmarVentaBodegaV1(db, adminContext, comando({
    commandId: "cmd-admin-pendiente", idempotencyKey: "idem-admin-pendiente",
    payload: { clienteId: "cliente-u3c", lineas: [{ productoId: "producto-u3c", presentacionId: "caja-u3c", cantidad: 1 }], metodoPago: "pendiente" },
  })), error => dominio(error, "CREDITO_VENDEDOR_REQUERIDO"));
  assert.equal([...db.docs.keys()].some(path => path.startsWith("ventas/")), false);
  assert.equal(db.docs.get("productos/producto-u3c")?.stock, 100);
  assert.equal(db.docs.get("clientes/cliente-u3c")?.saldoPendienteBodegaCOP, undefined);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("transacciones_financieras/")), false);
  assert.equal([...db.docs.keys()].some(path => path.includes("/secuencias_documentales/")), false);
  assert.deepEqual([...db.docs.entries()], before);
});

test("ADR-098: el consecutivo avanza por tenant y no comparte contador entre empresas", async () => {
  const db = new FakeDb(); seed(db);
  const adminA: ContextoFinancieroOperativo = { empresaId, actorUid: "admin-u3c", rol: "admin" };
  const firstA = await ejecutarConfirmarVentaBodegaV1(db, adminA, comando({
    commandId: "cmd-folio-a1", idempotencyKey: "idem-folio-a1",
    payload: { clienteId: "cliente-u3c", lineas: [{ productoId: "producto-u3c", presentacionId: "caja-u3c", cantidad: 1 }], metodoPago: "efectivo", montoRecibidoCOP: 20000 },
  })) as any;

  const empresaB = "empresa-u3c-b";
  db.docs.set(`empresas/${empresaB}`, { estado: "activa", esFundacional: false, nombreComercial: "Empresa B" });
  db.docs.set(`membresias/${empresaB}_admin-b`, { empresaId: empresaB, uid: "admin-b", rol: "admin", permisos: ["sell"], estado: "activa", activo: true });
  db.docs.set(`configuraciones/${empresaB}`, { empresaId: empresaB, vertical: "BODEGA_MVP1", modulos: { habilitados: ["sell"] } });
  db.docs.set("clientes/cliente-b", { empresaId: empresaB, nombre: "Cliente B", activo: true });
  db.docs.set("productos/producto-b", { empresaId: empresaB, nombre: "Producto B", unidadMedida: "unidad", espacioId: "espacio-b", activo: true, stock: 10, secuenciaLedger: 1, costo: 100 });
  db.docs.set("presentaciones_producto/presentacion-b", { empresaId: empresaB, productoId: "producto-b", nombre: "Unidad", factorUnidadBase: 1, precioCOP: 1000, activo: true });
  const cuentaB = crearIdentificadorInterno(empresaB, "cuenta:bancolombia");
  db.docs.set(`cuentas_bancarias/${cuentaB}`, { id: cuentaB, empresaId: empresaB, claveOperativa: "bancolombia", nombre: "Banco B", saldo: 0 });
  const firstB = await ejecutarConfirmarVentaBodegaV1(db, { empresaId: empresaB, actorUid: "admin-b", rol: "admin" }, {
    commandId: "cmd-folio-b1", idempotencyKey: "idem-folio-b1", correlationId: "corr-folio-b1", causationId: null,
    payload: { clienteId: "cliente-b", lineas: [{ productoId: "producto-b", presentacionId: "presentacion-b", cantidad: 1 }], metodoPago: "transferencia" },
  }) as any;
  const secondA = await ejecutarConfirmarVentaBodegaV1(db, adminA, comando({
    commandId: "cmd-folio-a2", idempotencyKey: "idem-folio-a2",
    payload: { clienteId: "cliente-u3c", lineas: [{ productoId: "producto-u3c", presentacionId: "caja-u3c", cantidad: 1 }], metodoPago: "efectivo", montoRecibidoCOP: 20000 },
  })) as any;

  assert.equal(firstA.reciboInterno.folioInterno, "BOD-000001");
  assert.equal(firstB.reciboInterno.folioInterno, "BOD-000001");
  assert.equal(secondA.reciboInterno.folioInterno, "BOD-000002");
  assert.equal(db.docs.get(`empresas/${empresaId}/secuencias_documentales/recibo-interno-venta-bodega`)?.ultimoConsecutivo, 2);
  assert.equal(db.docs.get(`empresas/${empresaB}/secuencias_documentales/recibo-interno-venta-bodega`)?.ultimoConsecutivo, 1);
});

const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
test("U3-C Emulator: doble confirmación real conserva un único conjunto atómico de efectos", { skip: !FIRESTORE_EMULATOR_HOST }, async () => {
  if (!FIRESTORE_EMULATOR_HOST?.startsWith("127.0.0.1:") || process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error("U3-C requiere Emulator local sin credenciales reales.");
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const empresa = `empresa-u3c-${suffix}`; const actor = `vendedor-u3c-${suffix}`; const solicitudId = `solicitud-u3c-${suffix}`; const solicitudId2 = `solicitud-u3c-2-${suffix}`;
  const app = initializeApp({ projectId: "demo-bodega-u3c-confirmacion" }, `u3c-${suffix}`); const db = getFirestore(app);
  const command = { commandId: `cmd-u3c-${suffix}`, idempotencyKey: `idem-u3c-${suffix}`, correlationId: `corr-u3c-${suffix}`, causationId: null, payload: { clienteId: `cliente-${suffix}`, lineas: [{ productoId: `producto-${suffix}`, presentacionId: `presentacion-${suffix}`, cantidad: 6 }], metodoPago: "efectivo", montoRecibidoCOP: 6000, solicitudId } };
  const command2 = { commandId: `cmd-u3c-2-${suffix}`, idempotencyKey: `idem-u3c-2-${suffix}`, correlationId: `corr-u3c-2-${suffix}`, causationId: null, payload: { clienteId: `cliente-${suffix}`, lineas: [{ productoId: `producto-${suffix}-2`, presentacionId: `presentacion-${suffix}-2`, cantidad: 1 }], metodoPago: "efectivo", montoRecibidoCOP: 1000, solicitudId: solicitudId2 } };
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
    batch.set(db.collection("productos").doc(`${productoId}-2`), { empresaId: empresa, nombre: "Producto 2", unidadMedida: "unidad", espacioId: "espacio", activo: true, stock: 10, secuenciaLedger: 1, costo: 100 });
    batch.set(db.collection("presentaciones_producto").doc(`${presentacionId}-2`), { empresaId: empresa, productoId: `${productoId}-2`, nombre: "Unidad", factorUnidadBase: 1, precioCOP: 1000, activo: true });
    batch.set(db.collection("cuentas_bancarias").doc("caja-principal"), { id: "caja-principal", empresaId: empresa, claveOperativa: "caja-principal", nombre: "Caja", saldo: 0 });
    batch.set(db.collection("turnos").doc(`turno-${suffix}`), { empresaId: empresa, cajeroId: actor, estado: "abierto" });
    batch.set(db.collection("turnos_activos").doc(lockId), { empresaId: empresa, cajeroId: actor, turnoId: `turno-${suffix}` });
    const intentLineas = command.payload.lineas;
    const commercialLine = { productoId, productoNombre: "Producto", unidadBase: "unidad", presentacionId, presentacionNombre: "Unidad", cantidad: 6, factorUnidadBase: 1, cantidadUnidadBase: 6, canal: "tienda", precioBasePresentacionCOP: 1000, precioPresentacionCOP: 1000, ofertaId: null, subtotalCOP: 6000 };
    const huellaComercial = crearHuellaSemantica({ clienteId, lineas: [commercialLine], totalCOP: 6000 });
    batch.set(db.collection("empresas").doc(empresa).collection("solicitudes_venta_bodega").doc(solicitudId), {
      solicitudId, empresaId: empresa, solicitanteUid: actor, clienteId, intentoLineas: intentLineas,
      lineas: [commercialLine], totalCOP: 6000, huellaComercial, revision: 1, estado: "APROBADA",
      aprobacion: { actorUid: "admin-u3c-test", revision: 1, totalCOP: 6000, huellaComercial, expiraEn: Timestamp.fromMillis(Date.now() + 60_000) },
    });
    const commercialLine2 = { productoId: `${productoId}-2`, productoNombre: "Producto 2", unidadBase: "unidad", presentacionId: `${presentacionId}-2`, presentacionNombre: "Unidad", cantidad: 1, factorUnidadBase: 1, cantidadUnidadBase: 1, canal: "tienda", precioBasePresentacionCOP: 1000, precioPresentacionCOP: 1000, ofertaId: null, subtotalCOP: 1000 };
    const huellaComercial2 = crearHuellaSemantica({ clienteId, lineas: [commercialLine2], totalCOP: 1000 });
    batch.set(db.collection("empresas").doc(empresa).collection("solicitudes_venta_bodega").doc(solicitudId2), {
      solicitudId: solicitudId2, empresaId: empresa, solicitanteUid: actor, clienteId, intentoLineas: command2.payload.lineas,
      lineas: [commercialLine2], totalCOP: 1000, huellaComercial: huellaComercial2, revision: 1, estado: "APROBADA",
      aprobacion: { actorUid: "admin-u3c-test", revision: 1, totalCOP: 1000, huellaComercial: huellaComercial2, expiraEn: Timestamp.fromMillis(Date.now() + 60_000) },
    });
    await batch.commit();
    const contextoEmulator: ContextoFinancieroOperativo = { empresaId: empresa, actorUid: actor, rol: "vendedor" };
    const [a, b, c] = await Promise.all([ejecutarConfirmarVentaBodegaV1(db, contextoEmulator, command), ejecutarConfirmarVentaBodegaV1(db, contextoEmulator, command), ejecutarConfirmarVentaBodegaV1(db, contextoEmulator, command2)]) as any[];
    assert.equal(a.ventaId, b.ventaId);
    assert.notEqual(c.ventaId, a.ventaId);
    assert.deepEqual([a.reciboInterno.folioInterno, c.reciboInterno.folioInterno].sort(), ["BOD-000001", "BOD-000002"]);
    assert.equal((await db.collection("ventas").where("empresaId", "==", empresa).get()).size, 2);
    assert.equal((await db.collection("operaciones_comandos").where("empresaId", "==", empresa).get()).size, 2);
    assert.equal((await db.collection("transacciones_financieras").where("empresaId", "==", empresa).get()).size, 2);
    const inventario = await db.collection("movimientos_inventario").where("empresaId", "==", empresa).get();
    assert.equal(inventario.size, 2); assert.deepEqual(inventario.docs.map(doc => doc.data().cantidad).sort((a, b) => a - b), [-6, -1]);
    assert.equal((await db.collection("productos").doc(productoId).get()).data()?.stock, 4);
    assert.equal((await db.collection("productos").doc(`${productoId}-2`).get()).data()?.stock, 9);
    assert.equal((await db.collection("empresas").doc(empresa).collection("secuencias_documentales").doc("recibo-interno-venta-bodega").get()).data()?.ultimoConsecutivo, 2);
    assert.equal((await db.collection("empresas").doc(empresa).collection("solicitudes_venta_bodega").doc(solicitudId).get()).data()?.estado, "EJECUTADA");
  } finally { await deleteApp(app); }
});
