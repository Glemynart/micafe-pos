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

export interface CredencialOperativa {
  empresaId: string;
  uid: string;
  codigo: string;
  pinHash: string;
  activo: boolean;
  fallosConsecutivos: number;
  bloqueadoHasta: FirebaseFirestore.Timestamp | null;
  creadaEn: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  actualizadaEn: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  pinActualizadoEn: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
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

export function idCredencialOperativa(empresaId: string, codigo: string): string {
  return `${empresaId}_${codigo}`;
}
