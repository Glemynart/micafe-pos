import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import { facultadTransicionEmpresa, obtenerComandoComercial } from "./command-catalog";
import { ejecutarComandoComercial } from "./commercial-command-executor";

const REGION = "us-central1";

function exigirAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTENTICACION_REQUERIDA");
  return request.auth;
}

/**
 * Frontera comercial dedicada. Conserva exactamente el contrato y la
 * autorización de la callable que antes declaraba `saas-auth`.
 */
export const ejecutarComandoComercialSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const data = request.data as { tipo?: unknown; entrada?: unknown };
  const comando = obtenerComandoComercial(data?.tipo);
  if (!data || !data.entrada || typeof data.entrada !== "object" || Array.isArray(data.entrada)) {
    throw new HttpsError("invalid-argument", "ENTRADA_COMANDO_INVALIDA");
  }
  const db = getFirestore();
  const entrada = data.entrada as { destino?: unknown; empresaId?: unknown };
  const facultad = comando.tipo === "TransicionarEmpresa"
    ? await facultadTransicionEmpresa(db, entrada.destino, entrada.empresaId)
    : comando.facultad;
  await autorizarPlataforma(db, auth.uid, auth.token as TokenPlataforma, facultad);
  return ejecutarComandoComercial(db, auth.uid, comando.tipo, data.entrada as never);
});
