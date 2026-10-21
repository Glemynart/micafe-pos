import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  esFechaComercial,
  esIdComercial,
  fechaComercialUtc,
  type OfertaComercialTenant,
  type PlanVersion,
} from "../../../lib/suscripciones/contrato";

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

export function validarPrecioAcordado(value: unknown): asserts value is { importe: number; moneda: string } {
  const precio = value as { importe?: unknown; moneda?: unknown } | null;
  if (!precio
    || !Number.isSafeInteger(precio.importe)
    || (precio.importe as number) <= 0
    || typeof precio.moneda !== "string"
    || !/^[A-Z]{3}$/.test(precio.moneda)) {
    rechazar("invalid-argument", "OFERTA_COMERCIAL_PRECIO_INVALIDO");
  }
}

export function validarOfertaComercialEntrada(entrada: {
  empresaId: unknown;
  ofertaId: unknown;
  planIdBase: unknown;
  planVersionBase: unknown;
  precioAcordado: unknown;
  iniciaEn: unknown;
  expiraEn: unknown;
  referenciaAprobacion: unknown;
}) {
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
    || entrada.referenciaAprobacion.length > 160) {
    rechazar("invalid-argument", "OFERTA_COMERCIAL_INVALIDA");
  }
  validarPrecioAcordado(entrada.precioAcordado);
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
    || oferta.schemaVersion !== 1
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

  validarOfertaComercialEntrada({
    empresaId: oferta.empresaIdObjetivo,
    ofertaId: oferta.ofertaId,
    planIdBase: oferta.planIdBase,
    planVersionBase: oferta.planVersionBase,
    precioAcordado: oferta.precioAcordado,
    iniciaEn: oferta.iniciaEn,
    expiraEn: oferta.expiraEn,
    referenciaAprobacion: oferta.referenciaAprobacion,
  });
}

export type OfertaConsumida = {
  ofertaId: string;
  precioAcordado: { importe: number; moneda: string };
};

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
  const hoy = fechaComercialUtc();
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

  tx.update(ofertaRef, {
    estado: "CONSUMIDA",
    revision: oferta.revision + 1,
    consumidaPor: { empresaId: entrada.empresaId, provisionamientoId: entrada.provisionamientoId },
    consumidaEn: FieldValue.serverTimestamp(),
    actualizadaEn: FieldValue.serverTimestamp(),
  });
  tx.update(controlRef, {
    ofertaActivaId: null,
    revision: control.revision + 1,
    actualizadaEn: FieldValue.serverTimestamp(),
  });
  return {
    ofertaId: oferta.ofertaId,
    precioAcordado: { ...oferta.precioAcordado },
  };
}

export function validarPlanBaseParaOferta(plan: PlanVersion, precioAcordado: { importe: number; moneda: string }) {
  if (plan.estado !== "PUBLICADA"
    || plan.periodicidad !== "ANUAL"
    || !plan.precio
    || plan.precio.moneda !== precioAcordado.moneda) {
    rechazar("failed-precondition", "OFERTA_COMERCIAL_PLAN_NO_ADMISIBLE");
  }
}
