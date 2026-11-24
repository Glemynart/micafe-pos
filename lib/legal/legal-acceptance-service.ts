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
  documentos: DocumentoLegalCliente[];
}

export interface ReciboAceptacionLegal {
  aceptacionId: string;
  bundleId: string;
  idempotente: boolean;
  aceptadoEn: string | null;
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
}): Promise<ReciboAceptacionLegal> {
  const callable = httpsCallable<typeof input, ReciboAceptacionLegal>(getFirebaseFunctions(), "aceptarDocumentosLegalesTenant");
  return (await callable(input)).data;
}
