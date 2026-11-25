export type EstadoDocumentoLegal = "BORRADOR" | "PUBLICADO";
export type TipoDocumentoLegal = "CONTRACTUAL" | "INFORMATIVO";

export interface DocumentoLegalVersionado {
  id: "terminos" | "politica-tratamiento" | "aviso-autorizacion" | "anexo-tratamiento";
  titulo: string;
  version: "0.2" | "0.3";
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
 * Huellas exactas de los borradores en public/legal/v0.3. El estado del bundle
 * evita presentarlos como documentos vigentes o exigibles.
 */
export const BUNDLE_LEGAL_ACTUAL: BundleLegal = {
  id: "dusema-pos-2026-11-v0.3",
  estado: "PREPARACION",
  documentosContractualesRequeridos: ["terminos", "anexo-tratamiento"],
  documentos: [
    { id: "terminos", titulo: "Términos del servicio", version: "0.3", sha256: "9ff861615098ec8a6f569ac2a66514fdee4a9c37a7bdee09fb47257b126b09d4", rutaPublica: "/legal/v0.3/terminos-servicio.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
    { id: "politica-tratamiento", titulo: "Política de tratamiento de datos personales", version: "0.3", sha256: "f5a66894035a13e1b1c4ea09106f48eba9b28f567525d19b59ae619ede3e28d2", rutaPublica: "/legal/v0.3/politica-tratamiento.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "aviso-autorizacion", titulo: "Aviso de privacidad de Dusema POS", version: "0.3", sha256: "686dd5cd457f41d49a6114f1b9b7bd5a22b8ac565c23b7c27d1813350655c4fe", rutaPublica: "/legal/v0.3/aviso-autorizacion.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "anexo-tratamiento", titulo: "Anexo de tratamiento por cuenta del negocio", version: "0.3", sha256: "70af5c2b1dc183b264b8fd0c59934d10cbae6a09efd1efc5bbe99079b4cd4f92", rutaPublica: "/legal/v0.3/anexo-tratamiento.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
  ],
};
