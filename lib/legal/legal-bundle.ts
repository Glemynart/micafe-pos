export type EstadoDocumentoLegal = "BORRADOR" | "PUBLICADO";
export type TipoDocumentoLegal = "CONTRACTUAL" | "INFORMATIVO";

export interface DocumentoLegalVersionado {
  id: "terminos" | "politica-tratamiento" | "aviso-autorizacion" | "anexo-tratamiento";
  titulo: string;
  version: "0.2" | "0.3" | "0.4" | "0.5" | "0.6" | "0.7" | "0.8";
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
 * Huellas exactas de los borradores en public/legal/v0.8. El estado del bundle
 * evita presentarlos como documentos vigentes o exigibles.
 */
export const BUNDLE_LEGAL_ACTUAL: BundleLegal = {
  id: "dusema-pos-2026-11-v0.8",
  estado: "PREPARACION",
  documentosContractualesRequeridos: ["terminos", "anexo-tratamiento"],
  documentos: [
    { id: "terminos", titulo: "Términos del servicio", version: "0.8", sha256: "922c841d7f62fbdc225e01b3d4735751aa761fccc945bd5a98996b52973dd17d", rutaPublica: "/legal/v0.8/terminos-servicio.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
    { id: "politica-tratamiento", titulo: "Política de tratamiento de datos personales", version: "0.8", sha256: "278f03ccfb1b7a12a3954a8cb5caabceb24e1dfd49b67b764845fac2ac44faf2", rutaPublica: "/legal/v0.8/politica-tratamiento.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "aviso-autorizacion", titulo: "Aviso de privacidad de Dusema POS", version: "0.8", sha256: "2a5da1937dead674b459d2b8c85d9940c7e48a5233b863a63f06041c119d4491", rutaPublica: "/legal/v0.8/aviso-autorizacion.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "anexo-tratamiento", titulo: "Anexo de tratamiento por cuenta del negocio", version: "0.8", sha256: "fd9d857f510b0fe5feda31f980b87a2f101dd4028f464e289ae6d36bf35c40d7", rutaPublica: "/legal/v0.8/anexo-tratamiento.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
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
