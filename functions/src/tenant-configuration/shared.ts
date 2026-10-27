import type { Firestore } from "firebase-admin/firestore";
import type { ConfiguracionEmpresa } from "../../../lib/configuracion/contrato";
import { leerConfiguracionEmpresa } from "../configuracion/reader";
import { resolverModulosInicialesDelPlan } from "../configuracion/capacidades-plan";
import { exigirTenantActivo } from "./authority";

export interface SolicitudConfiguracionTenant {
  auth?: { uid: string; token: Record<string, unknown> };
  data?: unknown;
}

/** Proyección de lectura: una capacidad guardada deja de ser efectiva al perder su contrato. */
export function proyectarModulosConCapacidadesVigentes(
  configuracion: ConfiguracionEmpresa,
  capacidadesVigentes: readonly string[],
): ConfiguracionEmpresa {
  if (!configuracion.modulos.habilitados.includes("reports")
    || capacidadesVigentes.includes("reports")) return configuracion;
  return {
    ...configuracion,
    modulos: {
      ...configuracion.modulos,
      habilitados: configuracion.modulos.habilitados.filter((modulo) => modulo !== "reports"),
    },
  };
}

/** `data` no transporta autoridad funcional y se ignora por compatibilidad. */
export async function obtenerConfiguracionEmpresa(
  request: SolicitudConfiguracionTenant,
  db: Firestore,
): Promise<ConfiguracionEmpresa> {
  const tenant = await exigirTenantActivo(request, db);
  const configuracion = await leerConfiguracionEmpresa(db, tenant.id);
  if (!configuracion.modulos.habilitados.includes("reports")) return configuracion;
  try {
    const capacidades = await resolverModulosInicialesDelPlan(db, tenant.id);
    return proyectarModulosConCapacidadesVigentes(configuracion, capacidades);
  } catch {
    // Una falla de resolución nunca amplía la capacidad ni rompe el resto del POS.
    return proyectarModulosConCapacidadesVigentes(configuracion, []);
  }
}
