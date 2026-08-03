import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { crearPlantillaConfiguracionRevision1 } from "../../../lib/configuracion";
import { fechaFiscalActualUtc, fechaFiscalEnRango, rangoVigenciaFiscalValido, scopeEmpresa, scopeEspacio, validarFechaFiscal, validarIdFiscal, validarScopeFiscal } from "../../../lib/fiscal/contrato";
import { actualizarNumeracionBorrador, confirmarVentaFiscal, crearNumeracion, crearVentaDemostracion, establecerAsignacion, retirarAsignacion, transicionarNumeracion, type Asignacion, type Numeracion } from "./service";

class Query {
  constructor(private readonly prefix: string, private readonly db: FakeFirestore, private readonly filters: Array<[string, unknown]> = []) {}
  where(field: string, op: string, value: unknown) { return op === "==" ? new Query(this.prefix, this.db, [...this.filters, [field, value]]) : this; }
  read(working: Map<string, any>) {
    const docs = [...working.entries()]
      .filter(([path, value]) => path.startsWith(`${this.prefix}/`) && !path.slice(this.prefix.length + 1).includes("/") && this.filters.every(([field, expected]) => value?.[field] === expected))
      .map(([, value]) => new Snap(value));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
}
class Ref {
  constructor(public path: string, private readonly db: FakeFirestore) {}
  doc(id: string) { return new Ref(`${this.path}/${id}`, this.db) }
  collection(id: string) { return new Ref(`${this.path}/${id}`, this.db) }
  where(field: string, op: string, value: unknown) { return new Query(this.path, this.db, [[field, value]]) }
}
class Snap { constructor(private value: any) {} get exists() { return this.value !== undefined } data() { return structuredClone(this.value) } }
class FakeFirestore {
  docs = new Map<string, any>(); private queue = Promise.resolve();
  collection(name: string) { return new Ref(name, this) }
  seed(path: string, value: any) { this.docs.set(path, structuredClone(value)) }
  read(path: string) { return this.docs.get(path) }
  async runTransaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    let release!: () => void; const previous = this.queue; this.queue = new Promise<void>(resolve => { release = resolve }); await previous;
    const working = new Map([...this.docs].map(([k, v]) => [k, structuredClone(v)]));
    const tx = {
      get: async (ref: Ref | Query) => ref instanceof Query ? ref.read(working) : new Snap(working.get(ref.path)),
      create: (ref: Ref, value: any) => { if (working.has(ref.path)) throw new Error("ALREADY_EXISTS"); working.set(ref.path, structuredClone(value)) },
      set: (ref: Ref, value: any) => working.set(ref.path, structuredClone(value)),
      update: (ref: Ref, value: any) => { if (!working.has(ref.path)) throw new Error("NOT_FOUND"); working.set(ref.path, { ...working.get(ref.path), ...structuredClone(value) }) },
    };
    try { const result = await callback(tx); this.docs = working; return result } finally { release() }
  }
}

const empresaId = "empresa_1";
const contexto = { empresaId, actorId: "admin_1", paisFiscal: "CO", origen: "ADMIN" as const, rolEfectivo: "admin" };
const fecha = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
function configFiscal() {
  const c = crearPlantillaConfiguracionRevision1({ empresaId, nombreComercial: "Cafe", creadaEn: {}, actualizadaEn: {}, ultimaMutacion: { actorTipo: "SYSTEM", actorId: "system", origen: "BACKFILL", commandId: "init", correlationId: "init" } });
  return { ...c, identidadFiscal: { ...c.identidadFiscal, razonSocial: "Cafe SAS", tipoPersona: "JURIDICA", tipoDocumento: "NIT", numeroDocumento: "900373913", digitoVerificacion: "4", regimenTributario: "no_responsable", actividadEconomicaPrincipal: "5610" }, localizacion: { ...c.localizacion, direccion: { ...c.localizacion.direccion, linea1: "Calle 1", departamentoCodigo: "11", municipioCodigo: "11001", municipioNombre: "Bogota" } } };
}
function numeracion(id: string, scope: "EMPRESA" | `ESPACIO:${string}`, ultimo = 0, hasta = fecha(10)): Numeracion { return { empresaId, numeracionId: id, paisFiscal: "CO", tipoDocumento: "pos", scope, prefijo: id.toUpperCase(), resolucion: `RES-${id}`, rangoInicio: 1, rangoFin: 10, ultimoAsignado: ultimo, vigenciaDesde: fecha(-10), vigenciaHasta: hasta, estado: "HABILITADA", revision: 1, schemaVersion: 1, creadaEn: {}, actualizadaEn: {} } }
function asignacion(scope: "EMPRESA" | `ESPACIO:${string}`, id: string): Asignacion { return { empresaId, scope, tipoDocumento: "pos", numeracionId: id, estado: "VIGENTE", revision: 1, schemaVersion: 1, actualizadaEn: {} } }
function entrada(commandId: string, ventaId: string, espacioId?: string) { return { commandId, idempotencyKey: `idem_${commandId}`, correlationId: "corr_1", causationId: "cause_1", expectedRevision: 1, expectedAsignacionRevision: 1, ventaId, espacioId, tipoDocumento: "pos" as const, venta: { items: [{ id: "p1", nombre: "Cafe", cantidad: 1, precioUnitario: 1000, subtotal: 1000, impuestoTipo: "inc_8", impuestoTarifa: 8, impuestoValor: 74, base: 926 }], totales: { subtotalBase: 926, totalINC: 74, total: 1000 }, metodoPago: "efectivo", pago: { metodo: "efectivo", recibido: 1000, cambio: 0 } } } }
function base() { const db = new FakeFirestore(); db.seed(`empresas/${empresaId}`, { paisFiscal: "CO", estado: "activa" }); db.seed(`configuraciones/${empresaId}`, configFiscal()); return db }
function seedFiscal(db: FakeFirestore, n: Numeracion, a: Asignacion) { db.seed(`numeraciones/${empresaId}_${n.numeracionId}`, n); db.seed(`asignaciones_numeracion/${empresaId}_${a.scope}_pos`, a) }

test("B2 valida IDs y scopes canónicos antes de construir rutas", () => {
  assert.equal(validarScopeFiscal(scopeEmpresa()), true); assert.equal(validarScopeFiscal(scopeEspacio("sucursal_1")), true);
  assert.equal(validarScopeFiscal("ESPACIO:../../x"), false); assert.equal(validarIdFiscal("x/y"), false); assert.throws(() => scopeEspacio("ambigua:1"));
});

test("ConfirmarVentaFiscal selecciona espacio antes de empresa y persiste snapshot, auditoría y evento", async () => {
  const db = base(); seedFiscal(db, numeracion("general", "EMPRESA"), asignacion("EMPRESA", "general")); seedFiscal(db, numeracion("local", "ESPACIO:s1"), asignacion("ESPACIO:s1", "local"));
  const result = await confirmarVentaFiscal(db as any, entrada("cmd_1", "venta_1", "s1"), contexto);
  assert.equal(result.numero, 1); assert.equal(db.read(`numeraciones/${empresaId}_local`).ultimoAsignado, 1); assert.equal(db.read(`numeraciones/${empresaId}_general`).ultimoAsignado, 0);
  const venta = db.read("ventas/venta_1"); assert.equal(venta.snapshotFiscal.numeracion.numeracionId, "local"); assert.equal(venta.snapshotFiscal.documento.items[0].nombre, "Cafe");
  const contieneUndefined = (v: any): boolean => Array.isArray(v) ? v.some(contieneUndefined) : !!v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype ? Object.values(v).some(x => x === undefined || contieneUndefined(x)) : false;
  assert.equal(contieneUndefined(venta), false);
  const audit = [...db.docs.values()].find(v => v.comando === "VentaFiscalConfirmada"); const event = [...db.docs.values()].find(v => v.tipo === "VentaFiscalConfirmada");
  assert.equal(audit.causationId, "cause_1"); assert.equal(event.revisionAnterior, 0); assert.equal(event.revisionNueva, 1); assert.equal(event.actorId, "admin_1");
  const recibo = [...db.docs.values()].find(v => v.ventaId === "venta_1");
  assert.deepEqual({ ventaId: recibo.ventaId, empresaId: recibo.empresaId, actorOriginal: recibo.actorOriginal, commandId: recibo.commandId, idempotencyKey: recibo.idempotencyKey, correlationId: recibo.correlationId, causationId: recibo.causationId }, { ventaId: "venta_1", empresaId, actorOriginal: { uid: "admin_1", rolEfectivo: "admin" }, commandId: "cmd_1", idempotencyKey: "idem_cmd_1", correlationId: "corr_1", causationId: "cause_1" });
  assert.equal("actorOriginal" in venta, false);
});

test("B2 acepta exclusivamente fechas fiscales gregorianas canonicas y rangos ordenados", () => {
  assert.equal(validarFechaFiscal("2028-02-29"), true);
  assert.equal(validarFechaFiscal("2026-02-29"), false);
  assert.equal(validarFechaFiscal("2026-13-01"), false);
  assert.equal(validarFechaFiscal("2026-04-31"), false);
  assert.equal(validarFechaFiscal("fecha-invalida"), false);
  assert.equal(validarFechaFiscal("2026-7-01"), false);
  assert.equal(rangoVigenciaFiscalValido("2026-07-01", "2026-06-30"), false);
});

test("B2 trata la vigencia como fecha de negocio UTC e incluye primer y ultimo dia", () => {
  const desde = "2026-07-01"; const hasta = "2026-07-31";
  assert.equal(fechaFiscalEnRango("2026-07-01", desde, hasta), true);
  assert.equal(fechaFiscalEnRango("2026-07-31", desde, hasta), true);
  assert.equal(fechaFiscalEnRango("2026-08-01", desde, hasta), false);
  assert.equal(fechaFiscalActualUtc(new Date("2026-07-31T23:59:59.999Z")), "2026-07-31");
  assert.equal(fechaFiscalActualUtc(new Date("2026-08-01T00:00:00.000Z")), "2026-08-01");
  assert.equal(fechaFiscalActualUtc(new Date("2026-07-31T23:30:00-05:00")), "2026-08-01");
});

test("B2 rechaza vigencias invalidas al crear una numeracion", async () => {
  const db = base(); const env = { idempotencyKey: "fecha_1", commandId: "fecha_cmd_1", correlationId: "corr_fecha", causationId: "cause_fecha", expectedRevision: 1 };
  for (const [desde, hasta] of [["2026-01-01", "fecha-invalida"], ["2026-02-29", "2026-03-01"], ["2026-07-02", "2026-07-01"]]) {
    const sufijo = hasta.replace(/[^A-Za-z0-9]/g, "_");
    await assert.rejects(crearNumeracion(db as any, { ...env, commandId: `${env.commandId}_${sufijo}`, idempotencyKey: `${env.idempotencyKey}_${sufijo}`, numeracionId: `serie_${sufijo}`, tipoDocumento: "pos", scope: "EMPRESA", prefijo: "S", resolucion: "RES-S", rangoInicio: 1, rangoFin: 10, vigenciaDesde: desde, vigenciaHasta: hasta }, contexto), /NUMERACION_INVALIDA/);
  }
});

test("B2 no habilita ni reanuda una numeracion con vigencia corrupta", async () => {
  for (const [estado, accion] of [["BORRADOR", "HABILITAR"], ["PAUSADA", "REANUDAR"]] as const) {
    const db = base(); const n = { ...numeracion(`fecha_${estado}`, "EMPRESA"), estado, vigenciaHasta: "fecha-invalida" } as Numeracion;
    db.seed(`numeraciones/${empresaId}_${n.numeracionId}`, n);
    await assert.rejects(transicionarNumeracion(db as any, { commandId: `fecha_trans_${estado}`, idempotencyKey: `fecha_trans_${estado}`, correlationId: "corr_fecha", causationId: "cause_fecha", expectedRevision: 1, numeracionId: n.numeracionId, accion }, contexto), /NUMERACION_NOT_EMITTABLE/);
  }
});

test("idempotencyKey y commandId deduplican independientemente", async () => {
  const db = base(); seedFiscal(db, numeracion("general", "EMPRESA"), asignacion("EMPRESA", "general")); const e = entrada("cmd_idem", "venta_idem");
  assert.equal((await confirmarVentaFiscal(db as any, e, contexto)).idempotente, false); assert.equal((await confirmarVentaFiscal(db as any, e, contexto)).idempotente, true);
  await assert.rejects(confirmarVentaFiscal(db as any, { ...entrada("cmd_idem", "venta_otra"), idempotencyKey: "otra_key", expectedRevision: 2 }, contexto), /COMMAND_ID_CONFLICT/);
});

test("commandId es global y colisiona con el índice canónico usado por B1", async () => {
  const db = base(); seedFiscal(db, numeracion("general", "EMPRESA"), asignacion("EMPRESA", "general")); const e = entrada("cmd_global", "venta_global");
  const digest = createHash("sha256").update(JSON.stringify(e.commandId)).digest("hex"); db.seed(`configuracion_command_ids/cfgcmdid_${digest}`, { empresaId, commandId: e.commandId, idempotencyKey: "otra", fingerprint: "otro", resultado: {} });
  await assert.rejects(confirmarVentaFiscal(db as any, e, contexto), /COMMAND_ID_CONFLICT/);
});

test("vencimiento se materializa con auditoría y evento aunque la emisión sea rechazada", async () => {
  const db = base(); seedFiscal(db, numeracion("vencida", "EMPRESA", 0, fecha(-1)), asignacion("EMPRESA", "vencida"));
  await assert.rejects(confirmarVentaFiscal(db as any, entrada("cmd_vencida", "venta_vencida"), contexto), /NUMERACION_VENCIDA/);
  assert.equal(db.read(`numeraciones/${empresaId}_vencida`).estado, "VENCIDA"); assert.equal(db.read("ventas/venta_vencida"), undefined);
  assert.ok([...db.docs.values()].some(v => v.tipo === "NumeracionVencida"));
  const revision = db.read(`numeraciones/${empresaId}_vencida`).revision; await assert.rejects(confirmarVentaFiscal(db as any, entrada("cmd_vencida", "venta_vencida"), contexto), /NUMERACION_VENCIDA/); assert.equal(db.read(`numeraciones/${empresaId}_vencida`).revision, revision);
});

test("agotamiento inconsistente se materializa sin crear venta ni consumir otro número", async () => {
  const db = base(); const n = { ...numeracion("agotada", "EMPRESA", 10), rangoFin: 10 }; seedFiscal(db, n, asignacion("EMPRESA", "agotada"));
  await assert.rejects(confirmarVentaFiscal(db as any, entrada("cmd_agotada", "venta_agotada"), contexto), /NUMERACION_AGOTADA/);
  assert.equal(db.read(`numeraciones/${empresaId}_agotada`).estado, "AGOTADA"); assert.equal(db.read(`numeraciones/${empresaId}_agotada`).ultimoAsignado, 10); assert.equal(db.read("ventas/venta_agotada"), undefined);
});

test("dos confirmaciones concurrentes con la misma revisión no duplican números", async () => {
  const db = base(); seedFiscal(db, numeracion("general", "EMPRESA"), asignacion("EMPRESA", "general"));
  const settled = await Promise.allSettled([confirmarVentaFiscal(db as any, entrada("cmd_c1", "venta_c1"), contexto), confirmarVentaFiscal(db as any, entrada("cmd_c2", "venta_c2"), contexto)]);
  assert.equal(settled.filter(r => r.status === "fulfilled").length, 1); assert.equal(settled.filter(r => r.status === "rejected").length, 1); assert.equal(db.read(`numeraciones/${empresaId}_general`).ultimoAsignado, 1);
});

test("selección cae a EMPRESA cuando no existe asignación exacta", async () => {
  const db = base(); seedFiscal(db, numeracion("general", "EMPRESA"), asignacion("EMPRESA", "general"));
  const result = await confirmarVentaFiscal(db as any, entrada("cmd_fallback", "venta_fallback", "s1"), contexto);
  assert.equal(result.prefijo, "GENERAL"); assert.equal(db.read("ventas/venta_fallback").snapshotFiscal.numeracion.scope, "EMPRESA");
});

test("readiness fiscal incompleta e inputs malformados bloquean snapshot", async () => {
  const db = base(); db.seed(`configuraciones/${empresaId}`, crearPlantillaConfiguracionRevision1({ empresaId, nombreComercial: "Cafe", creadaEn: {}, actualizadaEn: {}, ultimaMutacion: { actorTipo: "SYSTEM", actorId: "system", origen: "BACKFILL", commandId: "init", correlationId: "init" } })); seedFiscal(db, numeracion("general", "EMPRESA"), asignacion("EMPRESA", "general"));
  await assert.rejects(confirmarVentaFiscal(db as any, entrada("cmd_not_ready", "venta_not_ready"), contexto), /READINESS_FISCAL_INCOMPLETA/);
  await assert.rejects(confirmarVentaFiscal(db as any, { ...entrada("cmd_bad", "venta_bad"), venta: { items: [], totales: {}, pago: {} } }, contexto), /LINEAS_FISCALES_INVALIDAS/);
});

test("consumir el último número confirma venta y audita NumeracionAgotada", async () => {
  const db = base(); seedFiscal(db, { ...numeracion("ultima", "EMPRESA", 9), rangoFin: 10 }, asignacion("EMPRESA", "ultima"));
  await confirmarVentaFiscal(db as any, entrada("cmd_ultima", "venta_ultima"), contexto);
  assert.equal(db.read(`numeraciones/${empresaId}_ultima`).estado, "AGOTADA"); assert.ok([...db.docs.values()].some(v => v.tipo === "NumeracionAgotada")); assert.ok([...db.docs.values()].some(v => v.comando === "NumeracionAgotada"));
});

test("commands administrativos cubren borrador, transición, asignación y retiro idempotente", async () => {
  const db = base(); const env = { idempotencyKey: "admin_1", commandId: "admin_cmd_1", correlationId: "corr_admin", causationId: "cause_admin", expectedRevision: 1 };
  await crearNumeracion(db as any, { ...env, numeracionId: "serie_1", tipoDocumento: "pos", scope: "EMPRESA", prefijo: "S", resolucion: "RES-S", rangoInicio: 1, rangoFin: 100, vigenciaDesde: fecha(-1), vigenciaHasta: fecha(10) }, contexto);
  await actualizarNumeracionBorrador(db as any, { ...env, commandId: "admin_cmd_2", idempotencyKey: "admin_2", numeracionId: "serie_1", tipoDocumento: "pos", scope: "EMPRESA", prefijo: "S2", resolucion: "RES-S2", rangoInicio: 1, rangoFin: 100, vigenciaDesde: fecha(-1), vigenciaHasta: fecha(10) }, contexto);
  await transicionarNumeracion(db as any, { ...env, commandId: "admin_cmd_3", idempotencyKey: "admin_3", expectedRevision: 2, numeracionId: "serie_1", accion: "HABILITAR" }, contexto);
  await establecerAsignacion(db as any, { ...env, commandId: "admin_cmd_4", idempotencyKey: "admin_4", scope: "EMPRESA", tipoDocumento: "pos", numeracionId: "serie_1" }, contexto);
  const retirada = await retirarAsignacion(db as any, { ...env, commandId: "admin_cmd_5", idempotencyKey: "admin_5", scope: "EMPRESA", tipoDocumento: "pos" }, contexto); assert.equal(retirada.revision, 2);
  const noop = await retirarAsignacion(db as any, { ...env, commandId: "admin_cmd_6", idempotencyKey: "admin_6", expectedRevision: 2, scope: "EMPRESA", tipoDocumento: "pos" }, contexto); assert.equal(noop.idempotente, true);
});
function entradaDemo(commandId: string, ventaId: string) {
  return {
    commandId,
    idempotencyKey: `idem_${commandId}`,
    correlationId: `corr_${commandId}`,
    causationId: `cause_${commandId}`,
    expectedRevision: 1,
    ventaId,
    venta: {
      turnoId: "turno_demo",
      cajeroId: "admin_1",
      cajeroNombre: "Administrador",
      items: [{ id: "p_demo", nombre: "Cafe demo", cantidad: 1, precioUnitario: 1000, costoUnitario: 200, subtotal: 1000, codigo: "p_demo", categoria: "cafeteria" }],
      metodoPago: "efectivo",
      dineroRecibido: 1000,
      cambio: 0,
    },
  };
}

function prepararTrialDemo(db: FakeFirestore, fiscalCompleta = false) {
  db.seed(`empresas/${empresaId}`, { paisFiscal: "CO", estado: "trial" });
  db.seed(`configuraciones/${empresaId}`, fiscalCompleta ? configFiscal() : crearPlantillaConfiguracionRevision1({ empresaId, nombreComercial: "Cafe", creadaEn: {}, actualizadaEn: {}, ultimaMutacion: { actorTipo: "SYSTEM", actorId: "system", origen: "BACKFILL", commandId: "init", correlationId: "init" } }));
  db.seed(`suscripciones/${empresaId}`, { empresaId, planId: "mvp_comercial", planVersion: 1, estado: "trialing", trialInicio: fecha(-1), trialFin: fecha(10), revision: 1, schemaVersion: 1 });
  db.seed("planes/mvp_comercial/versiones/1", { planId: "mvp_comercial", planVersion: 1, estado: "PUBLICADA", capacidades: ["sell"], limites: {}, periodicidad: "MENSUAL", grandfathered: false, revision: 1, schemaVersion: 1 });
  db.seed(`productos/p_demo`, { empresaId, nombre: "Cafe demo", precio: 1000, costo: 200, activo: true, categoriaId: "cafeteria", stock: 10 });
  if (fiscalCompleta) {
    const n = numeracion("demo_ready", "EMPRESA");
    seedFiscal(db, n, asignacion("EMPRESA", "demo_ready"));
  }
}

test("P0-02 crea una venta DEMO sin numeración, snapshot fiscal ni campos tributarios", async () => {
  const db = new FakeFirestore(); prepararTrialDemo(db);
  const result = await crearVentaDemostracion(db as any, entradaDemo("cmd_demo_1", "venta_demo_1"), contexto);
  assert.equal(result.modoOperacion, "DEMO");
  assert.equal(result.referenciaOperacion, "DEMO-venta_demo_1");
  const venta = db.read("ventas/venta_demo_1");
  assert.equal(venta.modoOperacion, "DEMO");
  assert.equal(venta.estadoOperativo, "PENDIENTE_EFECTOS");
  assert.equal("consecutivo" in venta, false);
  assert.equal("snapshotFiscal" in venta, false);
  assert.equal("dian" in venta, false);
  assert.equal("impuestoTipo" in venta.items[0], false);
  assert.deepEqual(venta.totales, { subtotalBase: 1000, totalINC: 0, totalExcluido: 1000, total: 1000 });
  assert.ok([...db.docs.values()].some((v) => v.tipo === "VentaDemostracionCreada"));
});

test("P0-02 conserva idempotencia y no duplica la venta DEMO", async () => {
  const db = new FakeFirestore(); prepararTrialDemo(db); const entrada = entradaDemo("cmd_demo_idem", "venta_demo_idem");
  assert.equal((await crearVentaDemostracion(db as any, entrada, contexto)).idempotente, false);
  assert.equal((await crearVentaDemostracion(db as any, entrada, contexto)).idempotente, true);
  assert.equal([...db.docs.keys()].filter((path) => path === "ventas/venta_demo_idem").length, 1);
});

test("P0-02 rechaza DEMO cuando la fiscalidad ya está lista", async () => {
  const db = new FakeFirestore(); prepararTrialDemo(db, true);
  await assert.rejects(crearVentaDemostracion(db as any, entradaDemo("cmd_demo_ready", "venta_demo_ready"), contexto), /VENTA_DEMO_NO_DISPONIBLE:READINESS_FISCAL_COMPLETA/);
});

test("P0-02 impide convertir una venta DEMO en FISCAL", async () => {
  const db = base(); seedFiscal(db, numeracion("general", "EMPRESA"), asignacion("EMPRESA", "general"));
  db.seed("ventas/venta_demo_no_fiscal", { empresaId, modoOperacion: "DEMO" });
  await assert.rejects(confirmarVentaFiscal(db as any, entrada("cmd_demo_fiscal", "venta_demo_no_fiscal"), contexto), /VENTA_DEMO_NO_FISCALIZABLE/);
});
