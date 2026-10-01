import { createHash } from "node:crypto";
import type { Firestore, Query } from "firebase-admin/firestore";

export const INCORPORACIONES_COLLECTION = "incorporaciones";

/** Identificador determinista de una incorporación directa por tenant y código. */
export function idIncorporacionDirecta(empresaId: string, codigo: string): string {
  return createHash("sha256").update(`${empresaId}:DIRECTA:${codigo}`).digest("hex");
}

/**
 * La incorporación DIRECTA más reciente para (empresaId, uid).
 *
 * Esta consulta es canónica para las proyecciones y los flujos de emisión de
 * credenciales: conserva el historial y determina explícitamente cuál registro
 * continúa vigente.
 */
export function consultarIncorporacionDirectaMasReciente(
  db: Firestore,
  empresaId: string,
  uid: string,
): Query {
  return db.collection(INCORPORACIONES_COLLECTION)
    .where("empresaId", "==", empresaId)
    .where("mecanismo", "==", "DIRECTA")
    .where("uid", "==", uid)
    .orderBy("creadaEn", "desc")
    .limit(1);
}
