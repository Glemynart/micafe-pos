import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import { crearBindingDusemaStaging, exigirRuntimeDusemaBinding } from "./dusema-binding-command";

const REGION = "us-central1";

function exigirAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTENTICACION_REQUERIDA");
  return request.auth;
}

/**
 * Adaptador aislado de ADR-SAAS-040. No importa `callables.ts` para que el
 * discovery de este codebase no herede params o secretos de otras Functions.
 */
export const crearBindingDusemaStagingSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  exigirRuntimeDusemaBinding();
  return crearBindingDusemaStaging(
    getFirestore(),
    auth.uid,
    auth.token as TokenPlataforma,
    request.data as never,
  );
});
