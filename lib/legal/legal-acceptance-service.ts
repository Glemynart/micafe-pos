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
  aceptacionDisponible: boolean;
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
  anexoTenant: {
    schemaVersion: 1;
    empresaId: string;
    revision: number;
    perfil: { referenciaVerificacion: string; nombreComercial: string; tipoPersona: "NATURAL" | "JURIDICA" };
    representante: { referenciaDesignacion: string };
    capacidades: string[];
    contactoPrivacidad: { autoridadId: string; version: number; canal: "EMAIL_VERIFICADO" | "WHATSAPP_VERIFICADO" };
    instrucciones: {
      referencia: string;
      confirmadasPorAdmin: string;
      titulares: string[];
      categoriasDatos: string[];
      finalidades: string[];
      instruccionSalida: "DEVOLVER_Y_SUPRIMIR_SEGUN_RETENCIONES" | "DEVOLVER_Y_SOLICITAR_SUPRESION";
    };
    subencargados: { versionRegistro: number; sha256Registro: string; entradas: Array<{ id: string; producto: string; finalidad: string; paisIso2: string; instrumentoRef: string }> };
    conservacion: { version: number; sha256: string; respaldoRef: string };
    seguridad: { version: number; sha256: string; controlesRef: string };
  } | null;
  sha256AnexoTenant: string | null;
  faltantesAnexoTenant: string[];
  documentos: DocumentoLegalCliente[];
  documentosAceptados: Array<Pick<DocumentoLegalCliente, "id" | "version" | "sha256">> | null;
  sha256CondicionesComerciales: string | null;
  historial: Array<{ aceptacionId: string; uid: string; bundleId: string; referenciaContrato: string; aceptadoEn: string; documentos: Array<Pick<DocumentoLegalCliente, "id" | "version" | "sha256">> }>;
  historialLimitado: boolean;
  siguienteCursor: string | null;
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
  sha256AnexoTenant: string;
  anexoTenant: NonNullable<EstadoLegalTenant["anexoTenant"]>;
}

export async function consultarEstadoLegalTenant(cursor?: string): Promise<EstadoLegalTenant> {
  const callable = httpsCallable<{ cursor?: string }, EstadoLegalTenant>(getFirebaseFunctions(), "consultarEstadoLegalTenant");
  return (await callable(cursor ? { cursor } : {})).data;
}

export async function aceptarDocumentosLegalesTenant(input: {
  bundleId: string;
  aceptoTerminos: true;
  aceptoAnexo: true;
  declaroFacultad: true;
  confirmoInstruccionesAnexo: true;
  sha256AnexoTenant: string;
  correlationId: string;
  referenciaContrato: string;
}): Promise<ReciboAceptacionLegal> {
  const callable = httpsCallable<typeof input, ReciboAceptacionLegal>(getFirebaseFunctions(), "aceptarDocumentosLegalesTenant");
  return (await callable(input)).data;
}
