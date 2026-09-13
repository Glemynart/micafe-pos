import { HttpsError } from "firebase-functions/v2/https";
import { exigirTenantActivo } from "../operational-auth";
import {
  revalidarAutoridadFinancieraEnTransaccion,
  type ContextoFinancieroOperativo,
} from "../finanzas/callables";

const fail = (code: HttpsError["code"], domain: string): never => {
  throw new HttpsError(code, "Autoridad de venta Bodega denegada.", { code: domain });
};

/** Frontera previa: deriva tenant y actor de Auth; nunca de un payload. */
export async function crearContextoVentaBodegaDesdeRequest(request: any, db: any): Promise<ContextoFinancieroOperativo> {
  const tenant = await exigirTenantActivo(request, db);
  return { empresaId: tenant.id, actorUid: request.auth.uid, rol: tenant.rol };
}

/**
 * Frontera decisiva de U3: se ejecutará en la misma transacción del efecto.
 * Compone la autoridad de membresía existente con el vertical y capability.
 */
export async function revalidarAutoridadVentaBodegaEnTransaccion(tx: any, db: any, contexto: ContextoFinancieroOperativo): Promise<void> {
  await revalidarAutoridadFinancieraEnTransaccion(tx, db, contexto, "sell");
  if (contexto.rol !== "vendedor") fail("permission-denied", "ROL_VENDEDOR_REQUERIDO");
  const configuracionSnap = await tx.get(db.collection("configuraciones").doc(contexto.empresaId));
  const configuracion = configuracionSnap.data() as Record<string, any> | undefined;
  if (!configuracionSnap.exists
    || configuracion?.empresaId !== contexto.empresaId
    || configuracion.vertical !== "BODEGA_MVP1"
    || !Array.isArray(configuracion.modulos?.habilitados)
    || !configuracion.modulos.habilitados.includes("sell")) {
    fail("permission-denied", "VENTA_BODEGA_NO_AUTORIZADA");
  }
}
