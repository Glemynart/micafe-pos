import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { exigirTenantActivo } from "../operational-auth";
import { ejecutarRegistrarCompraOperativaV1 } from "./compra-core";

const REGION = "us-central1";

export { ejecutarRegistrarCompraOperativaV1 } from "./compra-core";
export type { ContextoFinancieroOperativo } from "./callables";

/** La callable histórica sigue siendo la entrada de los verticales generales. */
export const registrarCompraOperativaV1 = onCall({ region: REGION }, async request => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  return ejecutarRegistrarCompraOperativaV1(db, { empresaId: tenant.id, actorUid: request.auth!.uid, rol: tenant.rol }, request.data);
});
