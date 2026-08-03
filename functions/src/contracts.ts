export const ROLES_TENANT = [
  "admin",
  "supervisor",
  "cajero",
  "cocinero",
  "marketing",
] as const;

export type RolTenant = (typeof ROLES_TENANT)[number];

const CODIGO_REGEX = /^[a-z0-9._-]{3,32}$/;
const PIN_REGEX = /^[0-9]{6}$/;

/**
 * Quién emitió la incorporación/credencial (ADR-SAAS-013 §7.4). Aditivo:
 * ausente en todo documento preexistente, que se sigue leyendo como si
 * fuera "TENANT" (el único origen posible antes de este campo).
 */
export const ORIGENES_INCORPORACION = ["PLATAFORMA", "TENANT"] as const;
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

export const MECANISMOS_INCORPORACION = ["DIRECTA", "EMAIL"] as const;
export type MecanismoIncorporacion = (typeof MECANISMOS_INCORPORACION)[number];

export const ESTADOS_INCORPORACION = [
  "INVITED",
  "TEMP_CREDENTIAL",
  "ACTIVE",
  "CANCELLED",
  "EXPIRED",
] as const;
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

export function normalizarCodigo(codigo: unknown): string | null {
  if (typeof codigo !== "string") return null;
  const normalizado = codigo.trim().toLowerCase();
  return CODIGO_REGEX.test(normalizado) ? normalizado : null;
}

export function esPinValido(pin: unknown): pin is string {
  return typeof pin === "string" && PIN_REGEX.test(pin);
}

export function esRolTenant(rol: unknown): rol is RolTenant {
  return typeof rol === "string" && (ROLES_TENANT as readonly string[]).includes(rol);
}

export function esMecanismoIncorporacion(valor: unknown): valor is MecanismoIncorporacion {
  return typeof valor === "string" && (MECANISMOS_INCORPORACION as readonly string[]).includes(valor);
}

export function esEstadoIncorporacion(valor: unknown): valor is EstadoIncorporacion {
  return typeof valor === "string" && (ESTADOS_INCORPORACION as readonly string[]).includes(valor);
}

export function normalizarEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const normalizado = email.trim().toLowerCase();
  return normalizado.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)
    ? normalizado
    : null;
}

export function normalizarNombre(nombre: unknown): string | null {
  if (typeof nombre !== "string") return null;
  const normalizado = nombre.trim();
  return normalizado.length >= 2 && normalizado.length <= 120 ? normalizado : null;
}

export function idCredencialOperativa(empresaId: string, codigo: string): string {
  return `${empresaId}_${codigo}`;
}
