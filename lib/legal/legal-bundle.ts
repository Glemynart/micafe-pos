export type EstadoDocumentoLegal = "BORRADOR" | "PUBLICADO";
export type TipoDocumentoLegal = "CONTRACTUAL" | "INFORMATIVO";

export interface DocumentoLegalVersionado {
  id: "terminos" | "politica-tratamiento" | "aviso-autorizacion" | "anexo-tratamiento";
  titulo: string;
  version: "0.2" | "0.3" | "0.4" | "0.5" | "0.6" | "0.7";
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
 * Huellas exactas de los borradores en public/legal/v0.7. El estado del bundle
 * evita presentarlos como documentos vigentes o exigibles.
 */
export const BUNDLE_LEGAL_ACTUAL: BundleLegal = {
  id: "dusema-pos-2026-11-v0.7",
  estado: "PREPARACION",
  documentosContractualesRequeridos: ["terminos", "anexo-tratamiento"],
  documentos: [
    { id: "terminos", titulo: "Términos del servicio", version: "0.7", sha256: "efcd8eb2365386b8a4277fd7dd731895139fb0861fcc6dd2092fdcb2139d850b", rutaPublica: "/legal/v0.7/terminos-servicio.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
    { id: "politica-tratamiento", titulo: "Política de tratamiento de datos personales", version: "0.7", sha256: "64207fef36b1fab0ae468c26852863a82b7ac4d3d7e86c975dde9d1eb7a6392a", rutaPublica: "/legal/v0.7/politica-tratamiento.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "aviso-autorizacion", titulo: "Aviso de privacidad de Dusema POS", version: "0.7", sha256: "5ab4a8e97dde0ee5d2b147d319c1a6d4de33a011615f8104f930d39d0144f47c", rutaPublica: "/legal/v0.7/aviso-autorizacion.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "anexo-tratamiento", titulo: "Anexo de tratamiento por cuenta del negocio", version: "0.7", sha256: "7b5b7107e7d1a0e0e77b8da5057eaf56bce0c0b0e02ffba2425be0f12396138b", rutaPublica: "/legal/v0.7/anexo-tratamiento.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
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
