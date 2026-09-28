import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { ConfiguracionEmpresa } from "../../../lib/configuracion/contrato";
import { validarConfiguracionEmpresa } from "../../../lib/configuracion/validacion";

export const CONFIGURACIONES_COLLECTION = "configuraciones";

/** Lector neutral de solo lectura para la configuración efectiva de un tenant. */
export async function leerConfiguracionEmpresa(
  db: Firestore,
  empresaId: string,
): Promise<ConfiguracionEmpresa> {
  const snap = await db.collection(CONFIGURACIONES_COLLECTION).doc(empresaId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Configuración inexistente.");
  const configuracion = snap.data() as ConfiguracionEmpresa;
  const empresa = await db.collection("empresas").doc(empresaId).get();
  const paisFiscal = empresa.data()?.paisFiscal;
  if (
    !empresa.exists
    || typeof paisFiscal !== "string"
    || !validarConfiguracionEmpresa(configuracion, { empresaId, paisFiscalEmpresa: paisFiscal }).valida
  ) {
    throw new HttpsError("failed-precondition", "Configuración inválida.");
  }
  return configuracion;
}
