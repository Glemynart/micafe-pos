import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { esIdComercial, fechaComercialUtc, rangoComercialValido, type PlanVersion, type RelacionContractual, type SnapshotContrato, type Suscripcion } from "../../../lib/suscripciones/contrato";
import type { ContextoComercial } from "./service";

type Envelope = {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string;
  expectedRevision: number;
  motivo: string;
};

type EntradaRelacion = Envelope & {
  empresaId: string;
  planId: string;
  planVersion: number;
  relacionAnteriorId: string;
};

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const id = (prefix: string, value: string) => `${prefix}_${hash(value)}`;
const fail = (code: "invalid-argument" | "already-exists" | "failed-precondition" | "not-found", message: string): never => {
  throw new HttpsError(code, message);
};

function validar(entrada: Envelope) {
  if (
    !entrada
    || !esIdComercial(entrada.commandId)
    || !esIdComercial(entrada.idempotencyKey)
    || !esIdComercial(entrada.correlationId)
    || !esIdComercial(entrada.causationId)
    || !Number.isInteger(entrada.expectedRevision)
    || entrada.expectedRevision < 1
    || !entrada.motivo.trim()
  ) fail("invalid-argument", "ENVELOPE_COMERCIAL_INVALIDO");
}

function comandoRef(db: Firestore, entrada: Envelope) {
  return db.collection("comandos_comerciales").doc(id("com", entrada.idempotencyKey));
}

function commandIdRef(db: Firestore, entrada: Envelope) {
  return db.collection("configuracion_command_ids").doc(`cfgcmdid_${hash(entrada.commandId)}`);
}

async function previo(tx: any, db: Firestore, entrada: Envelope, empresaId: string, fingerprint: string) {
  const [comando, commandId] = await Promise.all([
    tx.get(comandoRef(db, entrada)),
    tx.get(commandIdRef(db, entrada)),
  ]);
  for (const snap of [commandId, comando]) {
    if (!snap.exists) continue;
    const data = snap.data();
    if (
      data.commandId !== entrada.commandId
      || data.idempotencyKey !== entrada.idempotencyKey
      || data.fingerprint !== fingerprint
      || data.empresaId !== empresaId
    ) fail("already-exists", snap === commandId ? "COMMAND_ID_CONFLICT" : "IDEMPOTENCY_CONFLICT");
    return { ...data.resultado, obligacionId: data.obligacionId ?? undefined };
  }
}

function registrar(
  tx: any,
  db: Firestore,
  entrada: Envelope,
  empresaId: string,
  fingerprint: string,
  resultado: unknown,
  ctx: ContextoComercial,
  revisionAnterior: number,
) {
  const base = {
    empresaId,
    commandId: entrada.commandId,
    idempotencyKey: entrada.idempotencyKey,
    fingerprint,
    resultado,
    obligacionId: ctx.obligacionId ?? null,
    creadoEn: FieldValue.serverTimestamp(),
  };
  tx.create(comandoRef(db, entrada), base);
  tx.create(commandIdRef(db, entrada), base);
  tx.create(db.collection("auditoria_logs").doc(id("comaudit", entrada.commandId)), {
    ...base,
    comando: "SuscripcionRelacionContractualCreada",
    agregado: "SUSCRIPCION",
    revisionAnterior,
    revisionNueva: 1,
    actorId: ctx.actorId,
    origen: ctx.origen,
    motivo: entrada.motivo,
  });
  tx.create(db.collection("eventos_dominio").doc(id("comevent", entrada.commandId)), {
    eventId: id("comevent", entrada.commandId),
    tipo: "SuscripcionRelacionContractualCreada",
    version: 1,
    agregado: "SUSCRIPCION",
    empresaId,
    revisionAnterior,
    revisionNueva: 1,
    actorId: ctx.actorId,
    origen: ctx.origen,
    commandId: entrada.commandId,
    correlationId: entrada.correlationId,
    causationId: entrada.causationId,
    creadoEn: FieldValue.serverTimestamp(),
  });
  ctx.registrarResultadoEnTransaccion?.(tx, resultado);
}

function sumarDias(fecha: string, dias: number) {
  const inicio = Date.parse(`${fecha}T00:00:00.000Z`);
  const fin = new Date(inicio + dias * 86_400_000);
  if (!Number.isFinite(fin.getTime())) fail("invalid-argument", "TRIAL_INVALIDO");
  return fechaComercialUtc(fin);
}

function snapshotAnual(plan: PlanVersion, inicio: string, fin: string): SnapshotContrato {
  const importe = plan.precio?.importe;
  const moneda = plan.precio?.moneda;
  if (plan.periodicidad !== "ANUAL") fail("failed-precondition", "PLAN_ANUAL_REQUERIDO");
  if (typeof importe !== "number" || !Number.isSafeInteger(importe) || importe <= 0) {
    fail("failed-precondition", "PLAN_ANUAL_REQUERIDO");
  }
  if (moneda !== "COP") {
    fail("failed-precondition", "PLAN_ANUAL_REQUERIDO");
  }
  if (!rangoComercialValido(inicio, fin) || (Date.parse(`${fin}T00:00:00.000Z`) - Date.parse(`${inicio}T00:00:00.000Z`)) / 86_400_000 !== 30) {
    fail("invalid-argument", "TRIAL_ANUAL_DEBE_SER_30_DIAS");
  }
  return {
    schemaVersion: 1,
    planId: plan.planId,
    planVersion: plan.planVersion,
    codigoPlan: plan.codigo,
    periodicidad: "ANUAL",
    precio: { importe: importe!, moneda: moneda! },
    capacidades: [...plan.capacidades],
    limites: JSON.parse(JSON.stringify(plan.limites ?? {})),
    sedeConceptual: { cantidad: 1 },
    fiscalidad: null,
    vigencia: { inicio, fin },
  };
}

/**
 * Materializa una relación anual nueva para una Empresa con una suscripción
 * histórica cerrada. La raíz legacy permanece sin mutaciones contractuales.
 */
export async function crearRelacionContractualTrial(
  db: Firestore,
  entrada: EntradaRelacion,
  ctx: ContextoComercial,
) {
  validar(entrada);
  if (
    !esIdComercial(entrada.empresaId)
    || !esIdComercial(entrada.planId)
    || !Number.isInteger(entrada.planVersion)
    || entrada.planVersion < 1
    || !esIdComercial(entrada.relacionAnteriorId)
  ) fail("invalid-argument", "RELACION_CONTRACTUAL_INVALIDA");

  const fingerprint = hash({
    commandId: entrada.commandId,
    idempotencyKey: entrada.idempotencyKey,
    correlationId: entrada.correlationId,
    causationId: entrada.causationId,
    expectedRevision: entrada.expectedRevision,
    motivo: entrada.motivo,
    empresaId: entrada.empresaId,
    planId: entrada.planId,
    planVersion: entrada.planVersion,
    relacionAnteriorId: entrada.relacionAnteriorId,
  });
  const trialInicio = fechaComercialUtc();
  const trialFin = sumarDias(trialInicio, 30);
  const relacionId = id("rel", `${entrada.empresaId}:${entrada.idempotencyKey}`);

  return db.runTransaction(async (tx) => {
    const existente = await previo(tx, db, entrada, entrada.empresaId, fingerprint);
    if (existente) return { ...existente, idempotente: true };

    const empresaRef = db.collection("empresas").doc(entrada.empresaId);
    const suscripcionRef = db.collection("suscripciones").doc(entrada.empresaId);
    const relacionesRef = suscripcionRef.collection("relaciones");
    const relacionRef = relacionesRef.doc(relacionId);
    const controlRef = relacionesRef.doc("_vigente");
    const planRef = db.collection("planes").doc(entrada.planId)
      .collection("versiones").doc(String(entrada.planVersion));
    const [empresaSnap, suscripcionSnap, planSnap, relacionSnap, controlSnap] = await Promise.all([
      tx.get(empresaRef),
      tx.get(suscripcionRef),
      tx.get(planRef),
      tx.get(relacionRef),
      tx.get(controlRef),
    ]);
    if (!empresaSnap.exists) fail("not-found", "EMPRESA_NOT_FOUND");
    if (!suscripcionSnap.exists) fail("not-found", "SUSCRIPCION_NOT_FOUND");
    if (!planSnap.exists || (planSnap.data() as PlanVersion).estado !== "PUBLICADA") {
      fail("failed-precondition", "PLAN_NOT_ADMISSIBLE");
    }
    if (relacionSnap.exists) fail("already-exists", "RELACION_CONTRACTUAL_EXISTS");

    const empresa = empresaSnap.data() as { estado?: string };
    const suscripcion = suscripcionSnap.data() as Suscripcion;
    const plan = planSnap.data() as PlanVersion;
    if (!["activa", "suspendida"].includes(empresa.estado ?? "")) fail("failed-precondition", "EMPRESA_NOT_OPERATIONAL");
    if (suscripcion.revision !== entrada.expectedRevision) fail("failed-precondition", "SUSCRIPCION_REVISION_CONFLICT");
    if (suscripcion.estado === "trialing") fail("failed-precondition", "RELACION_ANTERIOR_TRIAL_VIGENTE");
    if (!["suspended", "canceled"].includes(suscripcion.estado)) fail("failed-precondition", "RELACION_ANTERIOR_NO_CERRADA");
    const snapshotContrato = snapshotAnual(plan, trialInicio, trialFin);
    const vigenteId = controlSnap.exists ? controlSnap.data()?.relacionVigenteId : null;
    const vigenteSnap = typeof vigenteId === "string"
      ? await tx.get(relacionesRef.doc(vigenteId))
      : null;
    if (vigenteSnap?.exists) {
      const vigente = vigenteSnap.data() as RelacionContractual;
      if (vigente.estado === "trialing" || vigente.estado === "active") {
        fail("failed-precondition", "RELACION_CONTRACTUAL_ACTIVA");
      }
    }

    const relacion: RelacionContractual = {
      schemaVersion: 1,
      relacionId,
      empresaId: entrada.empresaId,
      estado: "trialing",
      planId: entrada.planId,
      planVersion: entrada.planVersion,
      snapshotContrato,
      origen: "transicion_contractual",
      relacionAnteriorId: entrada.relacionAnteriorId,
      revision: 1,
      creadaEn: FieldValue.serverTimestamp(),
      actualizadaEn: FieldValue.serverTimestamp(),
    };
    tx.create(relacionRef, relacion);
    const controlRevision = controlSnap.exists
      ? controlSnap.data()?.revision as number | undefined
      : undefined;
    const control = {
      schemaVersion: 1,
      relacionVigenteId: relacionId,
      estado: "trialing",
      revision: typeof controlRevision === "number" && Number.isInteger(controlRevision) ? controlRevision + 1 : 1,
      actualizadaEn: FieldValue.serverTimestamp(),
    };
    if (controlSnap.exists) tx.update(controlRef, control);
    else tx.create(controlRef, control);
    const resultado = {
      empresaId: entrada.empresaId,
      relacionId,
      revision: 1,
      trialInicio,
      trialFin,
      planId: entrada.planId,
      planVersion: entrada.planVersion,
    };
    registrar(tx, db, entrada, entrada.empresaId, fingerprint, resultado, ctx, suscripcion.revision);
    return { ...resultado, idempotente: false };
  });
}
