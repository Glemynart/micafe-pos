import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { autorizarPlataforma } from "./authorization";

const REGION = "us-central1";

function exigirAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTENTICACION_REQUERIDA");
  return request.auth;
}

export const consultarContextoPlataforma = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const operador = await autorizarPlataforma(getFirestore(), auth.uid, auth.token);
  return {
    uid: operador.uid,
    estado: operador.estado,
    facultades: operador.facultades,
    versionAutorizacion: operador.versionAutorizacion,
  };
});
