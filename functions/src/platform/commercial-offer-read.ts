import { HttpsError } from "firebase-functions/v2/https";
import type { Firestore } from "firebase-admin/firestore";
import { esIdComercial, type EstadoOfertaComercialTenant, type OfertaComercialTenant } from "../../../lib/suscripciones/contrato";
import { resolverTerminosOfertaTenantAprobada, type TerminosOfertaTenantAprobada } from "./approved-tenant-offers";
import { ofertaComercialActivaRef, ofertaComercialRef, validarOfertaComercialEntrada } from "../suscripciones/ofertas-tenant";

const ESTADOS_OFERTA: readonly EstadoOfertaComercialTenant[] = [
  "BORRADOR",
  "APROBADA",
  "CONSUMIDA",
  "REVOCADA",
  "EXPIRADA",
];

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
>;

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
    const control = controlSnap.data() as { revision?: unknown; ofertaActivaId?: unknown };
    if (!Number.isInteger(control.revision) || (control.revision as number) < 1) {
      throw new HttpsError("failed-precondition", "OFERTA_COMERCIAL_CONTROL_INVALIDO");
    }
    controlRevision = control.revision as number;
    if (control.ofertaActivaId !== null && control.ofertaActivaId !== undefined) {
      if (!esIdComercial(control.ofertaActivaId)) {
        throw new HttpsError("failed-precondition", "OFERTA_COMERCIAL_CONTROL_INVALIDO");
      }
      ofertaActivaId = control.ofertaActivaId;
    }
  }

  if (!ofertaSnap.exists) return { autorizacion, oferta: null, controlRevision, ofertaActivaId };

  const data = ofertaSnap.data() as OfertaComercialTenant;
  if (data.schemaVersion !== 1
    || data.ofertaId !== ofertaId
    || data.empresaIdObjetivo !== empresaId
    || data.planIdBase !== autorizacion.planIdBase
    || !Number.isInteger(data.planVersionBase)
    || data.planVersionBase !== autorizacion.planVersionBase
    || data.periodicidad !== "ANUAL"
    || data.precioAcordado?.importe !== autorizacion.precioAcordado.importe
    || data.precioAcordado?.moneda !== autorizacion.precioAcordado.moneda
    || data.referenciaAprobacion !== autorizacion.referenciaAprobacion
    || !ESTADOS_OFERTA.includes(data.estado)
    || !Number.isInteger(data.revision)
    || data.revision < 1) {
    throw new HttpsError("failed-precondition", "OFERTA_COMERCIAL_INVALIDA");
  }

  validarOfertaComercialEntrada({
    empresaId: data.empresaIdObjetivo,
    ofertaId: data.ofertaId,
    planIdBase: data.planIdBase,
    planVersionBase: data.planVersionBase,
    precioAcordado: data.precioAcordado,
    iniciaEn: data.iniciaEn,
    expiraEn: data.expiraEn,
    referenciaAprobacion: data.referenciaAprobacion,
  });

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
    },
    controlRevision,
    ofertaActivaId,
  };
}
