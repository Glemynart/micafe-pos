import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/lib/firebase";

export interface DocumentoLegalCliente {
  id: string;
  titulo: string;
  version: string;
  sha256: string;
  rutaPublica: string;
  tipo: "CONTRACTUAL" | "INFORMATIVO";
  estado: "BORRADOR" | "PUBLICADO";
}

export interface EstadoLegalTenant {
  empresaId: string;
  nombreEmpresa: string;
  bundleId: string;
  estado: "PREPARACION" | "EXIGIBLE";
  requiereAceptacion: boolean;
  aceptado: boolean;
  aceptacionId: string | null;
  aceptadoEn: string | null;
  condicionesComerciales: {
    referenciaContrato: string;
    codigoPlan: string;
    planVersion: number;
    periodicidad: "ANUAL";
    precio: { importe: number; moneda: string };
    vigencia: { inicio: string; fin: string };
    capacidades: string[];
    limites: Record<string, { unidad: string; valor: number }>;
    fiscalidad: { pais?: string; modalidad?: string; habilitada?: boolean } | null;
    trialDias: number | null;
  } | null;
  documentos: DocumentoLegalCliente[];
  documentosAceptados: Array<Pick<DocumentoLegalCliente, "id" | "version" | "sha256">> | null;
  sha256CondicionesComerciales: string | null;
}

export interface ReciboAceptacionLegal {
  aceptacionId: string;
  bundleId: string;
  idempotente: boolean;
  aceptadoEn: string | null;
  referenciaContrato: string;
  sha256CondicionesComerciales: string;
  condicionesComerciales: NonNullable<EstadoLegalTenant["condicionesComerciales"]>;
  documentos: Array<Pick<DocumentoLegalCliente, "id" | "version" | "sha256">>;
}

export async function consultarEstadoLegalTenant(): Promise<EstadoLegalTenant> {
  const callable = httpsCallable<void, EstadoLegalTenant>(getFirebaseFunctions(), "consultarEstadoLegalTenant");
  return (await callable()).data;
}

export async function aceptarDocumentosLegalesTenant(input: {
  bundleId: string;
  aceptoTerminos: true;
  aceptoAnexo: true;
  declaroFacultad: true;
  correlationId: string;
  referenciaContrato: string;
}): Promise<ReciboAceptacionLegal> {
  const callable = httpsCallable<typeof input, ReciboAceptacionLegal>(getFirebaseFunctions(), "aceptarDocumentosLegalesTenant");
  return (await callable(input)).data;
}
