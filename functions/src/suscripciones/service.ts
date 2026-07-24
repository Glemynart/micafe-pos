import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { esFechaComercial, esIdComercial, fechaComercialUtc, readinessComercial, transicionesEmpresa, transicionesSuscripcion, type EmpresaLifecycle, type PlanVersion, type Suscripcion } from "../../../lib/suscripciones/contrato";

type Envelope = { commandId: string; idempotencyKey: string; correlationId: string; causationId: string; expectedRevision: number; motivo: string };
export type ContextoComercial = { actorId: string; origen: "PLATFORM" | "SYSTEM" | "COMMERCIAL" };
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const id = (p: string, k: string) => `${p}_${hash(k)}`;
const fail = (code: "invalid-argument" | "already-exists" | "failed-precondition" | "not-found", msg: string): never => { throw new HttpsError(code, msg); };
function validar(e: Envelope) { if (!e || !esIdComercial(e.commandId) || !esIdComercial(e.idempotencyKey) || !esIdComercial(e.correlationId) || !esIdComercial(e.causationId) || !Number.isInteger(e.expectedRevision) || e.expectedRevision < 1 || !e.motivo.trim()) fail("invalid-argument", "ENVELOPE_COMERCIAL_INVALIDO"); }
function comandoRef(db: Firestore, e: Envelope) { return db.collection("comandos_comerciales").doc(id("com", e.idempotencyKey)); }
function commandIdRef(db: Firestore, e: Envelope) { return db.collection("configuracion_command_ids").doc(`cfgcmdid_${hash(e.commandId)}`); }
async function previo(tx: any, db: Firestore, e: Envelope, empresaId: string, fingerprint: string) { const [a, b] = await Promise.all([tx.get(comandoRef(db, e)), tx.get(commandIdRef(db, e))]); for (const s of [b, a]) if (s.exists) { const d = s.data(); if (d.commandId !== e.commandId || d.idempotencyKey !== e.idempotencyKey || d.fingerprint !== fingerprint || d.empresaId !== empresaId) fail("already-exists", s === b ? "COMMAND_ID_CONFLICT" : "IDEMPOTENCY_CONFLICT"); return d.resultado; } }
function registrar(tx: any, db: Firestore, e: Envelope, empresaId: string, fingerprint: string, resultado: unknown, tipo: string, agregado: string, anterior: number, nueva: number, ctx: ContextoComercial) {
  const base = { empresaId, commandId: e.commandId, idempotencyKey: e.idempotencyKey, fingerprint, resultado, creadoEn: FieldValue.serverTimestamp() };
  tx.create(comandoRef(db, e), base); tx.create(commandIdRef(db, e), base);
  tx.create(db.collection("auditoria_logs").doc(id("comaudit", e.commandId)), { ...base, comando: tipo, agregado, revisionAnterior: anterior, revisionNueva: nueva, actorId: ctx.actorId, origen: ctx.origen, motivo: e.motivo });
  tx.create(db.collection("eventos_dominio").doc(id("comevent", e.commandId)), { eventId: id("comevent", e.commandId), tipo, version: 1, agregado, empresaId, revisionAnterior: anterior, revisionNueva: nueva, actorId: ctx.actorId, origen: ctx.origen, commandId: e.commandId, correlationId: e.correlationId, causationId: e.causationId, creadoEn: FieldValue.serverTimestamp() });
}
const toPascal = (s: string) => s.split("_").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("");

export async function crearPlan(db: Firestore, entrada: Envelope & Omit<PlanVersion, "planVersion" | "estado" | "revision" | "schemaVersion">, ctx: ContextoComercial) {
  validar(entrada); if (!esIdComercial(entrada.planId) || !/^[A-Z][A-Z0-9_-]{1,39}$/.test(entrada.codigo) || !Array.isArray(entrada.capacidades) || entrada.capacidades.some(x => !esIdComercial(x))) fail("invalid-argument", "PLAN_INVALIDO");
  const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, "PLATFORM", f); if (p) return { ...p, idempotente: true }; const root = db.collection("planes").doc(entrada.planId), version = root.collection("versiones").doc("1"); if ((await tx.get(root)).exists) fail("already-exists", "PLAN_EXISTS"); const plan: PlanVersion = { ...entrada, planVersion: 1, estado: "BORRADOR", revision: 1, schemaVersion: 1 }; tx.create(root, { planId: plan.planId, codigo: plan.codigo, revision: 1, versionActual: 1, creadaEn: FieldValue.serverTimestamp() }); tx.create(version, { ...plan, creadaEn: FieldValue.serverTimestamp() }); const r = { planId: plan.planId, planVersion: 1 }; registrar(tx, db, entrada, "PLATFORM", f, r, "PlanCreado", "PLAN", 0, 1, ctx); return { ...r, idempotente: false }; });
}
export async function crearNuevaVersionPlan(db: Firestore, entrada: Envelope & Omit<PlanVersion, "planVersion" | "estado" | "revision" | "schemaVersion">, ctx: ContextoComercial) {
  validar(entrada); if (!esIdComercial(entrada.planId) || !/^[A-Z][A-Z0-9_-]{1,39}$/.test(entrada.codigo) || !Array.isArray(entrada.capacidades) || entrada.capacidades.some(x => !esIdComercial(x))) fail("invalid-argument", "PLAN_INVALIDO");
  const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, "PLATFORM", f); if (p) return { ...p, idempotente: true }; const root = db.collection("planes").doc(entrada.planId); const snap = await tx.get(root); if (!snap.exists) fail("not-found", "PLAN_NOT_FOUND"); const rData = snap.data() as { versionActual: number; revision: number }; const nuevaVersion = (rData.versionActual || 1) + 1; const versionRef = root.collection("versiones").doc(String(nuevaVersion)); if ((await tx.get(versionRef)).exists) fail("already-exists", "PLAN_VERSION_EXISTS"); const plan: PlanVersion = { ...entrada, planVersion: nuevaVersion, estado: "BORRADOR", revision: 1, schemaVersion: 1 }; tx.update(root, { versionActual: nuevaVersion, revision: rData.revision + 1, actualizadaEn: FieldValue.serverTimestamp() }); tx.create(versionRef, { ...plan, creadaEn: FieldValue.serverTimestamp() }); const r = { planId: plan.planId, planVersion: nuevaVersion }; registrar(tx, db, entrada, "PLATFORM", f, r, "VersionPlanCreada", "PLAN", rData.revision, rData.revision + 1, ctx); return { ...r, idempotente: false }; });
}
export async function publicarPlan(db: Firestore, entrada: Envelope & { planId: string; planVersion: number }, ctx: ContextoComercial) { validar(entrada); if (!esIdComercial(entrada.planId) || !Number.isInteger(entrada.planVersion) || entrada.planVersion < 1) fail("invalid-argument", "PLAN_INVALIDO"); const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, "PLATFORM", f); if (p) return { ...p, idempotente: true }; const ref = db.collection("planes").doc(entrada.planId).collection("versiones").doc(String(entrada.planVersion)); const snap = await tx.get(ref); if (!snap.exists) fail("not-found", "PLAN_NOT_FOUND"); const plan = snap.data() as PlanVersion; if (plan.revision !== entrada.expectedRevision || plan.estado !== "BORRADOR") fail("failed-precondition", "PLAN_TRANSITION_INVALID"); tx.update(ref, { estado: "PUBLICADA", revision: plan.revision + 1, publicadaEn: FieldValue.serverTimestamp() }); const r = { planId: plan.planId, planVersion: plan.planVersion, revision: plan.revision + 1 }; registrar(tx, db, entrada, "PLATFORM", f, r, "VersionPlanPublicada", "PLAN", plan.revision, plan.revision + 1, ctx); return { ...r, idempotente: false }; }); }
export async function crearSuscripcionActiva(db: Firestore, entrada: Envelope & { empresaId: string; planId: string; planVersion: number; periodoInicio: string; periodoFin: string }, ctx: ContextoComercial) { validar(entrada); if (!esIdComercial(entrada.empresaId) || !esIdComercial(entrada.planId) || !esFechaComercial(entrada.periodoInicio) || !esFechaComercial(entrada.periodoFin) || entrada.periodoInicio >= entrada.periodoFin) fail("invalid-argument", "SUSCRIPCION_INVALIDA"); const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, entrada.empresaId, f); if (p) return { ...p, idempotente: true }; const [empresa, plan, sub] = await Promise.all([tx.get(db.collection("empresas").doc(entrada.empresaId)), tx.get(db.collection("planes").doc(entrada.planId).collection("versiones").doc(String(entrada.planVersion))), tx.get(db.collection("suscripciones").doc(entrada.empresaId))]); if (!empresa.exists) fail("not-found", "EMPRESA_NOT_FOUND"); if (!plan.exists || (plan.data() as PlanVersion).estado !== "PUBLICADA") fail("failed-precondition", "PLAN_NOT_ADMISSIBLE"); if (sub.exists) fail("already-exists", "SUSCRIPCION_EXISTS"); const s: Suscripcion = { empresaId: entrada.empresaId, planId: entrada.planId, planVersion: entrada.planVersion, estado: "active", periodoInicio: entrada.periodoInicio, periodoFin: entrada.periodoFin, revision: 1, schemaVersion: 1 }; tx.create(db.collection("suscripciones").doc(entrada.empresaId), { ...s, creadaEn: FieldValue.serverTimestamp() }); const r = { empresaId: s.empresaId, revision: 1 }; registrar(tx, db, entrada, entrada.empresaId, f, r, "SuscripcionCreada", "SUSCRIPCION", 0, 1, ctx); return { ...r, idempotente: false }; }); }
/** Primitive B3 para que B5 componga el core atómico; no inicia Bootstrap ni es callable. */
export type LecturasTrialPreleidas = {
  comando: any;
  commandId: any;
  plan: any;
  suscripcion: any;
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
    return data.resultado;
  }
}

export async function crearSuscripcionTrialEnTransaccion(
  db: Firestore,
  tx: any,
  entrada: Envelope & { empresaId: string; planId: string; planVersion: number; trialInicio: string; trialFin: string },
  ctx: ContextoComercial,
  lecturasPreleidas?: LecturasTrialPreleidas,
) {
  validar(entrada);
  if (!esIdComercial(entrada.empresaId) || !esIdComercial(entrada.planId) || !esFechaComercial(entrada.trialInicio) || !esFechaComercial(entrada.trialFin) || entrada.trialInicio >= entrada.trialFin) fail("invalid-argument", "TRIAL_INVALIDO");
  const f = hash(entrada);
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
  if (lecturas.suscripcion.exists) fail("already-exists", "SUSCRIPCION_EXISTS");
  const s: Suscripcion = { empresaId: entrada.empresaId, planId: entrada.planId, planVersion: entrada.planVersion, estado: "trialing", trialInicio: entrada.trialInicio, trialFin: entrada.trialFin, revision: 1, schemaVersion: 1 };
  tx.create(db.collection("suscripciones").doc(entrada.empresaId), { ...s, creadaEn: FieldValue.serverTimestamp() });
  const r = { empresaId: s.empresaId, revision: 1 };
  registrar(tx, db, entrada, s.empresaId, f, r, "TrialIniciado", "SUSCRIPCION", 0, 1, ctx);
  return { ...r, idempotente: false };
}
export async function transicionarSuscripcion(db: Firestore, entrada: Envelope & { empresaId: string; destino: Suscripcion["estado"]; graceFin?: string; periodoInicio?: string; periodoFin?: string }, ctx: ContextoComercial) { validar(entrada); if (!esIdComercial(entrada.empresaId) || !["trialing","active","past_due","suspended","canceled"].includes(entrada.destino) || (entrada.graceFin !== undefined && !esFechaComercial(entrada.graceFin))) fail("invalid-argument", "SUSCRIPCION_INVALIDA"); const f = hash(entrada); return db.runTransaction(async tx => { const p = await previo(tx, db, entrada, entrada.empresaId, f); if (p) return { ...p, idempotente: true }; const ref = db.collection("suscripciones").doc(entrada.empresaId), snap = await tx.get(ref); if (!snap.exists) fail("not-found", "SUSCRIPCION_NOT_FOUND"); const s = snap.data() as Suscripcion; if (s.revision !== entrada.expectedRevision || !transicionesSuscripcion[s.estado].includes(entrada.destino)) fail("failed-precondition", "SUSCRIPCION_TRANSITION_INVALID"); if (entrada.destino === "past_due" && (!entrada.graceFin || (s.periodoFin && entrada.graceFin < s.periodoFin))) fail("invalid-argument", "GRACIA_INVALIDA"); if (entrada.destino === "active" && (!entrada.periodoInicio || !entrada.periodoFin || entrada.periodoInicio >= entrada.periodoFin || !esFechaComercial(entrada.periodoInicio) || !esFechaComercial(entrada.periodoFin))) fail("invalid-argument", "PERIODO_INVALIDO"); const revision = s.revision + 1; const upd: Record<string, any> = { estado: entrada.destino, revision, actualizadaEn: FieldValue.serverTimestamp() }; if (entrada.destino === "past_due") { upd.graceFin = entrada.graceFin; } else { upd.graceFin = FieldValue.delete(); } if (entrada.destino === "active") { upd.periodoInicio = entrada.periodoInicio; upd.periodoFin = entrada.periodoFin; upd.cancelacionProgramadaPara = FieldValue.delete(); } if (entrada.destino === "canceled") { upd.canceladaEn = fechaComercialUtc(); } tx.update(ref, upd); const r = { empresaId: s.empresaId, revision }; registrar(tx, db, entrada, s.empresaId, f, r, `Suscripcion${toPascal(entrada.destino)}`, "SUSCRIPCION", s.revision, revision, ctx); return { ...r, idempotente: false }; }); }
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

