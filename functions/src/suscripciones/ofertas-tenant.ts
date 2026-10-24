import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  calcularVigenciaTrialUtc,
  esFechaComercial,
  esIdComercial,
  fechaComercialUtc,
  type OfertaComercialTenant,
  type PlanVersion,
} from "../../../lib/suscripciones/contrato";
import { esOfertaTrial15Autorizada } from "../platform/approved-tenant-offers";

export const OFERTAS_COMERCIALES_TENANT_COLLECTION = "ofertas_comerciales_tenant";

export function ofertaComercialActivaRef(db: Firestore, empresaId: string) {
  return db.collection(OFERTAS_COMERCIALES_TENANT_COLLECTION).doc(empresaId);
}

export function ofertaComercialRef(db: Firestore, empresaId: string, ofertaId: string) {
  return ofertaComercialActivaRef(db, empresaId).collection("ofertas").doc(ofertaId);
}

function rechazar(codigo: "invalid-argument" | "failed-precondition", mensaje: string): never {
  throw new HttpsError(codigo, mensaje);
}

/** The persisted revision must remain a safe integer after every transition. */
export function incrementarRevisionOfertaComercial(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
    rechazar("failed-precondition", "OFERTA_COMERCIAL_TRANSITION_INVALIDA");
  }
  return revision + 1;
}

function validarPrecioAcordadoConError(
  value: unknown,
  codigoError: "invalid-argument" | "failed-precondition",
): asserts value is { importe: number; moneda: string } {
  const precio = value as { importe?: unknown; moneda?: unknown } | null;
  if (!precio
    || !Number.isSafeInteger(precio.importe)
    || (precio.importe as number) <= 0
    || typeof precio.moneda !== "string"
    || !/^[A-Z]{3}$/.test(precio.moneda)) {
    rechazar(codigoError, "OFERTA_COMERCIAL_PRECIO_INVALIDO");
  }
}

export function validarPrecioAcordado(value: unknown): asserts value is { importe: number; moneda: string } {
  validarPrecioAcordadoConError(value, "invalid-argument");
}

type EntradaOfertaComercial = {
  schemaVersion?: unknown;
  empresaId: unknown;
  ofertaId: unknown;
  planIdBase: unknown;
  planVersionBase: unknown;
  precioAcordado: unknown;
  iniciaEn: unknown;
  expiraEn: unknown;
  motivoCodigo?: unknown;
  referenciaAprobacion: unknown;
  trialDias?: unknown;
  referenciaAceptacionCliente?: unknown;
};

function validarOfertaComercialConError(
  entrada: EntradaOfertaComercial,
  codigoError: "invalid-argument" | "failed-precondition",
) {
  const schemaVersion = entrada.schemaVersion ?? 1;
  if (!esIdComercial(entrada.empresaId)
    || !esIdComercial(entrada.ofertaId)
    || !esIdComercial(entrada.planIdBase)
    || !Number.isInteger(entrada.planVersionBase)
    || (entrada.planVersionBase as number) < 1
    || !esFechaComercial(entrada.iniciaEn)
    || (entrada.expiraEn !== null && !esFechaComercial(entrada.expiraEn))
    || (typeof entrada.expiraEn === "string" && entrada.iniciaEn >= entrada.expiraEn)
    || typeof entrada.referenciaAprobacion !== "string"
    || entrada.referenciaAprobacion.length < 1
    || entrada.referenciaAprobacion.length > 160
    || (schemaVersion !== 1 && schemaVersion !== 2)) {
    rechazar(codigoError, "OFERTA_COMERCIAL_INVALIDA");
  }
  validarPrecioAcordadoConError(entrada.precioAcordado, codigoError);
  if (schemaVersion === 1) {
    if (entrada.trialDias !== undefined || entrada.referenciaAceptacionCliente !== undefined) {
      rechazar(codigoError, "OFERTA_COMERCIAL_INVALIDA");
    }
  } else if (!esOfertaTrial15Autorizada({
    schemaVersion,
    ofertaId: entrada.ofertaId as string,
    empresaIdObjetivo: entrada.empresaId as string,
    planIdBase: entrada.planIdBase as string,
    planVersionBase: entrada.planVersionBase as number,
    periodicidad: "ANUAL",
    precioAcordado: entrada.precioAcordado as { importe: number; moneda: string },
    motivoCodigo: entrada.motivoCodigo as string,
    referenciaAprobacion: entrada.referenciaAprobacion,
    trialDias: entrada.trialDias as 15,
    referenciaAceptacionCliente: entrada.referenciaAceptacionCliente as string,
  })) {
    rechazar(codigoError, "OFERTA_COMERCIAL_TRIAL_EXCEPTION_INVALIDA");
  }
}

export function validarOfertaComercialEntrada(entrada: EntradaOfertaComercial) {
  validarOfertaComercialConError(entrada, "invalid-argument");
}

export type ControlOfertaComercial = {
  ofertaActivaId: string | null;
  revision: number;
};

/** Only a missing control document means that the tenant has no offer control yet. */
export function validarControlOfertaComercial(value: unknown, empresaIdEsperada: string): ControlOfertaComercial {
  const control = value as { empresaId?: unknown; ofertaActivaId?: unknown; revision?: unknown } | null;
  if (!control
    || typeof control !== "object"
    || Array.isArray(control)
    || control.empresaId !== empresaIdEsperada
    || !Number.isSafeInteger(control.revision)
    || (control.revision as number) < 1
    || !(control.ofertaActivaId === null || esIdComercial(control.ofertaActivaId))) {
    rechazar("failed-precondition", "OFERTA_COMERCIAL_CONTROL_INVALIDO");
  }
  return {
    ofertaActivaId: control.ofertaActivaId as string | null,
    revision: control.revision as number,
  };
}

/** Validates the shared persisted offer contract used by read, approval and Bootstrap. */
export function validarOfertaComercialPersistida(value: unknown): asserts value is OfertaComercialTenant {
  const oferta = value as OfertaComercialTenant | null;
  if (!oferta
    || typeof oferta !== "object"
    || Array.isArray(oferta)
    || (oferta.schemaVersion !== 1 && oferta.schemaVersion !== 2)
    || !esIdComercial(oferta.ofertaId)
    || !esIdComercial(oferta.empresaIdObjetivo)
    || !esIdComercial(oferta.planIdBase)
    || !Number.isSafeInteger(oferta.planVersionBase)
    || (oferta.planVersionBase as number) < 1
    || oferta.periodicidad !== "ANUAL"
    || !["BORRADOR", "APROBADA", "CONSUMIDA", "REVOCADA", "EXPIRADA"].includes(oferta.estado)
    || !Number.isSafeInteger(oferta.revision)
    || (oferta.revision as number) < 1
    || typeof oferta.motivoCodigo !== "string"
    || !oferta.motivoCodigo.trim()) {
    rechazar("failed-precondition", "OFERTA_COMERCIAL_INVALIDA");
  }

  if (oferta.schemaVersion === 1) {
    if ("trialDias" in oferta || "referenciaAceptacionCliente" in oferta || "trialInicio" in oferta || "trialFin" in oferta) {
      rechazar("failed-precondition", "OFERTA_COMERCIAL_INVALIDA");
    }
  } else {
    if (!esOfertaTrial15Autorizada(oferta)) {
      rechazar("failed-precondition", "OFERTA_COMERCIAL_TRIAL_EXCEPTION_INVALIDA");
    }
    const tieneInicio = oferta.trialInicio !== undefined;
    const tieneFin = oferta.trialFin !== undefined;
    if (tieneInicio !== tieneFin
      || (tieneInicio && (!esFechaComercial(oferta.trialInicio) || !esFechaComercial(oferta.trialFin)
        || (Date.parse(`${oferta.trialFin}T00:00:00.000Z`) - Date.parse(`${oferta.trialInicio}T00:00:00.000Z`)) !== 15 * 86_400_000))
      || (oferta.estado === "CONSUMIDA" && !tieneInicio)
      || (oferta.estado !== "CONSUMIDA" && tieneInicio)) {
      rechazar("failed-precondition", "OFERTA_COMERCIAL_TRIAL_VIGENCIA_INVALIDA");
    }
  }

  validarOfertaComercialConError({
    empresaId: oferta.empresaIdObjetivo,
    ofertaId: oferta.ofertaId,
    planIdBase: oferta.planIdBase,
    planVersionBase: oferta.planVersionBase,
    precioAcordado: oferta.precioAcordado,
    iniciaEn: oferta.iniciaEn,
    expiraEn: oferta.expiraEn,
    motivoCodigo: oferta.motivoCodigo,
    referenciaAprobacion: oferta.referenciaAprobacion,
    schemaVersion: oferta.schemaVersion,
    ...(oferta.schemaVersion === 2 ? {
      trialDias: oferta.trialDias,
      referenciaAceptacionCliente: oferta.referenciaAceptacionCliente,
    } : {}),
  }, "failed-precondition");
}

type OfertaConsumidaBase = {
  ofertaId: string;
  empresaIdObjetivo: string;
  precioAcordado: { importe: number; moneda: string };
  trialInicio: string;
  trialFin: string;
};

export type OfertaConsumida = OfertaConsumidaBase & (
  | { schemaVersion: 1; trialDias: number }
  | { schemaVersion: 2; trialDias: 15; referenciaAceptacionCliente: string }
);

/**
 * Resuelve y consume una oferta ya APROBADA antes de escribir el núcleo del
 * Bootstrap. El caller debe haber realizado todas sus demás lecturas de la
 * transacción: esta unidad hace las escrituras de consumo al final.
 */
export async function resolverOfertaComercialBootstrapEnTransaccion(
  db: Firestore,
  tx: any,
  entrada: {
    empresaId: string;
    planId: string;
    planVersion: number;
    planBase: PlanVersion;
    provisionamientoId: string;
  },
  reloj: Date = new Date(),
): Promise<OfertaConsumida | null> {
  const controlRef = ofertaComercialActivaRef(db, entrada.empresaId);
  const controlSnap = await tx.get(controlRef);
  if (!controlSnap.exists) return null;
  const control = validarControlOfertaComercial(controlSnap.data(), entrada.empresaId);
  if (control.ofertaActivaId === null) return null;

  const ofertaRef = ofertaComercialRef(db, entrada.empresaId, control.ofertaActivaId);
  const ofertaSnap = await tx.get(ofertaRef);
  if (!ofertaSnap.exists) rechazar("failed-precondition", "OFERTA_COMERCIAL_INEXISTENTE");
  const ofertaData = ofertaSnap.data();
  validarOfertaComercialPersistida(ofertaData);
  const oferta = ofertaData;
  if (oferta.ofertaId !== control.ofertaActivaId) {
    rechazar("failed-precondition", "OFERTA_COMERCIAL_INVALIDA");
  }
  const hoy = fechaComercialUtc(reloj);
  if (oferta.empresaIdObjetivo !== entrada.empresaId
    || oferta.planIdBase !== entrada.planId
    || oferta.planVersionBase !== entrada.planVersion
    || oferta.periodicidad !== "ANUAL"
    || oferta.estado !== "APROBADA"
    || oferta.iniciaEn > hoy
    || (oferta.expiraEn !== null && hoy >= oferta.expiraEn)) {
    rechazar("failed-precondition", "OFERTA_COMERCIAL_NO_ADMISIBLE");
  }
  validarPlanBaseParaOferta(entrada.planBase, oferta.precioAcordado);

  const trialDias = oferta.schemaVersion === 2 ? oferta.trialDias : 30;
  const vigencia = calcularVigenciaTrialUtc(reloj, trialDias);

  const revisionOfertaNueva = incrementarRevisionOfertaComercial(oferta.revision);
  const revisionControlNueva = incrementarRevisionOfertaComercial(control.revision);
  tx.update(ofertaRef, {
    estado: "CONSUMIDA",
    revision: revisionOfertaNueva,
    consumidaPor: { empresaId: entrada.empresaId, provisionamientoId: entrada.provisionamientoId },
    ...(oferta.schemaVersion === 2 ? {
      trialInicio: vigencia.inicio,
      trialFin: vigencia.fin,
    } : {}),
    consumidaEn: FieldValue.serverTimestamp(),
    actualizadaEn: FieldValue.serverTimestamp(),
  });
  tx.update(controlRef, {
    ofertaActivaId: null,
    revision: revisionControlNueva,
    actualizadaEn: FieldValue.serverTimestamp(),
  });
  const consumidaBase = {
    ofertaId: oferta.ofertaId,
    empresaIdObjetivo: oferta.empresaIdObjetivo,
    precioAcordado: { ...oferta.precioAcordado },
    trialInicio: vigencia.inicio,
    trialFin: vigencia.fin,
  };
  return oferta.schemaVersion === 2
    ? { ...consumidaBase, schemaVersion: 2, trialDias: oferta.trialDias, referenciaAceptacionCliente: oferta.referenciaAceptacionCliente }
    : { ...consumidaBase, schemaVersion: 1, trialDias };
}

export function validarPlanBaseParaOferta(plan: PlanVersion, precioAcordado: { importe: number; moneda: string }) {
  if (plan.estado !== "PUBLICADA"
    || plan.periodicidad !== "ANUAL"
    || !plan.precio
    || plan.precio.moneda !== precioAcordado.moneda) {
    rechazar("failed-precondition", "OFERTA_COMERCIAL_PLAN_NO_ADMISIBLE");
  }
}
