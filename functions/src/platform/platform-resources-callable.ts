import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { autorizarPlataforma } from "./authorization";
import { listarRecursosPlataforma, type RecursoPlataforma } from "./queries";

const REGION = "us-central1";

function exigirAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTENTICACION_REQUERIDA");
  return request.auth;
}

export const listarRecursosPlataformaSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, "PLATAFORMA_CONSULTAR");
  const data = request.data as { recurso: RecursoPlataforma; limite?: number; estado?: string; empresaId?: string; cursor?: string };
  if (data.recurso === "operadores") {
    await autorizarPlataforma(db, auth.uid, auth.token, "OPERADORES_GOBERNAR");
  }
  return listarRecursosPlataforma(db, data.recurso, {
    ...data,
    ...(data.recurso === "soporte" ? { operadorUid: auth.uid } : {}),
  });
});
