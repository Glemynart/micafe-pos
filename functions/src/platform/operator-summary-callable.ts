import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { autorizarPlataforma } from "./authorization";
import { obtenerResumenOperadorSaas as consultarResumenOperadorSaas } from "./queries";

const REGION = "us-central1";

function exigirAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTENTICACION_REQUERIDA");
  return request.auth;
}

export const obtenerResumenOperadorSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, "PLATAFORMA_CONSULTAR");
  return consultarResumenOperadorSaas(db);
});
