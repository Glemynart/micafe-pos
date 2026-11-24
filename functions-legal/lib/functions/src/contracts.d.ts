export declare const ROLES_TENANT: readonly ["admin", "supervisor", "cajero", "vendedor", "cocinero", "marketing"];
export type RolTenant = (typeof ROLES_TENANT)[number];
/**
 * Quién emitió la incorporación/credencial (ADR-SAAS-013 §7.4). Aditivo:
 * ausente en todo documento preexistente, que se sigue leyendo como si
 * fuera "TENANT" (el único origen posible antes de este campo).
 */
export declare const ORIGENES_INCORPORACION: readonly ["PLATAFORMA", "TENANT"];
export type OrigenIncorporacion = (typeof ORIGENES_INCORPORACION)[number];
export interface CredencialOperativa {
    empresaId: string;
    uid: string;
    codigo: string;
    incorporacionId?: string;
    pinHash: string;
    activo: boolean;
    fallosConsecutivos: number;
    bloqueadoHasta: FirebaseFirestore.Timestamp | null;
    creadaEn: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
    actualizadaEn: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
    pinActualizadoEn: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
    requiereCambio?: boolean;
    /** ADR-SAAS-017: vínculo no secreto con la recuperación temporal vigente. */
    restablecimientoId?: string | null;
    /** ADR-SAAS-013: quién emitió esta credencial. Ausente en documentos previos a §7.4. */
    origen?: OrigenIncorporacion;
    /** ADR-SAAS-013 D-3: TTL de 72h para credenciales temporales (`requiereCambio=true`). */
    expiraEn?: FirebaseFirestore.Timestamp;
}
export declare const MECANISMOS_INCORPORACION: readonly ["DIRECTA", "EMAIL"];
export type MecanismoIncorporacion = (typeof MECANISMOS_INCORPORACION)[number];
export declare const ESTADOS_INCORPORACION: readonly ["INVITED", "TEMP_CREDENTIAL", "ACTIVE", "CANCELLED", "EXPIRED"];
export type EstadoIncorporacion = (typeof ESTADOS_INCORPORACION)[number];
export interface Incorporacion {
    empresaId: string;
    mecanismo: MecanismoIncorporacion;
    estado: EstadoIncorporacion;
    rol: RolTenant;
    permisosEfectivos: string[];
    emitidaPorUid: string;
    /** ADR-SAAS-013 §7.4: quién la emitió. Ausente en incorporaciones previas al ADR (equivale a "TENANT"). */
    origen?: OrigenIncorporacion;
    uid?: string;
    nombre?: string;
    codigo?: string;
    email?: string;
    generacion?: number;
    tokenDigest?: string | null;
    tokenVersion?: number;
    expiraEn?: FirebaseFirestore.Timestamp;
    enviadaEn?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
    reenvios?: number;
    ultimoReenvioEn?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
    aceptadaPorUid?: string;
    aceptadaEn?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
    canceladaPorUid?: string;
    canceladaEn?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
    expiradaEn?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
    creadaEn: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
    actualizadaEn: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
    activadaEn?: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}
export declare function normalizarCodigo(codigo: unknown): string | null;
export declare function esPinValido(pin: unknown): pin is string;
export declare function esRolTenant(rol: unknown): rol is RolTenant;
export declare function esMecanismoIncorporacion(valor: unknown): valor is MecanismoIncorporacion;
export declare function esEstadoIncorporacion(valor: unknown): valor is EstadoIncorporacion;
export declare function normalizarEmail(email: unknown): string | null;
export declare function normalizarNombre(nombre: unknown): string | null;
export declare function idCredencialOperativa(empresaId: string, codigo: string): string;
