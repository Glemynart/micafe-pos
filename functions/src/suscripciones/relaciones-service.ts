import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { esFechaComercial, esIdComercial, fechaComercialUtc, rangoComercialValido, type PlanVersion, type RelacionContractual, type SnapshotContrato, type Suscripcion } from "../../../lib/suscripciones/contrato";
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
  tipo = "SuscripcionRelacionContractualCreada",
) {
  const revisionNueva = Number.isInteger((resultado as { revision?: unknown })?.revision)
    ? (resultado as { revision: number }).revision
    : 1;
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
    comando: tipo,
    agregado: "SUSCRIPCION",
    revisionAnterior,
    revisionNueva,
    actorId: ctx.actorId,
    origen: ctx.origen,
    motivo: entrada.motivo,
  });
  tx.create(db.collection("eventos_dominio").doc(id("comevent", entrada.commandId)), {
    eventId: id("comevent", entrada.commandId),
    tipo,
    version: 1,
    agregado: "SUSCRIPCION",
    empresaId,
    revisionAnterior,
    revisionNueva,
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
      trialInicio,
      trialFin,
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

type EntradaPagoRelacion = Envelope & {
  empresaId: string;
  relacionId: string;
  referenciaPago: string;
};

function sumarAnio(fecha: string) {
  const [year, month, day] = fecha.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
  return fechaComercialUtc(new Date(Date.UTC(year + 1, month - 1, Math.min(day, ultimoDia))));
}

function referenciaPagoRelacion(empresaId: string, relacionId: string, referenciaPago: string) {
  return id("relpago", `${empresaId}:${relacionId}:${referenciaPago}`);
}

function validarEntradaRelacion(entrada: Pick<EntradaPagoRelacion, "empresaId" | "relacionId">) {
  if (!esIdComercial(entrada.empresaId) || !esIdComercial(entrada.relacionId)) {
    fail("invalid-argument", "RELACION_CONTRACTUAL_INVALIDA");
  }
}

async function leerRelacionEnTransaccion(tx: any, db: Firestore, entrada: Pick<EntradaPagoRelacion, "empresaId" | "relacionId">) {
  const relacionesRef = db.collection("suscripciones").doc(entrada.empresaId).collection("relaciones");
  const [relacionSnap, controlSnap] = await Promise.all([
    tx.get(relacionesRef.doc(entrada.relacionId)),
    tx.get(relacionesRef.doc("_vigente")),
  ]);
  if (!relacionSnap.exists) fail("not-found", "RELACION_CONTRACTUAL_NOT_FOUND");
  const relacion = relacionSnap.data() as RelacionContractual;
  if (!controlSnap.exists || controlSnap.data()?.relacionVigenteId !== entrada.relacionId) {
    fail("failed-precondition", "RELACION_CONTRACTUAL_NO_VIGENTE");
  }
  return { relacionesRef, relacionSnap, controlSnap, relacion };
}

export async function confirmarPagoAnualRelacionContractual(
  db: Firestore,
  entrada: EntradaPagoRelacion,
  ctx: ContextoComercial,
) {
  validar(entrada);
  validarEntradaRelacion(entrada);
  if (typeof entrada.referenciaPago !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(entrada.referenciaPago.trim())) {
    fail("invalid-argument", "REFERENCIA_PAGO_INVALIDA");
  }
  const referenciaPago = entrada.referenciaPago.trim();
  const fingerprint = hash(entrada);
  return db.runTransaction(async (tx) => {
    const existente = await previo(tx, db, entrada, entrada.empresaId, fingerprint);
    if (existente) return { ...existente, idempotente: true };
    const empresaRef = db.collection("empresas").doc(entrada.empresaId);
    const reciboRef = db.collection("pagos_saas").doc(referenciaPagoRelacion(entrada.empresaId, entrada.relacionId, referenciaPago));
    const { relacionesRef, controlSnap, relacion } = await leerRelacionEnTransaccion(tx, db, entrada);
    const [empresaSnap, reciboSnap] = await Promise.all([tx.get(empresaRef), tx.get(reciboRef)]);
    if (!empresaSnap.exists) fail("not-found", "EMPRESA_NOT_FOUND");
    if (reciboSnap.exists) fail("already-exists", "REFERENCIA_PAGO_YA_CONFIRMADA");
    if (!["trialing", "suspended", "active"].includes(relacion.estado)) fail("failed-precondition", "RELACION_CONTRACTUAL_NO_PAGABLE");
    if (relacion.revision !== entrada.expectedRevision) fail("failed-precondition", "RELACION_CONTRACTUAL_REVISION_CONFLICT");
    const snapshot = relacion.snapshotContrato;
    if (!snapshot || snapshot.periodicidad !== "ANUAL" || snapshot.precio.moneda !== "COP") fail("failed-precondition", "RELACION_CONTRACTUAL_NO_ANUAL");
    const empresa = empresaSnap.data() as { estado: string; revision: number };
    if (!Number.isInteger(empresa.revision)) fail("failed-precondition", "EMPRESA_REVISION_INVALIDA");
    const hoy = fechaComercialUtc();
    const inicio = relacion.estado === "active" && relacion.periodoFin && relacion.periodoFin > hoy ? relacion.periodoFin : hoy;
    const fin = sumarAnio(inicio);
    const revision = relacion.revision + 1;
    const empresaRevision = empresa.revision + 1;
    const reciboId = reciboRef.path.split("/").pop()!;
    tx.create(reciboRef, {
      reciboId,
      empresaId: entrada.empresaId,
      relacionId: entrada.relacionId,
      relacionRevision: revision,
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
    tx.update(relacionesRef.doc(entrada.relacionId), {
      estado: "active",
      periodoInicio: inicio,
      periodoFin: fin,
      cancelacionProgramadaPara: FieldValue.delete(),
      canceladaEn: FieldValue.delete(),
      ultimoPagoAnualId: reciboId,
      revision,
      actualizadaEn: FieldValue.serverTimestamp(),
    });
    const controlRevision = controlSnap.data()?.revision;
    tx.update(relacionesRef.doc("_vigente"), {
      estado: "active",
      revision: Number.isInteger(controlRevision) ? controlRevision + 1 : 1,
      actualizadaEn: FieldValue.serverTimestamp(),
    });
    const empresaUpdate = empresa.estado === "trial" || empresa.estado === "suspendida" || empresa.estado === "cancelada"
      ? { estado: "activa", revision: empresaRevision, actualizadaEn: FieldValue.serverTimestamp() }
      : { revision: empresaRevision, actualizadaEn: FieldValue.serverTimestamp() };
    tx.update(empresaRef, empresaUpdate);
    const resultado = { empresaId: entrada.empresaId, relacionId: entrada.relacionId, revision, empresaRevision, reciboId, periodoInicio: inicio, periodoFin: fin, importe: snapshot.precio.importe, moneda: snapshot.precio.moneda };
    registrar(tx, db, entrada, entrada.empresaId, fingerprint, resultado, ctx, relacion.revision, "SuscripcionRelacionContractualPagoAnualConfirmado");
    return { ...resultado, idempotente: false };
  });
}

function envelopeSistemaRelacion(prefijo: string, empresaId: string, relacionId: string, hoy: string): Envelope {
  const key = `${prefijo}:${empresaId}:${relacionId}:${hoy}`;
  return {
    commandId: id("sysrelcmd", key),
    idempotencyKey: id("sysrelidem", key),
    correlationId: id("sysrelcorr", key),
    causationId: id("sysrelcause", key),
    expectedRevision: 1,
    motivo: prefijo,
  };
}

export async function suspenderRelacionContractualVencida(
  db: Firestore,
  empresaId: string,
  relacionId: string,
  hoy = fechaComercialUtc(),
  ctx: ContextoComercial = { actorId: "system:mt-u9", origen: "SYSTEM" },
) {
  validarEntradaRelacion({ empresaId, relacionId });
  if (!esFechaComercial(hoy)) fail("invalid-argument", "VENCIMIENTO_INVALIDO");
  const modo = "RELACION_CONTRACTUAL_VENCIDA";
  const entrada = { ...envelopeSistemaRelacion(modo, empresaId, relacionId, hoy), empresaId, relacionId };
  const fingerprint = hash({ empresaId, relacionId, hoy, tipo: modo });
  return db.runTransaction(async (tx) => {
    const existente = await previo(tx, db, entrada, empresaId, fingerprint);
    if (existente) return { ...existente, idempotente: true };
    const empresaRef = db.collection("empresas").doc(empresaId);
    const { relacionesRef, controlSnap, relacion } = await leerRelacionEnTransaccion(tx, db, entrada);
    const empresaSnap = await tx.get(empresaRef);
    const finTrial = relacion.trialFin ?? relacion.snapshotContrato?.vigencia.fin;
    const trialVencido = relacion.estado === "trialing" && typeof finTrial === "string" && finTrial <= hoy;
    const periodoVencido = relacion.estado === "active" && typeof relacion.periodoFin === "string" && relacion.periodoFin <= hoy;
    if (!trialVencido && !periodoVencido) return { empresaId, relacionId, omitido: true, idempotente: false };
    const nuevoEstado: RelacionContractual["estado"] = periodoVencido && relacion.cancelacionProgramadaPara ? "canceled" : "suspended";
    const revision = relacion.revision + 1;
    tx.update(relacionesRef.doc(relacionId), {
      estado: nuevoEstado,
      revision,
      ...(nuevoEstado === "canceled" ? { canceladaEn: hoy } : {}),
      actualizadaEn: FieldValue.serverTimestamp(),
    });
    const controlRevision = controlSnap.data()?.revision;
    tx.update(relacionesRef.doc("_vigente"), {
      estado: nuevoEstado,
      revision: Number.isInteger(controlRevision) ? controlRevision + 1 : 1,
      actualizadaEn: FieldValue.serverTimestamp(),
    });
    let empresaRevision: number | null = null;
    if (empresaSnap.exists) {
      const empresa = empresaSnap.data() as { estado: string; revision?: number };
      if (["trial", "activa"].includes(empresa.estado) && Number.isInteger(empresa.revision)) {
        empresaRevision = empresa.revision! + 1;
        tx.update(empresaRef, { estado: "suspendida", revision: empresaRevision, actualizadaEn: FieldValue.serverTimestamp() });
      }
    }
    const resultado = { empresaId, relacionId, revision, empresaRevision, estado: nuevoEstado };
    const tipo = trialVencido ? "SuscripcionRelacionContractualTrialVencido" : "SuscripcionRelacionContractualPeriodoAnualVencido";
    registrar(tx, db, entrada, empresaId, fingerprint, resultado, ctx, relacion.revision, tipo);
    return { ...resultado, idempotente: false };
  });
}
