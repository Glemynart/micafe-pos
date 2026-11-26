export type EstadoDocumentoLegal = "BORRADOR" | "PUBLICADO";
export type TipoDocumentoLegal = "CONTRACTUAL" | "INFORMATIVO";

export interface DocumentoLegalVersionado {
  id: "terminos" | "politica-tratamiento" | "aviso-autorizacion" | "anexo-tratamiento";
  titulo: string;
  version: "0.2" | "0.3" | "0.4" | "0.5" | "0.6";
  sha256: string;
  rutaPublica: string;
  tipo: TipoDocumentoLegal;
  estado: EstadoDocumentoLegal;
}

export interface BundleLegal {
  id: string;
  estado: "PREPARACION" | "EXIGIBLE";
  documentos: readonly DocumentoLegalVersionado[];
  documentosContractualesRequeridos: readonly ("terminos" | "anexo-tratamiento")[];
}

/**
 * Huellas exactas de los borradores en public/legal/v0.6. El estado del bundle
 * evita presentarlos como documentos vigentes o exigibles.
 */
export const BUNDLE_LEGAL_ACTUAL: BundleLegal = {
  id: "dusema-pos-2026-11-v0.6",
  estado: "PREPARACION",
  documentosContractualesRequeridos: ["terminos", "anexo-tratamiento"],
  documentos: [
    { id: "terminos", titulo: "Términos del servicio", version: "0.6", sha256: "0f6509480588051f312b37e1bf352ff7c70721857f19ccd56b02640d53ffe059", rutaPublica: "/legal/v0.6/terminos-servicio.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
    { id: "politica-tratamiento", titulo: "Política de tratamiento de datos personales", version: "0.6", sha256: "3b81fed45a99637cd9b6dc5ecd09766544e1161239d8ddcdb183f9b621d4e244", rutaPublica: "/legal/v0.6/politica-tratamiento.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "aviso-autorizacion", titulo: "Aviso de privacidad de Dusema POS", version: "0.6", sha256: "42e9338cae72059cad52aeb8c96e0e4946c0fadfd56dedfffa443bd50a7ea8dd", rutaPublica: "/legal/v0.6/aviso-autorizacion.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "anexo-tratamiento", titulo: "Anexo de tratamiento por cuenta del negocio", version: "0.6", sha256: "e8a9f52ade5ea2785bac7f2c79976b1d7d57ad73710d1b752ae5ed9a8cf87b6e", rutaPublica: "/legal/v0.6/anexo-tratamiento.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
  ],
};

export type LegalPublicPageKey = "terminos" | "privacidad" | "aviso" | "anexo";

const PUBLIC_PAGE_DOCUMENT_IDS: Readonly<Record<LegalPublicPageKey, DocumentoLegalVersionado["id"]>> = {
  terminos: "terminos",
  privacidad: "politica-tratamiento",
  aviso: "aviso-autorizacion",
  anexo: "anexo-tratamiento",
};

export function obtenerDocumentoLegalPublico(key: LegalPublicPageKey): DocumentoLegalVersionado {
  const id = PUBLIC_PAGE_DOCUMENT_IDS[key];
  const document = BUNDLE_LEGAL_ACTUAL.documentos.find((item) => item.id === id);
  if (!document) throw new Error(`No existe el documento legal público configurado para ${key}.`);
  return document;
}
