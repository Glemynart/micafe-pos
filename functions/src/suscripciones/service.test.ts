import assert from "node:assert/strict";
import test from "node:test";
import { FieldValue } from "firebase-admin/firestore";
import { esFechaComercial, fechaComercialUtc, readinessComercial, type Suscripcion } from "../../../lib/suscripciones/contrato";
import { actualizarBorradorPlan, cambiarPlanSuscripcion, crearPlan, crearNuevaVersionPlan, crearSuscripcionActiva, crearSuscripcionTrialEnTransaccion, programarCancelacionSuscripcion, publicarPlan, renovarSuscripcion, retirarVersionPlan, revocarCancelacionSuscripcion, transicionarEmpresa, transicionarSuscripcion } from "./service";

class Ref { constructor(public path: string) {} collection(id: string) { return new Ref(`${this.path}/${id}`); } doc(id: string) { return new Ref(`${this.path}/${id}`); } }
class Snap { constructor(private readonly v: any) {} get exists() { return this.v !== undefined; } data() { return structuredClone(this.v); } }
class Db { docs = new Map<string, any>(); private queue = Promise.resolve(); collection(n: string) { return new Ref(n); } seed(k: string, v: any) { this.docs.set(k, structuredClone(v)); } read(k: string) { return this.docs.get(k); } async runTransaction<T>(cb: (tx: any) => Promise<T>) { let release!: () => void; const before = this.queue; this.queue = new Promise(r => release = r); await before; const w = new Map([...this.docs].map(([k,v]) => [k, structuredClone(v)])); const tx = { get: async (r: Ref) => new Snap(w.get(r.path)), create: (r: Ref, v: any) => { if (w.has(r.path)) throw new Error("EXISTS"); w.set(r.path, structuredClone(v)); }, update: (r: Ref, v: any) => { if (!w.has(r.path)) throw new Error("MISSING"); const cur = { ...w.get(r.path) }; for (const [k, val] of Object.entries(v)) { if (val && (val === FieldValue.delete() || (val as any)._methodName === "delete" || (typeof val === "object" && Object.keys(val as object).length === 0))) { delete cur[k]; } else { cur[k] = structuredClone(val); } } w.set(r.path, cur); } }; try { const r = await cb(tx); this.docs = w; return r; } finally { release(); } } }
const ctx = { actorId: "operator_1", origen: "PLATFORM" as const };
const env = (n: string, rev = 1) => ({ commandId: `cmd_${n}`, idempotencyKey: `idem_${n}`, correlationId: `corr_${n}`, causationId: `cause_${n}`, expectedRevision: rev, motivo: "operacion administrativa" });

test("B3 confirms a platform audit obligation in the commercial transaction", async () => {
  const db = new Db();
  const contextoConObligacion = {
    ...ctx,
    registrarResultadoEnTransaccion: (tx: any) => tx.create(
      db.collection("saas_auditoria_obligaciones").doc("plan_atomic"),
      { estado: "PENDIENTE" },
    ),
  };

  await crearPlan(db as any, {
    ...env("plan_atomic"),
    planId: "plan_atomic",
    codigo: "ATOMIC",
    capacidades: [],
    limites: {},
    periodicidad: "MENSUAL",
    grandfathered: false,
  }, contextoConObligacion);

  assert.equal(db.read("planes/plan_atomic").planId, "plan_atomic");
  assert.equal(db.read("saas_auditoria_obligaciones/plan_atomic").estado, "PENDIENTE");
});

test("B3 aborts the aggregate commit when its durable audit obligation cannot be created", async () => {
  const db = new Db();
  await assert.rejects(
    crearPlan(db as any, {
      ...env("plan_atomic_failure"),
      planId: "plan_atomic_failure",
      codigo: "ATOMIC_FAIL",
      capacidades: [],
      limites: {},
      periodicidad: "MENSUAL",
      grandfathered: false,
    }, {
      ...ctx,
      registrarResultadoEnTransaccion: () => { throw new Error("AUDIT_OBLIGATION_WRITE_FAILED"); },
    }),
    /AUDIT_OBLIGATION_WRITE_FAILED/,
  );

  assert.equal(db.read("planes/plan_atomic_failure"), undefined);
  assert.equal(db.read("comandos_comerciales/com_"), undefined);
});
async function planPublicado(db: Db) { await crearPlan(db as any, { ...env("plan"), planId: "plan_base", codigo: "BASE", capacidades: ["pos"], limites: {}, periodicidad: "MENSUAL", grandfathered: false }, ctx); await publicarPlan(db as any, { ...env("publicar"), planId: "plan_base", planVersion: 1 }, ctx); }

test("B3 valida fechas comerciales canónicas y readiness con límites inclusivos", () => {
  assert.equal(esFechaComercial("2028-02-29"), true); assert.equal(esFechaComercial("2026-02-29"), false); assert.equal(esFechaComercial("2026-7-01"), false);
  assert.equal(fechaComercialUtc(new Date("2026-07-31T23:30:00-05:00")), "2026-08-01");
  const sPast: Suscripcion = { empresaId: "empresa_1", planId: "plan_base", planVersion: 1, estado: "past_due", graceFin: "2026-07-31", revision: 1, schemaVersion: 1 };
  assert.equal(readinessComercial(sPast, "2026-07-31"), true); assert.equal(readinessComercial(sPast, "2026-08-01"), false);
  const sActive: Suscripcion = { empresaId: "empresa_1", planId: "plan_base", planVersion: 1, estado: "active", periodoInicio: "2026-07-01", periodoFin: "2026-07-31", revision: 1, schemaVersion: 1 };
  assert.equal(readinessComercial(sActive, "2026-07-31"), true); assert.equal(readinessComercial(sActive, "2026-08-01"), false);
});

test("B3 publica versiones inmutables, permite crear versiones superiores y mantiene grandfathering", async () => {
  const db = new Db(); await crearPlan(db as any, { ...env("grandfather"), planId: "plan_legacy", codigo: "LEGACY", capacidades: [], limites: {}, periodicidad: "SIN_VENCIMIENTO", grandfathered: true }, ctx); await publicarPlan(db as any, { ...env("publicar_legacy"), planId: "plan_legacy", planVersion: 1 }, ctx);
  assert.equal(db.read("planes/plan_legacy/versiones/1").estado, "PUBLICADA"); assert.equal(db.read("planes/plan_legacy/versiones/1").grandfathered, true);
  await assert.rejects(publicarPlan(db as any, { ...env("republicar", 2), planId: "plan_legacy", planVersion: 1 }, ctx), /PLAN_TRANSITION_INVALID/);

  // Crear y publicar versión 2 sobre el plan existente
  await crearNuevaVersionPlan(db as any, { ...env("ver2"), planId: "plan_legacy", codigo: "LEGACY_V2", capacidades: ["pos_v2"], limites: {}, periodicidad: "MENSUAL", grandfathered: false }, ctx);
  assert.equal(db.read("planes/plan_legacy/versiones/2").estado, "BORRADOR");
  await publicarPlan(db as any, { ...env("publicar_ver2"), planId: "plan_legacy", planVersion: 2 }, ctx);
  assert.equal(db.read("planes/plan_legacy/versiones/2").estado, "PUBLICADA");
  assert.equal(db.read("planes/plan_legacy/versiones/1").estado, "PUBLICADA"); // Versión 1 permanece inalterada
});

test("B2 completa lifecycle comercial sin alterar referencias publicadas o lifecycle Empresa", async () => {
  const db = new Db();
  await crearPlan(db as any, { ...env("plan_editable"), planId: "plan_editable", codigo: "EDITABLE", capacidades: ["pos"], limites: {}, periodicidad: "MENSUAL", grandfathered: false }, ctx);
  await actualizarBorradorPlan(db as any, { ...env("editar_plan"), planId: "plan_editable", planVersion: 1, capacidades: ["pos", "reportes"], limites: {}, periodicidad: "ANUAL", grandfathered: false }, ctx);
  assert.deepEqual(db.read("planes/plan_editable/versiones/1").capacidades, ["pos", "reportes"]);
  await publicarPlan(db as any, { ...env("publicar_editado", 2), planId: "plan_editable", planVersion: 1 }, ctx);

  db.seed("empresas/empresa_comercial", { empresaId: "empresa_comercial", estado: "suspendida", revision: 1 });
  await crearSuscripcionActiva(db as any, { ...env("alta_comercial"), empresaId: "empresa_comercial", planId: "plan_editable", planVersion: 1, periodoInicio: "2026-01-01", periodoFin: "2026-12-31" }, ctx);
  await renovarSuscripcion(db as any, { ...env("renovar_comercial"), empresaId: "empresa_comercial", periodoInicio: "2027-01-01", periodoFin: "2027-12-31" }, ctx);
  await programarCancelacionSuscripcion(db as any, { ...env("programar_cancelacion", 2), empresaId: "empresa_comercial", cancelacionProgramadaPara: "2027-12-31" }, ctx);
  await revocarCancelacionSuscripcion(db as any, { ...env("revocar_cancelacion", 3), empresaId: "empresa_comercial" }, ctx);
  await cambiarPlanSuscripcion(db as any, { ...env("cambiar_plan", 4), empresaId: "empresa_comercial", planId: "plan_editable", planVersion: 1 }, ctx);
  assert.equal(db.read("suscripciones/empresa_comercial").revision, 5);
  assert.equal(db.read("empresas/empresa_comercial").estado, "suspendida");

  await retirarVersionPlan(db as any, { ...env("retirar_plan", 3), planId: "plan_editable", planVersion: 1 }, ctx);
  assert.equal(db.read("planes/plan_editable/versiones/1").estado, "RETIRADA");
  assert.equal(db.read("suscripciones/empresa_comercial").planVersion, 1);
});

test("B3 crea una suscripción comercial única, idempotente y auditada con eventos PascalCase", async () => {
  const db = new Db(); db.seed("empresas/empresa_1", { empresaId: "empresa_1", estado: "trial", revision: 1 }); await planPublicado(db);
  const e = { ...env("alta"), empresaId: "empresa_1", planId: "plan_base", planVersion: 1, periodoInicio: "2026-07-01", periodoFin: "2026-08-01" };
  assert.equal((await crearSuscripcionActiva(db as any, e, ctx)).idempotente, false); assert.equal((await crearSuscripcionActiva(db as any, e, ctx)).idempotente, true);
  assert.equal(db.read("suscripciones/empresa_1").estado, "active"); assert.ok([...db.docs.values()].some(v => v.tipo === "SuscripcionCreada"));
});

test("B3 provee el primitive trial atómico para B5 sin iniciar bootstrap", async () => {
  const db = new Db(); await planPublicado(db);
  await db.runTransaction(tx => crearSuscripcionTrialEnTransaccion(db as any, tx, { ...env("trial"), empresaId: "empresa_trial", planId: "plan_base", planVersion: 1, trialInicio: "2026-07-01", trialFin: "2026-07-15" }, ctx));
  assert.equal(db.read("suscripciones/empresa_trial").estado, "trialing"); assert.ok([...db.docs.values()].some(v => v.tipo === "TrialIniciado"));
});

test("B3 no convierte Suscripción en autoridad, limpia graceFin al regularizar y emite eventos PascalCase", async () => {
  const db = new Db(); db.seed("empresas/empresa_1", { empresaId: "empresa_1", estado: "suspendida", revision: 1 }); await planPublicado(db);
  await crearSuscripcionActiva(db as any, { ...env("alta2"), empresaId: "empresa_1", planId: "plan_base", planVersion: 1, periodoInicio: "2026-07-01", periodoFin: "2099-08-01" }, ctx);
  await transicionarSuscripcion(db as any, { ...env("mora"), empresaId: "empresa_1", destino: "past_due", graceFin: "2099-08-02" }, ctx);
  assert.equal(db.read("suscripciones/empresa_1").graceFin, "2099-08-02");
  
  await transicionarSuscripcion(db as any, { ...env("regularizar", 2), empresaId: "empresa_1", destino: "active", periodoInicio: "2099-08-02", periodoFin: "2099-09-02" }, ctx);
  assert.equal(db.read("suscripciones/empresa_1").graceFin, undefined); // Verificación de limpieza de graceFin
  assert.equal(db.read("empresas/empresa_1").estado, "suspendida");
  
  await transicionarEmpresa(db as any, { ...env("reactivar_empresa"), empresaId: "empresa_1", destino: "activa" }, ctx);
  assert.equal(db.read("empresas/empresa_1").estado, "activa"); assert.ok([...db.docs.values()].some(v => v.tipo === "EmpresaActiva"));
});

test("B3 rechaza carrera de lifecycle por revisión y conserva auditoría", async () => {
  const db = new Db(); db.seed("empresas/empresa_1", { empresaId: "empresa_1", estado: "activa", revision: 1 });
  const [a,b] = await Promise.allSettled([transicionarEmpresa(db as any, { ...env("suspender_a"), empresaId: "empresa_1", destino: "suspendida" }, ctx), transicionarEmpresa(db as any, { ...env("cancelar_b"), empresaId: "empresa_1", destino: "cancelada" }, ctx)]);
  assert.equal([a,b].filter(x => x.status === "fulfilled").length, 1); assert.equal(db.read("empresas/empresa_1").revision, 2); assert.ok([...db.docs.values()].some(v => v.agregado === "EMPRESA"));
});

test("B3 rechaza transiciones inválidas de máquina de estados y readiness incompleta", async () => {
  const db = new Db();
  db.seed("empresas/empresa_invalid", { empresaId: "empresa_invalid", estado: "trial", revision: 1 });
  await planPublicado(db);

  // Intentar transición prohibida trial -> archivada
  await assert.rejects(
    transicionarEmpresa(db as any, { ...env("trial_archivada"), empresaId: "empresa_invalid", destino: "archivada" }, ctx),
    /EMPRESA_TRANSITION_INVALID/
  );

  // Intentar transicionar a activa sin suscripción (readiness incompleta)
  await assert.rejects(
    transicionarEmpresa(db as any, { ...env("trial_activa_sin_sub"), empresaId: "empresa_invalid", destino: "activa" }, ctx),
    /READINESS_COMERCIAL_INCOMPLETA/
  );

  // Crear suscripción vencida e intentar transicionar empresa a activa
  await crearSuscripcionActiva(db as any, { ...env("sub_vencida"), empresaId: "empresa_invalid", planId: "plan_base", planVersion: 1, periodoInicio: "2020-01-01", periodoFin: "2020-01-31" }, ctx);
  await assert.rejects(
    transicionarEmpresa(db as any, { ...env("trial_activa_sub_vencida"), empresaId: "empresa_invalid", destino: "activa" }, ctx),
    /READINESS_COMERCIAL_INCOMPLETA/
  );

  // Intentar gracia inválida (graceFin < periodoFin)
  await assert.rejects(
    transicionarSuscripcion(db as any, { ...env("gracia_invalida"), empresaId: "empresa_invalid", destino: "past_due", graceFin: "2019-12-31" }, ctx),
    /GRACIA_INVALIDA/
  );
});

