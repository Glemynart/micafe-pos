import { type RolTenant } from "../contracts";
/** La membresía, no `usuarios`, decide rol, permisos y estado. */
export declare function validarMembresiaActiva(empresaId: string, uid: string, dbParam?: any): Promise<{
    rol: RolTenant;
    permisos: string[];
}>;
/** Revalida claim, Empresa y membresía para lecturas tenant de backend. */
export declare function exigirTenantActivo(request: {
    auth?: {
        uid: string;
        token: Record<string, unknown>;
    };
}, dbParam?: any): Promise<{
    id: string;
    estado: string;
    rol: "admin" | "supervisor" | "cajero" | "vendedor" | "cocinero" | "marketing";
    permisos: string[];
    paisFiscal: string | undefined;
}>;
