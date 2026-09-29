import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { autorizarPlataforma } from "../../functions/src/platform/authorization";
import { solicitarBootstrapEmpresarial } from "../../lib/bootstrap/shared";

if (!getApps().length) initializeApp();

const REGION = "us-central1";
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");

function exigirAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTENTICACION_REQUERIDA");
  return request.auth;
}

/**
 * Adapter dedicado de plataforma. La autoridad se resuelve en Firestore a
 * partir de la identidad autenticada; el payload nunca aporta facultades.
 */
export const solicitarBootstrapEmpresarialSaas = onCall(
  { region: REGION, secrets: [PIN_PEPPER], invoker: "public" },
  async (request) => {
    const auth = exigirAuth(request);
    const db = getFirestore();
    await autorizarPlataforma(db, auth.uid, auth.token, "BOOTSTRAP_EMPRESARIAL_SOLICITAR");
    return solicitarBootstrapEmpresarial(db, auth.uid, request.data as never);
  },
);
