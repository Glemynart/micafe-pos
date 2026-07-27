import { MODULOS_CONFIGURACION } from "../../lib/configuracion/catalogos";

export const PERMISO_ADMIN_FALTANTE = "cuentas_cobro" as const;

function normalizarLista(permisos: readonly string[]): string[] {
  return [...new Set(permisos)].sort();
}

export const ADMIN_PERMISOS_CANONICOS = normalizarLista([...MODULOS_CONFIGURACION]);

export const ADMIN_PERMISOS_LEGACY_SIN_CUENTAS_COBRO = ADMIN_PERMISOS_CANONICOS
  .filter((permiso) => permiso !== PERMISO_ADMIN_FALTANTE);

export function normalizarPermisos(valor: unknown): string[] | null {
  if (!Array.isArray(valor) || valor.some((permiso) => typeof permiso !== "string" || !permiso)) return null;
  return normalizarLista(valor);
}

export type DiagnosticoPermisosAdmin =
  | "CANONICO"
  | "LEGACY_SIN_CUENTAS_COBRO"
  | "INVALIDO"
  | "OTRO";

export function diagnosticarPermisosAdmin(valor: unknown): DiagnosticoPermisosAdmin {
  const permisos = normalizarPermisos(valor);
  if (!permisos) return "INVALIDO";
  if (JSON.stringify(permisos) === JSON.stringify(ADMIN_PERMISOS_CANONICOS)) return "CANONICO";
  if (JSON.stringify(permisos) === JSON.stringify(ADMIN_PERMISOS_LEGACY_SIN_CUENTAS_COBRO)) return "LEGACY_SIN_CUENTAS_COBRO";
  return "OTRO";
}

export type PoliticaPlantillaAdmin =
  | "SIN_CAMBIOS"
  | "AUTOCORREGIR_LEGACY"
  | "REVISION_MANUAL";

export function resolverPoliticaPlantillaAdmin(
  diagnostico: DiagnosticoPermisosAdmin,
): PoliticaPlantillaAdmin {
  if (diagnostico === "CANONICO") return "SIN_CAMBIOS";
  if (diagnostico === "LEGACY_SIN_CUENTAS_COBRO") return "AUTOCORREGIR_LEGACY";
  return "REVISION_MANUAL";
}
