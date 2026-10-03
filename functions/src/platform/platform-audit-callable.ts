import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { autorizarPlataforma } from "./authorization";
import { consultarAuditoriaPlataforma, validarFiltroAuditoria } from "./queries";

const REGION = "us-central1";

function exigirAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTENTICACION_REQUERIDA");
  return request.auth;
}

/**
 * Proyección backend-only de ADR-SAAS-012. No declara Secrets ni realiza
 * escrituras durante una lectura ordinaria.
 */
export const consultarAuditoriaPlataformaSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token, "PLATAFORMA_CONSULTAR");
  const data = request.data as { filtro?: unknown; limite?: number; cursor?: unknown };
  if (data.cursor !== undefined && typeof data.cursor !== "string") {
    throw new HttpsError("invalid-argument", "CURSOR_INVALIDO");
  }
  return consultarAuditoriaPlataforma(db, validarFiltroAuditoria(data.filtro), data.limite, data.cursor);
});
