import { type Firestore } from "firebase-admin/firestore";
import { exigirTenantActivo } from "../tenant-configuration/authority";
import { type BundleLegal } from "./catalog";
type Request = {
    auth?: {
        uid: string;
        token: Record<string, unknown>;
    };
    data?: unknown;
};
type UserRecordLike = {
    disabled?: boolean;
    tokensValidAfterTime?: string;
};
type Dependencies = {
    db?: Firestore | any;
    exigirTenant?: typeof exigirTenantActivo;
    getUser?: (uid: string) => Promise<UserRecordLike>;
    bundle?: BundleLegal;
    serverTimestamp?: () => unknown;
};
/** Estado mínimo visible al administrador del tenant; los textos no se reconstruyen desde el cliente. */
export declare function consultarEstadoLegalTenant(request: Request, dependencies?: Dependencies): Promise<{
    empresaId: string;
    nombreEmpresa: any;
    bundleId: string;
    estado: string;
    requiereAceptacion: boolean;
    aceptado: boolean;
    aceptacionId: string | null;
    aceptadoEn: string | null;
    documentos: readonly import("./catalog").DocumentoLegalVersionado[];
}>;
/** Registra aceptación contractual inmutable. Las autorizaciones personales son otra operación y no se infieren aquí. */
export declare function aceptarDocumentosLegalesTenant(request: Request, dependencies?: Dependencies): Promise<{
    aceptacionId: string;
    bundleId: string;
    idempotente: any;
    aceptadoEn: string | null;
}>;
export {};
