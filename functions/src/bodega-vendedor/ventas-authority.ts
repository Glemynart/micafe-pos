import { HttpsError } from "firebase-functions/v2/https";
import { exigirTenantActivo } from "../tenant-configuration/authority";
import {
  revalidarAutoridadFinancieraEnTransaccion,
  type ContextoFinancieroOperativo,
} from "../bodega/operational-core";

const fail = (code: HttpsError["code"], domain: string): never => {
  throw new HttpsError(code, "Autoridad de venta Bodega denegada.", { code: domain });
};

/** Frontera previa: deriva tenant y actor de Auth; nunca de un payload. */
export async function crearContextoVentaBodegaDesdeRequest(request: any, db: any): Promise<ContextoFinancieroOperativo> {
  const tenant = await exigirTenantActivo(request, db);
  return { empresaId: tenant.id, actorUid: request.auth.uid, rol: tenant.rol };
}

/**
 * Frontera decisiva de la venta Bodega: vendedor aprobado o administración
 * con capacidad explícita sell, siempre dentro de la transacción del efecto.
 */
export async function revalidarAutoridadVentaBodegaEnTransaccion(tx: any, db: any, contexto: ContextoFinancieroOperativo): Promise<void> {
  await revalidarAutoridadFinancieraEnTransaccion(tx, db, contexto, "sell");
  if (contexto.rol !== "vendedor" && contexto.rol !== "admin") fail("permission-denied", "ROL_VENTA_BODEGA_REQUERIDO");
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
