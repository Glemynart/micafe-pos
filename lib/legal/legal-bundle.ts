export type EstadoDocumentoLegal = "BORRADOR" | "PUBLICADO";
export type TipoDocumentoLegal = "CONTRACTUAL" | "INFORMATIVO";

export interface DocumentoLegalVersionado {
  id: "terminos" | "politica-tratamiento" | "aviso-autorizacion" | "anexo-tratamiento";
  titulo: string;
  version: "0.2" | "0.3" | "0.4" | "0.5" | "0.6" | "0.7" | "0.8" | "0.9";
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
 * Huellas exactas de los borradores en public/legal/v0.9. El estado del bundle
 * evita presentarlos como documentos vigentes o exigibles.
 */
export const BUNDLE_LEGAL_ACTUAL: BundleLegal = {
  id: "dusema-pos-2026-11-v0.9",
  estado: "PREPARACION",
  documentosContractualesRequeridos: ["terminos", "anexo-tratamiento"],
  documentos: [
    { id: "terminos", titulo: "Términos del servicio", version: "0.9", sha256: "7af90c5fc6c1bf2c4e06a5cedd1fe427bf698995bfa1b5a31bfcd1a9c25a2b7a", rutaPublica: "/legal/v0.9/terminos-servicio.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
    { id: "politica-tratamiento", titulo: "Política de tratamiento de datos personales", version: "0.9", sha256: "440fdaa02e6b3c687e7f8cc35862269ebe7e8af45ed263121e7edf2daae8e554", rutaPublica: "/legal/v0.9/politica-tratamiento.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "aviso-autorizacion", titulo: "Aviso de privacidad de Dusema POS", version: "0.9", sha256: "eb3fa4a8dddecc1fea7ee6817e96093828f31bd04bd920389336009982fe32a3", rutaPublica: "/legal/v0.9/aviso-autorizacion.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "anexo-tratamiento", titulo: "Anexo de tratamiento por cuenta del negocio", version: "0.9", sha256: "aaeff070aa6b11a714281d9fc94b5e64af34ea2403efae42bae0cb2dbb76bcbc", rutaPublica: "/legal/v0.9/anexo-tratamiento.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
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
