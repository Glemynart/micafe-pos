export type EstadoDocumentoLegal = "BORRADOR" | "PUBLICADO";
export type TipoDocumentoLegal = "CONTRACTUAL" | "INFORMATIVO";

export interface DocumentoLegalVersionado {
  id: "terminos" | "politica-tratamiento" | "aviso-autorizacion" | "anexo-tratamiento";
  titulo: string;
  version: "0.2" | "0.3" | "0.4";
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
 * Huellas exactas de los borradores en public/legal/v0.4. El estado del bundle
 * evita presentarlos como documentos vigentes o exigibles.
 */
export const BUNDLE_LEGAL_ACTUAL: BundleLegal = {
  id: "dusema-pos-2026-11-v0.4",
  estado: "PREPARACION",
  documentosContractualesRequeridos: ["terminos", "anexo-tratamiento"],
  documentos: [
    { id: "terminos", titulo: "Términos del servicio", version: "0.4", sha256: "26ae0f9eab539da0baa6a37bc3ad2a0c1f36eac9513a1d37e4cac31dc99d623e", rutaPublica: "/legal/v0.4/terminos-servicio.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
    { id: "politica-tratamiento", titulo: "Política de tratamiento de datos personales", version: "0.4", sha256: "5f9c4d767d52202b6b004b69a149c5ec6cace1d46383d35e0c80e2ab626e0be9", rutaPublica: "/legal/v0.4/politica-tratamiento.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "aviso-autorizacion", titulo: "Aviso de privacidad de Dusema POS", version: "0.4", sha256: "91c657428f1be458f629fb2c6b6d2acd5fc275d052f8ff926952f35faf0751da", rutaPublica: "/legal/v0.4/aviso-autorizacion.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "anexo-tratamiento", titulo: "Anexo de tratamiento por cuenta del negocio", version: "0.4", sha256: "a46f9557d993a03c6329e7bf43fb9a0938d112138fbb25078420426a6d1a3060", rutaPublica: "/legal/v0.4/anexo-tratamiento.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
  ],
};
