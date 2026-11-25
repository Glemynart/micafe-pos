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
    { id: "terminos", titulo: "Términos del servicio", version: "0.2", sha256: "3da9b709eb5e043fcf3bb106a5e2e155e23c49ff1f8b2aadf603296020e27ea7", rutaPublica: "/legal/v0.2/terminos-servicio.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
    { id: "politica-tratamiento", titulo: "Política de tratamiento de datos personales", version: "0.2", sha256: "fe859ffdf359910fbf3a52eb0daf175f4e4f5fc40b91554f16e0100d9402f9eb", rutaPublica: "/legal/v0.2/politica-tratamiento.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "aviso-autorizacion", titulo: "Aviso y autorización de datos", version: "0.2", sha256: "848b8c97898dde33576996f00cc4c3efaba9aa1eed152cdb408de12d94afac1b", rutaPublica: "/legal/v0.2/aviso-autorizacion.md", tipo: "INFORMATIVO", estado: "BORRADOR" },
    { id: "anexo-tratamiento", titulo: "Anexo de tratamiento por cuenta del negocio", version: "0.2", sha256: "5fa27aebf552c079b19b5c0bd85745c7cdc6a72f15aee49b8155485ff11d4aa2", rutaPublica: "/legal/v0.2/anexo-tratamiento.md", tipo: "CONTRACTUAL", estado: "BORRADOR" },
  ],
};
