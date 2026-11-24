export type EstadoDocumentoLegal = "BORRADOR" | "PUBLICADO";
export type TipoDocumentoLegal = "CONTRACTUAL" | "INFORMATIVO";

export interface DocumentoLegalVersionado {
  id: "terminos" | "politica-tratamiento" | "aviso-autorizacion" | "anexo-tratamiento";
  titulo: string;
  version: "0.2";
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
 * Huellas de los archivos publicados en public/legal/v0.2. Los cuatro textos
 * son borradores; el estado del bundle evita presentarlos como contrato vigente.
 */
export const BUNDLE_LEGAL_ACTUAL: BundleLegal = {
  id: "dusema-pos-2026-11-v0.2",
  estado: "PREPARACION",
  documentosContractualesRequeridos: ["terminos", "anexo-tratamiento"],
  documentos: [
    { id: "terminos", titulo: "Términos del servicio", version: "0.2", sha256: "0aa156f6234bf6d99b4f81d06fd4bd60048af63b16b42a78e44b100f505c4a52", rutaPublica: "/legal/v0.2/terminos-servicio.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
    { id: "politica-tratamiento", titulo: "Política de tratamiento de datos personales", version: "0.2", sha256: "810d5a19e22ce1647c994d6207ee9ab68fde3f6b9370653bb3bdf05411106a06", rutaPublica: "/legal/v0.2/politica-tratamiento.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "aviso-autorizacion", titulo: "Aviso y autorización de datos", version: "0.2", sha256: "8e82e6f14ed39e7b54d266856bb3b0155d4702cdd50bd9e04d77f022f783d391", rutaPublica: "/legal/v0.2/aviso-autorizacion.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "anexo-tratamiento", titulo: "Anexo de tratamiento por cuenta del negocio", version: "0.2", sha256: "fea2422ee7520accc1bb56fb68f0d9a27dd05527b29a9686dd1f2958ceac5638", rutaPublica: "/legal/v0.2/anexo-tratamiento.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
  ],
};
