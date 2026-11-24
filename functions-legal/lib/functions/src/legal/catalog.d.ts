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
export declare const BUNDLE_LEGAL_ACTUAL: BundleLegal;
