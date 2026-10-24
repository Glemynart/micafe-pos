import { HttpsError } from "firebase-functions/v2/https";
import type { Firestore } from "firebase-admin/firestore";
import { type OfertaComercialTenant } from "../../../lib/suscripciones/contrato";
import { resolverTerminosOfertaTenantAprobada, type TerminosOfertaTenantAprobada } from "./approved-tenant-offers";
import {
  ofertaComercialActivaRef,
  ofertaComercialRef,
  validarControlOfertaComercial,
  validarOfertaComercialPersistida,
} from "../suscripciones/ofertas-tenant";

export type OfertaComercialTenantAdminView = Pick<
  OfertaComercialTenant,
  | "ofertaId"
  | "empresaIdObjetivo"
  | "planIdBase"
  | "planVersionBase"
  | "periodicidad"
  | "precioAcordado"
  | "estado"
  | "iniciaEn"
  | "expiraEn"
  | "motivoCodigo"
  | "referenciaAprobacion"
  | "revision"
  | "schemaVersion"
> & {
  trialDias?: number;
  referenciaAceptacionCliente?: string;
  trialInicio?: string;
  trialFin?: string;
};

export async function consultarOfertaComercialTenant(
  db: Firestore,
  codigoAprobacion: string,
): Promise<{
  autorizacion: TerminosOfertaTenantAprobada;
  oferta: OfertaComercialTenantAdminView | null;
  controlRevision: number;
  ofertaActivaId: string | null;
}> {
  const autorizacion = resolverTerminosOfertaTenantAprobada(codigoAprobacion);
  const empresaId = autorizacion.empresaIdObjetivo;
  const ofertaId = autorizacion.ofertaId;

  const controlRef = ofertaComercialActivaRef(db, empresaId);
  const ofertaRef = ofertaComercialRef(db, empresaId, ofertaId);
  const [controlSnap, ofertaSnap] = await Promise.all([controlRef.get(), ofertaRef.get()]);

  if (!controlSnap.exists && ofertaSnap.exists) {
    throw new HttpsError("failed-precondition", "OFERTA_COMERCIAL_CONTROL_INEXISTENTE");
  }

  let controlRevision = 1;
  let ofertaActivaId: string | null = null;
  if (controlSnap.exists) {
    const control = validarControlOfertaComercial(controlSnap.data(), empresaId);
    controlRevision = control.revision;
    ofertaActivaId = control.ofertaActivaId;
  }

  if (!ofertaSnap.exists) return { autorizacion, oferta: null, controlRevision, ofertaActivaId };

  const persistedData = ofertaSnap.data();
  validarOfertaComercialPersistida(persistedData);
  const data = persistedData;
  if (data.ofertaId !== ofertaId
    || data.empresaIdObjetivo !== empresaId
    || data.planIdBase !== autorizacion.planIdBase
    || data.planVersionBase !== autorizacion.planVersionBase
    || data.periodicidad !== "ANUAL"
    || data.precioAcordado?.importe !== autorizacion.precioAcordado.importe
    || data.precioAcordado?.moneda !== autorizacion.precioAcordado.moneda
    || data.referenciaAprobacion !== autorizacion.referenciaAprobacion
    || (data.schemaVersion !== autorizacion.schemaVersion
      && !(autorizacion.schemaVersion === 2 && data.schemaVersion === 1))
    || (data.schemaVersion === 2
      && (data.trialDias !== autorizacion.trialDias
        || data.referenciaAceptacionCliente !== autorizacion.referenciaAceptacionCliente))) {
    throw new HttpsError("failed-precondition", "OFERTA_COMERCIAL_INVALIDA");
  }

  return {
    autorizacion,
    oferta: {
      ofertaId: data.ofertaId,
      empresaIdObjetivo: data.empresaIdObjetivo,
      planIdBase: data.planIdBase,
      planVersionBase: data.planVersionBase,
      periodicidad: data.periodicidad,
      precioAcordado: { ...data.precioAcordado },
      estado: data.estado,
      iniciaEn: data.iniciaEn,
      expiraEn: data.expiraEn,
      motivoCodigo: data.motivoCodigo,
      referenciaAprobacion: data.referenciaAprobacion,
      revision: data.revision,
      schemaVersion: data.schemaVersion,
      ...(data.schemaVersion === 2 ? {
        trialDias: data.trialDias,
        referenciaAceptacionCliente: data.referenciaAceptacionCliente,
        ...(data.trialInicio ? { trialInicio: data.trialInicio, trialFin: data.trialFin } : {}),
      } : { trialDias: 30 }),
    },
    controlRevision,
    ofertaActivaId,
  };
}
