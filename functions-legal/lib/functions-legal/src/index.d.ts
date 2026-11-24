export declare const consultarEstadoLegalTenant: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    empresaId: string;
    nombreEmpresa: any;
    bundleId: string;
    estado: string;
    requiereAceptacion: boolean;
    aceptado: boolean;
    aceptacionId: string | null;
    aceptadoEn: string | null;
    documentos: readonly import("../../functions/src/legal/catalog").DocumentoLegalVersionado[];
}>, unknown>;
export declare const aceptarDocumentosLegalesTenant: import("firebase-functions/v2/https").CallableFunction<any, Promise<{
    aceptacionId: string;
    bundleId: string;
    idempotente: any;
    aceptadoEn: string | null;
}>, unknown>;
