import type { Firestore } from "firebase-admin/firestore";
import type { ConfiguracionEmpresa } from "../../../lib/configuracion/contrato";
import { leerConfiguracionEmpresa } from "../configuracion/reader";
import { exigirTenantActivo } from "./authority";

export interface SolicitudConfiguracionTenant {
  auth?: { uid: string; token: Record<string, unknown> };
  data?: unknown;
}

/** `data` no transporta autoridad funcional y se ignora por compatibilidad. */
export async function obtenerConfiguracionEmpresa(
  request: SolicitudConfiguracionTenant,
  db: Firestore,
): Promise<ConfiguracionEmpresa> {
  const tenant = await exigirTenantActivo(request, db);
  return leerConfiguracionEmpresa(db, tenant.id);
}
