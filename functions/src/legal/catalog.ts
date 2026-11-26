export type EstadoDocumentoLegal = "BORRADOR" | "PUBLICADO";
export type TipoDocumentoLegal = "CONTRACTUAL" | "INFORMATIVO";

export interface DocumentoLegalVersionado {
  id: "terminos" | "politica-tratamiento" | "aviso-autorizacion" | "anexo-tratamiento";
  titulo: string;
  version: "0.2" | "0.3" | "0.4" | "0.5";
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
 * Huellas exactas de los borradores en public/legal/v0.5. El estado del bundle
 * evita presentarlos como documentos vigentes o exigibles.
 */
export const BUNDLE_LEGAL_ACTUAL: BundleLegal = {
  id: "dusema-pos-2026-11-v0.5",
  estado: "PREPARACION",
  documentosContractualesRequeridos: ["terminos", "anexo-tratamiento"],
  documentos: [
    { id: "terminos", titulo: "Términos del servicio", version: "0.5", sha256: "b0bd935ccea3708852a5567946105b1d0dfe9ade2e321738d347d52071a3232e", rutaPublica: "/legal/v0.5/terminos-servicio.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
    { id: "politica-tratamiento", titulo: "Política de tratamiento de datos personales", version: "0.5", sha256: "f532ba15e4f4d51205ed80717d819d9321dd527e4569c1a132c9154cf29ba4a6", rutaPublica: "/legal/v0.5/politica-tratamiento.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "aviso-autorizacion", titulo: "Aviso de privacidad de Dusema POS", version: "0.5", sha256: "6425ba3c4bf154842a8ab7a01c01e2770a99ef1d51e8f2d33ade29a657aa4839", rutaPublica: "/legal/v0.5/aviso-autorizacion.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "anexo-tratamiento", titulo: "Anexo de tratamiento por cuenta del negocio", version: "0.5", sha256: "e26cff7a70312e84ededabbbcf022ace8044e90d0f5d3a5baec6fe4836e56682", rutaPublica: "/legal/v0.5/anexo-tratamiento.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
  ],
};
