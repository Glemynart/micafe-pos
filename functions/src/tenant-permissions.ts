import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import type { RolTenant } from "./contracts";

/** Plantilla canónica mínima del rol Bodega MVP-1. */
export const PERMISOS_VENDEDOR = ["sell", "shifts"] as const;

/** Normaliza permisos sin leer autoridad ni crear sesión. */
export function normalizarPermisosEfectivos(valor: unknown): string[] | null {
  if (!Array.isArray(valor) || valor.some((permiso) => typeof permiso !== "string" || !permiso)) return null;
  return [...new Set(valor)].sort();
}

/** Lee la plantilla de rol requerida por los adaptadores autorizados. */
export async function permisosPredeterminados(rol: RolTenant, dbParam?: FirebaseFirestore.Firestore): Promise<string[]> {
  const db = dbParam ?? getFirestore();
  const snap = await db.collection("permisos_roles").doc(rol).get();
  const permisos = normalizarPermisosEfectivos(snap.data()?.permisos);
  if (!snap.exists || !permisos) {
    logger.error("membership_default_template_invalid", { rol });
    throw new HttpsError("failed-precondition", "La plantilla de permisos no está disponible.");
  }
  if (rol === "vendedor" && (permisos.length !== PERMISOS_VENDEDOR.length
    || permisos.some((permiso, indice) => permiso !== PERMISOS_VENDEDOR[indice]))) {
    logger.error("membership_vendedor_template_invalid");
    throw new HttpsError("failed-precondition", "La plantilla de permisos de vendedor es inválida.");
  }
  return permisos;
}
