import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { esFechaComercial, esIdComercial, fechaComercialUtc, rangoComercialValido, readinessComercial, transicionesEmpresa, transicionesSuscripcion, type EmpresaLifecycle, type PlanVersion, type SnapshotContrato, type Suscripcion } from "../../../lib/suscripciones/contrato";
import {
  ejecutarComandoConfiguracionConEstadoPreleidoEnTransaccion,
  leerComandoConfiguracionEnTransaccion,
  referenciasComandoConfiguracion,
  type ContextoComandoConfiguracion,
  type EntradaComandoConfiguracion,
} from "../configuracion/service";

type Envelope = { commandId: string; idempotencyKey: string; correlationId: string; causationId: string; expectedRevision: number; motivo: string };
export type ContextoComercial = {
  actorId: string;
  origen: "PLATFORM" | "SYSTEM" | "COMMERCIAL";
  /**
   * Identificador ya asignado (ADR-SAAS-012 Anexo A) de la obligación de auditoría
   * que la capa orquestadora crea en la misma transacción vía
   * `registrarResultadoEnTransaccion`. Se persiste junto al resultado durable para
   * que un reintento idempotente lo recupere en vez de perderlo.
   */
  obligacionId?: string;
  /**
   * Extensión interna para que una capa orquestadora registre sus obligaciones
   * en la misma transacción que confirma el agregado. No concede capacidades
   * ni reemplaza la auditoría canónica comercial.
   */
  registrarResultadoEnTransaccion?: (tx: any, resultado: unknown) => { obligacionId: string } | void;
};
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const id = (p: string, k: string) => `${p}_${hash(k)}`;
const fail = (code: "invalid-argument" | "already-exists" | "failed-precondition" | "not-found", msg: string): never => { throw new HttpsError(code, msg); };
function validar(e: Envelope) { if (!e || !esIdComercial(e.commandId) || !esIdComercial(e.idempotencyKey) || !esIdComercial(e.correlationId) || !esIdComercial(e.causationId) || !Number.isInteger(e.expectedRevision) || e.expectedRevision < 1 || !e.motivo.trim()) fail("invalid-argument", "ENVELOPE_COMERCIAL_INVALIDO"); }
function comandoRef(db: Firestore, e: Envelope) { return db.collection("comandos_comerciales").doc(id("com", e.idempotencyKey)); }
function commandIdRef(db: Firestore, e: Envelope) { return db.collection("configuracion_command_ids").doc(`cfgcmdid_${hash(e.commandId)}`); }
async function previo(tx: any, db: Firestore, e: Envelope, empresaId: string, fingerprint: string) { const [a, b] = await Promise.all([tx.get(comandoRef(db, e)), tx.get(commandIdRef(db, e))]); for (const s of [b, a]) if (s.exists) { const d = s.data(); if (d.commandId !== e.commandId || d.idempotencyKey !== e.idempotencyKey || d.fingerprint !== fingerprint || d.empresaId !== empresaId) fail("already-exists", s === b ? "COMMAND_ID_CONFLICT" : "IDEMPOTENCY_CONFLICT"); return { ...d.resultado, obligacionId: d.obligacionId ?? undefined }; } }
function registrar(tx: any, db: Firestore, e: Envelope, empresaId: string, fingerprint: string, resultado: unknown, tipo: string, agregado: string, anterior: number, nueva: number, ctx: ContextoComercial) {
  const base = { empresaId, commandId: e.commandId, idempotencyKey: e.idempotencyKey, fingerprint, resultado, obligacionId: ctx.obligacionId ?? null, creadoEn: FieldValue.serverTimestamp() };
  tx.create(comandoRef(db, e), base); tx.create(commandIdRef(db, e), base);
  tx.create(db.collection("auditoria_logs").doc(id("comaudit", e.commandId)), { ...base, comando: tipo, agregado, revisionAnterior: anterior, revisionNueva: nueva, actorId: ctx.actorId, origen: ctx.origen, motivo: e.motivo });
  tx.create(db.collection("eventos_dominio").doc(id("comevent", e.commandId)), { eventId: id("comevent", e.commandId), tipo, version: 1, agregado, empresaId, revisionAnterior: anterior, revisionNueva: nueva, actorId: ctx.actorId, origen: ctx.origen, commandId: e.commandId, correlationId: e.correlationId, causationId: e.causationId, creadoEn: FieldValue.serverTimestamp() });
  ctx.registrarResultadoEnTransaccion?.(tx, resultado);
}
const toPascal = (s: string) => s.split("_").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("");

function validarOfertaPlan(plan: Pick<PlanVersion, "periodicidad" | "precio">) {
  if (!["MENSUAL", "ANUAL", "SIN_VENCIMIENTO"].includes(plan.periodicidad)) {
    fail("invalid-argument", "PLAN_PERIODICIDAD_INVALIDA");
  }
  if (plan.precio !== undefined && (!Number.isSafeInteger(plan.precio.importe) || plan.precio.importe < 0 || typeof plan.precio.moneda !== "string" || !/^[A-Z]{3}$/.test(plan.precio.moneda))) {
    fail("invalid-argument", "PLAN_PRECIO_INVALIDO");
  }
  if (plan.periodicidad === "ANUAL" && (!plan.precio || plan.precio.importe <= 0 || plan.precio.moneda !== "COP")) {
    fail("invalid-argument", "PLAN_ANUAL_PRECIO_REQUERIDO");
  }
}

function construirSnapshotContrato(plan: PlanVersion, inicio: string, fin: string): SnapshotContrato | undefined {
  if (plan.periodicidad !== "ANUAL") return undefined;
  validarOfertaPlan(plan);
  if (!rangoComercialValido(inicio, fin) || !plan.precio) fail("invalid-argument", "SNAPSHOT_CONTRATO_INVALIDO");
  const precio = plan.precio!;
  return {
    schemaVersion: 1,
    planId: plan.planId,
    planVersion: plan.planVersion,
    codigoPlan: plan.codigo,
    periodicidad: "ANUAL",
    precio: { importe: precio.importe, moneda: precio.moneda },
    capacidades: [...plan.capacidades],
    limites: JSON.parse(JSON.stringify(plan.limites ?? {})) as PlanVersion["limites"],
    sedeConceptual: { cantidad: 1 },
    fiscalidad: null,
    vigencia: { inicio, fin },
  };
}

function diasEntre(inicio: string, fin: string) {
  return (Date.parse(`${fin}T00:00:00.000Z`) - Date.parse(`${inicio}T00:00:00.000Z`)) / 86_400_000;
}

function sumarAnio(fecha: string) {
  const [year, month, day] = fecha.split("-").map(Number);
  const nextYear = year + 1;
  const ultimoDia = new Date(Date.UTC(nextYear, month, 0)).getUTCDate();
  return fechaComercialUtc(new Date(Date.UTC(nextYear, month - 1, Math.min(day, ultimoDia))));
}

function referenciaPagoId(empresaId: string, referenciaPago: string) {
  return id("pago", `${empresaId}:${referenciaPago}`);
}

export async function crearPlan(db: Firestore, entrada: Envelope & Omit<PlanVersion, "planVersion" | "estado" | "revision" | "schemaVersion">, ctx: ContextoComercial) {
  validar(entrada); if (!esIdComercial(entrada.planId) || !/^[A-Z][A-Z0-9_-]{1,39}$/.test(entrada.codigo) || !Array.isArray(entrada.capacidades) || entrada.capacidades.some(x => !esIdComercial(x))) fail("invalid-argument", "PLAN_INVALIDO"); validarOfertaPlan(entrada);
  const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, "PLATFORM", f); if (p) return { ...p, idempotente: true }; const root = db.collection("planes").doc(entrada.planId), version = root.collection("versiones").doc("1"); if ((await tx.get(root)).exists) fail("already-exists", "PLAN_EXISTS"); const plan: PlanVersion = { ...entrada, planVersion: 1, estado: "BORRADOR", revision: 1, schemaVersion: 1 }; tx.create(root, { planId: plan.planId, codigo: plan.codigo, revision: 1, versionActual: 1, creadaEn: FieldValue.serverTimestamp() }); tx.create(version, { ...plan, creadaEn: FieldValue.serverTimestamp() }); const r = { planId: plan.planId, planVersion: 1 }; registrar(tx, db, entrada, "PLATFORM", f, r, "PlanCreado", "PLAN", 0, 1, ctx); return { ...r, idempotente: false }; });
}
export async function crearNuevaVersionPlan(db: Firestore, entrada: Envelope & Omit<PlanVersion, "planVersion" | "estado" | "revision" | "schemaVersion">, ctx: ContextoComercial) {
  validar(entrada); if (!esIdComercial(entrada.planId) || !/^[A-Z][A-Z0-9_-]{1,39}$/.test(entrada.codigo) || !Array.isArray(entrada.capacidades) || entrada.capacidades.some(x => !esIdComercial(x))) fail("invalid-argument", "PLAN_INVALIDO"); validarOfertaPlan(entrada);
  const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, "PLATFORM", f); if (p) return { ...p, idempotente: true }; const root = db.collection("planes").doc(entrada.planId); const snap = await tx.get(root); if (!snap.exists) fail("not-found", "PLAN_NOT_FOUND"); const rData = snap.data() as { versionActual: number; revision: number }; const nuevaVersion = (rData.versionActual || 1) + 1; const versionRef = root.collection("versiones").doc(String(nuevaVersion)); if ((await tx.get(versionRef)).exists) fail("already-exists", "PLAN_VERSION_EXISTS"); const plan: PlanVersion = { ...entrada, planVersion: nuevaVersion, estado: "BORRADOR", revision: 1, schemaVersion: 1 }; tx.update(root, { versionActual: nuevaVersion, revision: rData.revision + 1, actualizadaEn: FieldValue.serverTimestamp() }); tx.create(versionRef, { ...plan, creadaEn: FieldValue.serverTimestamp() }); const r = { planId: plan.planId, planVersion: nuevaVersion }; registrar(tx, db, entrada, "PLATFORM", f, r, "VersionPlanCreada", "PLAN", rData.revision, rData.revision + 1, ctx); return { ...r, idempotente: false }; });
}
export async function publicarPlan(db: Firestore, entrada: Envelope & { planId: string; planVersion: number }, ctx: ContextoComercial) { validar(entrada); if (!esIdComercial(entrada.planId) || !Number.isInteger(entrada.planVersion) || entrada.planVersion < 1) fail("invalid-argument", "PLAN_INVALIDO"); const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, "PLATFORM", f); if (p) return { ...p, idempotente: true }; const ref = db.collection("planes").doc(entrada.planId).collection("versiones").doc(String(entrada.planVersion)); const snap = await tx.get(ref); if (!snap.exists) fail("not-found", "PLAN_NOT_FOUND"); const plan = snap.data() as PlanVersion; if (plan.revision !== entrada.expectedRevision || plan.estado !== "BORRADOR") fail("failed-precondition", "PLAN_TRANSITION_INVALID"); tx.update(ref, { estado: "PUBLICADA", revision: plan.revision + 1, publicadaEn: FieldValue.serverTimestamp() }); const r = { planId: plan.planId, planVersion: plan.planVersion, revision: plan.revision + 1 }; registrar(tx, db, entrada, "PLATFORM", f, r, "VersionPlanPublicada", "PLAN", plan.revision, plan.revision + 1, ctx); return { ...r, idempotente: false }; }); }
export async function actualizarBorradorPlan(db: Firestore, entrada: Envelope & { planId: string; planVersion: number; capacidades: string[]; limites: PlanVersion["limites"]; periodicidad: PlanVersion["periodicidad"]; grandfathered: boolean; precio?: PlanVersion["precio"] }, ctx: ContextoComercial) {
  validar(entrada); if (!esIdComercial(entrada.planId) || !Number.isInteger(entrada.planVersion) || entrada.planVersion < 1 || !Array.isArray(entrada.capacidades) || entrada.capacidades.some(x => !esIdComercial(x)) || !["MENSUAL", "ANUAL", "SIN_VENCIMIENTO"].includes(entrada.periodicidad) || typeof entrada.grandfathered !== "boolean" || !entrada.limites || typeof entrada.limites !== "object") fail("invalid-argument", "PLAN_INVALIDO"); validarOfertaPlan(entrada);
  const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, "PLATFORM", f); if (p) return { ...p, idempotente: true }; const ref = db.collection("planes").doc(entrada.planId).collection("versiones").doc(String(entrada.planVersion)); const snap = await tx.get(ref); if (!snap.exists) fail("not-found", "PLAN_NOT_FOUND"); const plan = snap.data() as PlanVersion; if (plan.revision !== entrada.expectedRevision || plan.estado !== "BORRADOR") fail("failed-precondition", "PLAN_TRANSITION_INVALID"); const revision = plan.revision + 1; tx.update(ref, { capacidades: entrada.capacidades, limites: entrada.limites, periodicidad: entrada.periodicidad, grandfathered: entrada.grandfathered, ...(entrada.precio ? { precio: entrada.precio } : {}), revision, actualizadaEn: FieldValue.serverTimestamp() }); const r = { planId: plan.planId, planVersion: plan.planVersion, revision }; registrar(tx, db, entrada, "PLATFORM", f, r, "BorradorPlanActualizado", "PLAN", plan.revision, revision, ctx); return { ...r, idempotente: false }; });
}
export async function retirarVersionPlan(db: Firestore, entrada: Envelope & { planId: string; planVersion: number }, ctx: ContextoComercial) {
  validar(entrada); if (!esIdComercial(entrada.planId) || !Number.isInteger(entrada.planVersion) || entrada.planVersion < 1) fail("invalid-argument", "PLAN_INVALIDO");
  const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, "PLATFORM", f); if (p) return { ...p, idempotente: true }; const ref = db.collection("planes").doc(entrada.planId).collection("versiones").doc(String(entrada.planVersion)); const snap = await tx.get(ref); if (!snap.exists) fail("not-found", "PLAN_NOT_FOUND"); const plan = snap.data() as PlanVersion; if (plan.revision !== entrada.expectedRevision || plan.estado !== "PUBLICADA") fail("failed-precondition", "PLAN_TRANSITION_INVALID"); const revision = plan.revision + 1; tx.update(ref, { estado: "RETIRADA", revision, retiradaEn: FieldValue.serverTimestamp() }); const r = { planId: plan.planId, planVersion: plan.planVersion, revision }; registrar(tx, db, entrada, "PLATFORM", f, r, "VersionPlanRetirada", "PLAN", plan.revision, revision, ctx); return { ...r, idempotente: false }; });
}
export async function crearSuscripcionActiva(db: Firestore, entrada: Envelope & { empresaId: string; planId: string; planVersion: number; periodoInicio: string; periodoFin: string }, ctx: ContextoComercial) { validar(entrada); if (!esIdComercial(entrada.empresaId) || !esIdComercial(entrada.planId) || !esFechaComercial(entrada.periodoInicio) || !esFechaComercial(entrada.periodoFin) || entrada.periodoInicio >= entrada.periodoFin) fail("invalid-argument", "SUSCRIPCION_INVALIDA"); const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, entrada.empresaId, f); if (p) return { ...p, idempotente: true }; const [empresa, plan, sub] = await Promise.all([tx.get(db.collection("empresas").doc(entrada.empresaId)), tx.get(db.collection("planes").doc(entrada.planId).collection("versiones").doc(String(entrada.planVersion))), tx.get(db.collection("suscripciones").doc(entrada.empresaId))]); if (!empresa.exists) fail("not-found", "EMPRESA_NOT_FOUND"); if (!plan.exists || (plan.data() as PlanVersion).estado !== "PUBLICADA") fail("failed-precondition", "PLAN_NOT_ADMISSIBLE"); if (sub.exists) fail("already-exists", "SUSCRIPCION_EXISTS"); const planData = plan.data() as PlanVersion; const snapshotContrato = construirSnapshotContrato(planData, entrada.periodoInicio, entrada.periodoFin); const s: Suscripcion = { empresaId: entrada.empresaId, planId: entrada.planId, planVersion: entrada.planVersion, estado: "active", periodoInicio: entrada.periodoInicio, periodoFin: entrada.periodoFin, ...(snapshotContrato ? { snapshotContrato } : {}), revision: 1, schemaVersion: 1 }; tx.create(db.collection("suscripciones").doc(entrada.empresaId), { ...s, creadaEn: FieldValue.serverTimestamp() }); const r = { empresaId: s.empresaId, revision: 1 }; registrar(tx, db, entrada, entrada.empresaId, f, r, "SuscripcionCreada", "SUSCRIPCION", 0, 1, ctx); return { ...r, idempotente: false }; }); }
/** Primitive B3 para que B5 componga el core atómico; no inicia Bootstrap ni es callable. */
export type LecturasTrialPreleidas = {
  comando: any;
  commandId: any;
  plan: any;
  suscripcion: any;
};

export type OpcionesTrial = {
  fingerprintInput?: unknown;
};

export function referenciasTrial(db: Firestore, entrada: Envelope & { empresaId: string; planId: string; planVersion: number }) {
  return {
    comando: comandoRef(db, entrada),
    commandId: commandIdRef(db, entrada),
    plan: db.collection("planes").doc(entrada.planId).collection("versiones").doc(String(entrada.planVersion)),
    suscripcion: db.collection("suscripciones").doc(entrada.empresaId),
  };
}

function previoPreleido(lecturas: LecturasTrialPreleidas, entrada: Envelope, empresaId: string, fingerprint: string) {
  for (const snap of [lecturas.commandId, lecturas.comando]) {
    if (!snap.exists) continue;
    const data = snap.data();
    if (data.commandId !== entrada.commandId || data.idempotencyKey !== entrada.idempotencyKey || data.fingerprint !== fingerprint || data.empresaId !== empresaId) {
      fail("already-exists", snap === lecturas.commandId ? "COMMAND_ID_CONFLICT" : "IDEMPOTENCY_CONFLICT");
    }
    return { ...data.resultado, obligacionId: data.obligacionId ?? undefined };
  }
}

export async function crearSuscripcionTrialEnTransaccion(
  db: Firestore,
  tx: any,
  entrada: Envelope & { empresaId: string; planId: string; planVersion: number; trialInicio: string; trialFin: string },
  ctx: ContextoComercial,
  lecturasPreleidas?: LecturasTrialPreleidas,
  opciones?: OpcionesTrial,
) {
  validar(entrada);
  if (!esIdComercial(entrada.empresaId) || !esIdComercial(entrada.planId) || !esFechaComercial(entrada.trialInicio) || !esFechaComercial(entrada.trialFin) || entrada.trialInicio >= entrada.trialFin) fail("invalid-argument", "TRIAL_INVALIDO");
  const f = hash(opciones?.fingerprintInput ?? entrada);
  const p = lecturasPreleidas
    ? previoPreleido(lecturasPreleidas, entrada, entrada.empresaId, f)
    : await previo(tx, db, entrada, entrada.empresaId, f);
  if (p) return { ...p, idempotente: true };
  const lecturas = lecturasPreleidas ?? await (async () => {
    const refs = referenciasTrial(db, entrada);
    const [comando, commandId, plan, suscripcion] = await Promise.all([
      tx.get(refs.comando), tx.get(refs.commandId), tx.get(refs.plan), tx.get(refs.suscripcion),
    ]);
    return { comando, commandId, plan, suscripcion };
  })();
  if (!lecturas.plan.exists || (lecturas.plan.data() as PlanVersion).estado !== "PUBLICADA") fail("failed-precondition", "PLAN_NOT_ADMISSIBLE");
  const planData = lecturas.plan.data() as PlanVersion;
  if (planData.periodicidad === "ANUAL" && diasEntre(entrada.trialInicio, entrada.trialFin) !== 30) fail("invalid-argument", "TRIAL_ANUAL_DEBE_SER_30_DIAS");
  if (lecturas.suscripcion.exists) fail("already-exists", "SUSCRIPCION_EXISTS");
  const snapshotContrato = construirSnapshotContrato(planData, entrada.trialInicio, entrada.trialFin);
  const s: Suscripcion = { empresaId: entrada.empresaId, planId: entrada.planId, planVersion: entrada.planVersion, estado: "trialing", trialInicio: entrada.trialInicio, trialFin: entrada.trialFin, ...(snapshotContrato ? { snapshotContrato } : {}), revision: 1, schemaVersion: 1 };
  tx.create(db.collection("suscripciones").doc(entrada.empresaId), { ...s, creadaEn: FieldValue.serverTimestamp() });
  const r = { empresaId: s.empresaId, revision: 1, trialInicio: s.trialInicio, trialFin: s.trialFin };
  registrar(tx, db, entrada, s.empresaId, f, r, "TrialIniciado", "SUSCRIPCION", 0, 1, ctx);
  return { ...r, idempotente: false };
}

export async function crearSuscripcionTrial(
  db: Firestore,
  entrada: Envelope & { empresaId: string; planId: string; planVersion: number; trialDias: number },
  ctx: ContextoComercial,
) {
  validar(entrada);
  if (
    !esIdComercial(entrada.empresaId)
    || !esIdComercial(entrada.planId)
    || !Number.isInteger(entrada.planVersion)
    || entrada.planVersion < 1
    || !Number.isSafeInteger(entrada.trialDias)
    || entrada.trialDias < 1
  ) fail("invalid-argument", "TRIAL_INVALIDO");

  const ahoraMs = Date.now();
  const inicio = new Date(ahoraMs);
  const fin = new Date(ahoraMs + entrada.trialDias * 86_400_000);
  if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fin.getTime())) fail("invalid-argument", "TRIAL_INVALIDO");
  const trialInicio = fechaComercialUtc(inicio);
  const trialFin = fechaComercialUtc(fin);
  const entradaTrial = { ...entrada, trialInicio, trialFin };
  const fingerprintInput = {
    commandId: entrada.commandId,
    idempotencyKey: entrada.idempotencyKey,
    correlationId: entrada.correlationId,
    causationId: entrada.causationId,
    expectedRevision: entrada.expectedRevision,
    motivo: entrada.motivo,
    empresaId: entrada.empresaId,
    planId: entrada.planId,
    planVersion: entrada.planVersion,
    trialDias: entrada.trialDias,
  };

  return db.runTransaction(async (tx) => {
    const refs = referenciasTrial(db, entradaTrial);
    const [empresa, comando, commandId, plan, suscripcion] = await Promise.all([
      tx.get(db.collection("empresas").doc(entrada.empresaId)),
      tx.get(refs.comando),
      tx.get(refs.commandId),
      tx.get(refs.plan),
      tx.get(refs.suscripcion),
    ]);
    if (!comando.exists && !commandId.exists) {
      if (!empresa.exists) fail("not-found", "EMPRESA_NOT_FOUND");
      const estado = empresa.data()?.estado;
      if (estado !== "trial" && estado !== "activa") fail("failed-precondition", "EMPRESA_NOT_OPERATIONAL");
    }
    return crearSuscripcionTrialEnTransaccion(
      db,
      tx,
      entradaTrial,
      ctx,
      { comando, commandId, plan, suscripcion },
      { fingerprintInput },
    );
  });
}

export async function transicionarSuscripcion(db: Firestore, entrada: Envelope & { empresaId: string; destino: Suscripcion["estado"]; graceFin?: string; periodoInicio?: string; periodoFin?: string }, ctx: ContextoComercial) { validar(entrada); if (!esIdComercial(entrada.empresaId) || !["trialing","active","past_due","suspended","canceled"].includes(entrada.destino) || (entrada.graceFin !== undefined && !esFechaComercial(entrada.graceFin))) fail("invalid-argument", "SUSCRIPCION_INVALIDA"); const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, entrada.empresaId, f); if (p) return { ...p, idempotente: true }; const ref = db.collection("suscripciones").doc(entrada.empresaId), snap = await tx.get(ref); if (!snap.exists) fail("not-found", "SUSCRIPCION_NOT_FOUND"); const s = snap.data() as Suscripcion; if (s.revision !== entrada.expectedRevision || !transicionesSuscripcion[s.estado].includes(entrada.destino)) fail("failed-precondition", "SUSCRIPCION_TRANSITION_INVALID"); if (s.snapshotContrato?.periodicidad === "ANUAL" && entrada.destino === "past_due") fail("failed-precondition", "GRACIA_NO_APLICA"); if (s.snapshotContrato?.periodicidad === "ANUAL" && entrada.destino === "active") fail("failed-precondition", "PAGO_ANUAL_REQUERIDO"); if (entrada.destino === "past_due" && (!entrada.graceFin || (s.periodoFin && entrada.graceFin < s.periodoFin))) fail("invalid-argument", "GRACIA_INVALIDA"); if (entrada.destino === "active" && (!entrada.periodoInicio || !entrada.periodoFin || entrada.periodoInicio >= entrada.periodoFin || !esFechaComercial(entrada.periodoInicio) || !esFechaComercial(entrada.periodoFin))) fail("invalid-argument", "PERIODO_INVALIDO"); const revision = s.revision + 1; const upd: Record<string, any> = { estado: entrada.destino, revision, actualizadaEn: FieldValue.serverTimestamp() }; if (entrada.destino === "past_due") { upd.graceFin = entrada.graceFin; } else { upd.graceFin = FieldValue.delete(); } if (entrada.destino === "active") { upd.periodoInicio = entrada.periodoInicio; upd.periodoFin = entrada.periodoFin; upd.cancelacionProgramadaPara = FieldValue.delete(); } if (entrada.destino === "canceled") { upd.canceladaEn = fechaComercialUtc(); } tx.update(ref, upd); const r = { empresaId: s.empresaId, revision }; registrar(tx, db, entrada, s.empresaId, f, r, `Suscripcion${toPascal(entrada.destino)}`, "SUSCRIPCION", s.revision, revision, ctx); return { ...r, idempotente: false }; }); }
export async function renovarSuscripcion(db: Firestore, entrada: Envelope & { empresaId: string; periodoInicio: string; periodoFin: string }, ctx: ContextoComercial) {
  validar(entrada); if (!esIdComercial(entrada.empresaId) || !esFechaComercial(entrada.periodoInicio) || !esFechaComercial(entrada.periodoFin) || entrada.periodoInicio >= entrada.periodoFin) fail("invalid-argument", "PERIODO_INVALIDO");
  const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, entrada.empresaId, f); if (p) return { ...p, idempotente: true }; const ref = db.collection("suscripciones").doc(entrada.empresaId), snap = await tx.get(ref); if (!snap.exists) fail("not-found", "SUSCRIPCION_NOT_FOUND"); const s = snap.data() as Suscripcion; if (s.snapshotContrato?.periodicidad === "ANUAL") fail("failed-precondition", "PAGO_ANUAL_REQUERIDO"); if (s.revision !== entrada.expectedRevision || s.estado !== "active") fail("failed-precondition", "SUSCRIPCION_RENEWAL_INVALID"); const revision = s.revision + 1; tx.update(ref, { periodoInicio: entrada.periodoInicio, periodoFin: entrada.periodoFin, revision, actualizadaEn: FieldValue.serverTimestamp() }); const r = { empresaId: s.empresaId, revision }; registrar(tx, db, entrada, s.empresaId, f, r, "SuscripcionRenovada", "SUSCRIPCION", s.revision, revision, ctx); return { ...r, idempotente: false }; });
}
export async function cambiarPlanSuscripcion(db: Firestore, entrada: Envelope & { empresaId: string; planId: string; planVersion: number }, ctx: ContextoComercial) {
  validar(entrada); if (!esIdComercial(entrada.empresaId) || !esIdComercial(entrada.planId) || !Number.isInteger(entrada.planVersion) || entrada.planVersion < 1) fail("invalid-argument", "SUSCRIPCION_INVALIDA");
  const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, entrada.empresaId, f); if (p) return { ...p, idempotente: true }; const subRef = db.collection("suscripciones").doc(entrada.empresaId), planRef = db.collection("planes").doc(entrada.planId).collection("versiones").doc(String(entrada.planVersion)); const [subSnap, planSnap] = await Promise.all([tx.get(subRef), tx.get(planRef)]); if (!subSnap.exists) fail("not-found", "SUSCRIPCION_NOT_FOUND"); if (!planSnap.exists || (planSnap.data() as PlanVersion).estado !== "PUBLICADA") fail("failed-precondition", "PLAN_NOT_ADMISSIBLE"); const s = subSnap.data() as Suscripcion; if (s.revision !== entrada.expectedRevision || s.estado === "canceled") fail("failed-precondition", "SUSCRIPCION_PLAN_CHANGE_INVALID"); if (s.estado === "trialing") fail("failed-precondition", "SUSCRIPCION_PLAN_CAMBIO_NO_EN_TRIAL"); if (s.snapshotContrato) fail("failed-precondition", "SUSCRIPCION_CONTRATO_INMUTABLE"); const revision = s.revision + 1; tx.update(subRef, { planId: entrada.planId, planVersion: entrada.planVersion, revision, actualizadaEn: FieldValue.serverTimestamp() }); const r = { empresaId: s.empresaId, revision, planId: entrada.planId, planVersion: entrada.planVersion }; registrar(tx, db, entrada, s.empresaId, f, r, "SuscripcionPlanCambiado", "SUSCRIPCION", s.revision, revision, ctx); return { ...r, idempotente: false }; });
}
export async function programarCancelacionSuscripcion(db: Firestore, entrada: Envelope & { empresaId: string; cancelacionProgramadaPara: string }, ctx: ContextoComercial) {
  validar(entrada); if (!esIdComercial(entrada.empresaId) || !esFechaComercial(entrada.cancelacionProgramadaPara)) fail("invalid-argument", "CANCELACION_INVALIDA");
  const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, entrada.empresaId, f); if (p) return { ...p, idempotente: true }; const ref = db.collection("suscripciones").doc(entrada.empresaId), snap = await tx.get(ref); if (!snap.exists) fail("not-found", "SUSCRIPCION_NOT_FOUND"); const s = snap.data() as Suscripcion; if (s.revision !== entrada.expectedRevision || s.estado !== "active" || (s.periodoFin && entrada.cancelacionProgramadaPara > s.periodoFin) || (s.snapshotContrato?.periodicidad === "ANUAL" && entrada.cancelacionProgramadaPara !== s.periodoFin)) fail("failed-precondition", "CANCELACION_INVALIDA"); const revision = s.revision + 1; tx.update(ref, { cancelacionProgramadaPara: entrada.cancelacionProgramadaPara, revision, actualizadaEn: FieldValue.serverTimestamp() }); const r = { empresaId: s.empresaId, revision }; registrar(tx, db, entrada, s.empresaId, f, r, "SuscripcionCancelacionProgramada", "SUSCRIPCION", s.revision, revision, ctx); return { ...r, idempotente: false }; });
}
export async function revocarCancelacionSuscripcion(db: Firestore, entrada: Envelope & { empresaId: string }, ctx: ContextoComercial) {
  validar(entrada); if (!esIdComercial(entrada.empresaId)) fail("invalid-argument", "SUSCRIPCION_INVALIDA");
  const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, entrada.empresaId, f); if (p) return { ...p, idempotente: true }; const ref = db.collection("suscripciones").doc(entrada.empresaId), snap = await tx.get(ref); if (!snap.exists) fail("not-found", "SUSCRIPCION_NOT_FOUND"); const s = snap.data() as Suscripcion; if (s.revision !== entrada.expectedRevision || s.estado !== "active" || !s.cancelacionProgramadaPara) fail("failed-precondition", "CANCELACION_INVALIDA"); const revision = s.revision + 1; tx.update(ref, { cancelacionProgramadaPara: FieldValue.delete(), revision, actualizadaEn: FieldValue.serverTimestamp() }); const r = { empresaId: s.empresaId, revision }; registrar(tx, db, entrada, s.empresaId, f, r, "SuscripcionCancelacionRevocada", "SUSCRIPCION", s.revision, revision, ctx); return { ...r, idempotente: false }; });
}
export async function confirmarPagoAnualSuscripcion(
  db: Firestore,
  entrada: Envelope & { empresaId: string; referenciaPago: string },
  ctx: ContextoComercial,
) {
  validar(entrada);
  if (!esIdComercial(entrada.empresaId) || typeof entrada.referenciaPago !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(entrada.referenciaPago.trim())) fail("invalid-argument", "REFERENCIA_PAGO_INVALIDA");
  const referenciaPago = entrada.referenciaPago.trim();
  const f = hash(entrada);
  return db.runTransaction(async tx => {
    const p = await previo(tx, db, entrada, entrada.empresaId, f);
    if (p) return { ...p, idempotente: true };
    const subRef = db.collection("suscripciones").doc(entrada.empresaId);
    const empresaRef = db.collection("empresas").doc(entrada.empresaId);
    const reciboId = referenciaPagoId(entrada.empresaId, referenciaPago);
    const reciboRef = db.collection("pagos_saas").doc(reciboId);
    const [subSnap, empresaSnap, reciboSnap] = await Promise.all([tx.get(subRef), tx.get(empresaRef), tx.get(reciboRef)]);
    if (!subSnap.exists) fail("not-found", "SUSCRIPCION_NOT_FOUND");
    if (!empresaSnap.exists) fail("not-found", "EMPRESA_NOT_FOUND");
    if (reciboSnap.exists) fail("already-exists", "REFERENCIA_PAGO_YA_CONFIRMADA");
    const s = subSnap.data() as Suscripcion;
    const empresa = empresaSnap.data() as { estado: string; revision: number };
    if (!s.snapshotContrato || s.snapshotContrato.periodicidad !== "ANUAL") fail("failed-precondition", "SUSCRIPCION_NO_ANUAL");
    const snapshot = s.snapshotContrato!;
    if (!Number.isInteger(s.revision) || s.revision !== entrada.expectedRevision) fail("failed-precondition", "SUSCRIPCION_REVISION_CONFLICT");
    if (!Number.isInteger(empresa.revision)) fail("failed-precondition", "EMPRESA_REVISION_INVALIDA");
    const hoy = fechaComercialUtc();
    const inicio = s.estado === "active" && s.periodoFin && s.periodoFin > hoy ? s.periodoFin : hoy;
    const fin = sumarAnio(inicio);
    const revision = s.revision + 1;
    const empresaRevision = empresa.revision + 1;
    tx.create(reciboRef, {
      reciboId,
      empresaId: entrada.empresaId,
      suscripcionRevision: revision,
      referenciaPago,
      confirmadoPor: ctx.actorId,
      confirmadoEn: FieldValue.serverTimestamp(),
      importe: snapshot.precio.importe,
      moneda: snapshot.precio.moneda,
      periodoInicio: inicio,
      periodoFin: fin,
      snapshotContrato: snapshot,
      commandId: entrada.commandId,
    });
    tx.update(subRef, {
      estado: "active",
      periodoInicio: inicio,
      periodoFin: fin,
      graceFin: FieldValue.delete(),
      cancelacionProgramadaPara: FieldValue.delete(),
      ultimoPagoAnualId: reciboId,
      revision,
      actualizadaEn: FieldValue.serverTimestamp(),
    });
    const empresaUpdate = empresa.estado === "trial" || empresa.estado === "suspendida" || empresa.estado === "cancelada"
      ? { estado: "activa", revision: empresaRevision, actualizadaEn: FieldValue.serverTimestamp() }
      : { revision: empresaRevision, actualizadaEn: FieldValue.serverTimestamp() };
    tx.update(empresaRef, empresaUpdate);
    const r = { empresaId: entrada.empresaId, revision, empresaRevision, reciboId, periodoInicio: inicio, periodoFin: fin, importe: snapshot.precio.importe, moneda: snapshot.precio.moneda };
    registrar(tx, db, entrada, entrada.empresaId, f, r, "SuscripcionPagoAnualConfirmado", "SUSCRIPCION", s.revision, revision, ctx);
    return { ...r, idempotente: false };
  });
}

function envelopeSistema(prefijo: string, empresaId: string, hoy: string): Envelope {
  const key = `${prefijo}:${empresaId}:${hoy}`;
  return {
    commandId: id("syscmd", key),
    idempotencyKey: id("sysidem", key),
    correlationId: id("syscorr", key),
    causationId: id("syscause", key),
    expectedRevision: 1,
    motivo: prefijo,
  };
}

export async function suspenderTrialVencido(db: Firestore, empresaId: string, hoy = fechaComercialUtc(), ctx: ContextoComercial = { actorId: "system:mt-u9", origen: "SYSTEM" }) {
  if (!esIdComercial(empresaId) || !esFechaComercial(hoy)) fail("invalid-argument", "VENCIMIENTO_INVALIDO");
  const entrada = { ...envelopeSistema("TRIAL_VENCIDO", empresaId, hoy), empresaId };
  const fingerprint = hash({ empresaId, hoy, tipo: "TRIAL_VENCIDO" });
  return db.runTransaction(async tx => {
    const p = await previo(tx, db, entrada, empresaId, fingerprint);
    if (p) return { ...p, idempotente: true };
    const [subSnap, empresaSnap] = await Promise.all([tx.get(db.collection("suscripciones").doc(empresaId)), tx.get(db.collection("empresas").doc(empresaId))]);
    if (!subSnap.exists) return { empresaId, omitido: true, idempotente: false };
    const s = subSnap.data() as Suscripcion;
    if (s.estado !== "trialing" || !s.trialFin || s.trialFin > hoy) return { empresaId, omitido: true, idempotente: false };
    const revision = s.revision + 1;
    tx.update(db.collection("suscripciones").doc(empresaId), { estado: "suspended", graceFin: FieldValue.delete(), revision, actualizadaEn: FieldValue.serverTimestamp() });
    let empresaRevision: number | null = null;
    if (empresaSnap.exists) {
      const empresa = empresaSnap.data() as { estado: string; revision?: number };
      if (["trial", "activa"].includes(empresa.estado) && Number.isInteger(empresa.revision)) {
        empresaRevision = empresa.revision! + 1;
        tx.update(db.collection("empresas").doc(empresaId), { estado: "suspendida", revision: empresaRevision, actualizadaEn: FieldValue.serverTimestamp() });
      }
    }
    const resultado = { empresaId, revision, empresaRevision };
    registrar(tx, db, entrada, empresaId, fingerprint, resultado, "SuscripcionTrialVencido", "SUSCRIPCION", s.revision, revision, ctx);
    return { ...resultado, idempotente: false };
  });
}

export async function suspenderPeriodoAnualVencido(db: Firestore, empresaId: string, hoy = fechaComercialUtc(), ctx: ContextoComercial = { actorId: "system:mt-u9", origen: "SYSTEM" }) {
  if (!esIdComercial(empresaId) || !esFechaComercial(hoy)) fail("invalid-argument", "VENCIMIENTO_INVALIDO");
  const entrada = { ...envelopeSistema("PERIODO_ANUAL_VENCIDO", empresaId, hoy), empresaId };
  const fingerprint = hash({ empresaId, hoy, tipo: "PERIODO_ANUAL_VENCIDO" });
  return db.runTransaction(async tx => {
    const p = await previo(tx, db, entrada, empresaId, fingerprint);
    if (p) return { ...p, idempotente: true };
    const [subSnap, empresaSnap] = await Promise.all([tx.get(db.collection("suscripciones").doc(empresaId)), tx.get(db.collection("empresas").doc(empresaId))]);
    if (!subSnap.exists) return { empresaId, omitido: true, idempotente: false };
    const s = subSnap.data() as Suscripcion;
    if (s.estado !== "active" || s.snapshotContrato?.periodicidad !== "ANUAL" || !s.periodoFin || s.periodoFin > hoy) return { empresaId, omitido: true, idempotente: false };
    const nuevoEstado = s.cancelacionProgramadaPara ? "canceled" : "suspended";
    const revision = s.revision + 1;
    tx.update(db.collection("suscripciones").doc(empresaId), { estado: nuevoEstado, revision, actualizadaEn: FieldValue.serverTimestamp(), ...(nuevoEstado === "canceled" ? { canceladaEn: hoy } : {}) });
    let empresaRevision: number | null = null;
    if (empresaSnap.exists) {
      const empresa = empresaSnap.data() as { estado: string; revision?: number };
      if (empresa.estado === "activa" && Number.isInteger(empresa.revision)) {
        empresaRevision = empresa.revision! + 1;
        tx.update(db.collection("empresas").doc(empresaId), { estado: "suspendida", revision: empresaRevision, actualizadaEn: FieldValue.serverTimestamp() });
      }
    }
    const resultado = { empresaId, revision, empresaRevision, estado: nuevoEstado };
    registrar(tx, db, entrada, empresaId, fingerprint, resultado, "SuscripcionPeriodoAnualVencido", "SUSCRIPCION", s.revision, revision, ctx);
    return { ...resultado, idempotente: false };
  });
}

import { getAuth } from "firebase-admin/auth";

async function revocarSesionesEmpresa(db: Firestore, empresaId: string) {
  try {
    const snap = await db.collection("membresias").where("empresaId", "==", empresaId).get();
    const uids = snap.docs.map(doc => doc.data()?.uid).filter((uid): uid is string => typeof uid === "string");
    const auth = getAuth();
    await Promise.all(uids.map(uid => auth.revokeRefreshTokens(uid).catch(() => {})));
  } catch {
    // Si la revocación de tokens falla o corre en un entorno mock, Firestore Rules y Functions siguen siendo la autoridad.
  }
}

export async function transicionarEmpresa(db: Firestore, entrada: Envelope & { empresaId: string; destino: EmpresaLifecycle["estado"] }, ctx: ContextoComercial) {
  validar(entrada); if (!esIdComercial(entrada.empresaId) || !Object.keys(transicionesEmpresa).includes(entrada.destino)) fail("invalid-argument", "LIFECYCLE_INVALIDO"); const f = hash(entrada);
  const res = await db.runTransaction(async tx => {
    const p = await previo(tx, db, entrada, entrada.empresaId, f); if (p) return { ...p, idempotente: true };
    const ref = db.collection("empresas").doc(entrada.empresaId), [empresaSnap, subSnap] = await Promise.all([tx.get(ref), tx.get(db.collection("suscripciones").doc(entrada.empresaId))]);
    if (!empresaSnap.exists) fail("not-found", "EMPRESA_NOT_FOUND");
    const empresa = empresaSnap.data() as EmpresaLifecycle;
    if (!Number.isInteger(empresa.revision) || empresa.revision !== entrada.expectedRevision || !transicionesEmpresa[empresa.estado].includes(entrada.destino)) fail("failed-precondition", "EMPRESA_TRANSITION_INVALID");
    if ((entrada.destino === "activa") && (!subSnap.exists || !readinessComercial(subSnap.data() as Suscripcion))) fail("failed-precondition", "READINESS_COMERCIAL_INCOMPLETA");
    const revision = empresa.revision + 1;
    tx.update(ref, { estado: entrada.destino, revision, ultimaTransicion: { ocurridaEn: FieldValue.serverTimestamp(), actorId: ctx.actorId, origen: ctx.origen, motivo: entrada.motivo }, actualizadaEn: FieldValue.serverTimestamp() });
    const r = { empresaId: entrada.empresaId, estado: entrada.destino, revision };
    registrar(tx, db, entrada, entrada.empresaId, f, r, `Empresa${toPascal(entrada.destino)}`, "EMPRESA", empresa.revision, revision, ctx);
    return { ...r, idempotente: false };
  });

  if (!res.idempotente && ["suspendida", "cancelada", "archivada", "eliminada"].includes(entrada.destino)) {
    await revocarSesionesEmpresa(db, entrada.empresaId);
  }
  return res;
}

/**
 * ADR-SAAS-013 §5.3 — edición administrativa desde el Backoffice, acotada
 * deliberadamente a la denominación comercial. `paisFiscal` queda excluido
 * (implicaciones sobre numeraciones fiscales ya emitidas) y `estado`
 * pertenece a lifecycle (`transicionarEmpresa`, arriba). Ampliar esta
 * superficie exige un ADR, no un PR (ADR-SAAS-013 §5.4).
 *
 * Escribe `empresas` Y propaga a `configuraciones/{empresaId}.identidadFiscal.nombreComercial`
 * en la MISMA transacción, componiendo el núcleo de
 * `ejecutarComandoConfiguracion` (origen "PLATFORM") en vez de escribir el
 * documento de configuración directamente: la precondición que bloquea
 * cambios de identidad fiscal tras la primera emisión DIAN
 * (`IDENTIDAD_FISCAL_BLOQUEADA_POR_EMISION`) sigue aplicando sin
 * duplicarla aquí. Si esa precondición rechaza el cambio, toda la
 * transacción aborta — `empresas` y `configuraciones` nunca divergen.
 */
export async function actualizarDatosAdministrativosEmpresa(db: Firestore, entrada: Envelope & { empresaId: string; nombreComercial: string }, ctx: ContextoComercial) {
  validar(entrada);
  if (!esIdComercial(entrada.empresaId) || typeof entrada.nombreComercial !== "string" || !entrada.nombreComercial.trim()) fail("invalid-argument", "DATOS_ADMINISTRATIVOS_INVALIDOS");
  const nombreComercial = entrada.nombreComercial.trim();
  const f = hash(entrada);
  return db.runTransaction(async tx => {
    const p = await previo(tx, db, entrada, entrada.empresaId, f); if (p) return { ...p, idempotente: true };
    const ref = db.collection("empresas").doc(entrada.empresaId);
    const snap = await tx.get(ref);
    if (!snap.exists) fail("not-found", "EMPRESA_NOT_FOUND");
    const empresa = snap.data() as { revision: number; paisFiscal: string };
    if (!Number.isInteger(empresa.revision) || empresa.revision !== entrada.expectedRevision) fail("failed-precondition", "EMPRESA_REVISION_CONFLICT");

    // Lecturas del comando de configuración compuesto — deben resolverse
    // antes de cualquier escritura (regla de transacciones de Firestore).
    const entradaConfig: EntradaComandoConfiguracion = {
      comando: "ActualizarConfiguracionEmpresa",
      expectedRevision: 1, // placeholder — se fija con la revisión real leída dos líneas abajo, en la misma transacción
      idempotencyKey: `${entrada.idempotencyKey}:cfg`,
      commandId: `${entrada.commandId}:cfg`,
      correlationId: entrada.correlationId,
      motivo: entrada.motivo,
      operaciones: [{ tipo: "SET", ruta: "identidadFiscal.nombreComercial", valor: nombreComercial }],
    };
    const contextoConfig: ContextoComandoConfiguracion = { empresaId: entrada.empresaId, actorId: ctx.actorId, origen: "PLATFORM", paisFiscal: empresa.paisFiscal };
    const refsConfig = referenciasComandoConfiguracion(db, entradaConfig, contextoConfig);
    const lecturasConfig = await leerComandoConfiguracionEnTransaccion(tx, entradaConfig, refsConfig);
    if (!lecturasConfig.configSnap.exists) fail("failed-precondition", "CONFIGURACION_INEXISTENTE");
    entradaConfig.expectedRevision = (lecturasConfig.configSnap.data() as { revision: number }).revision;

    ejecutarComandoConfiguracionConEstadoPreleidoEnTransaccion(db, tx, entradaConfig, contextoConfig, refsConfig, lecturasConfig);

    const revision = empresa.revision + 1;
    tx.update(ref, { nombre: nombreComercial, nombreComercial, revision, actualizadaEn: FieldValue.serverTimestamp() });
    const r = { empresaId: entrada.empresaId, nombreComercial, revision };
    registrar(tx, db, entrada, entrada.empresaId, f, r, "EmpresaDatosAdministrativosActualizados", "EMPRESA", empresa.revision, revision, ctx);
    return { ...r, idempotente: false };
  });
}

