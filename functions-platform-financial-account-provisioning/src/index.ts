import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import {
  provisionarCuentaOperativaTenant,
  type EntradaProvisionarCuentaOperativa,
} from "../../functions/src/platform/account-provisioning";
import type { TokenPlataforma } from "../../functions/src/platform/authorization";

if (!getApps().length) initializeApp();

const REGION = "us-central1";

function exigirAuth(request: CallableRequest<EntradaProvisionarCuentaOperativa>) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTH_REQUIRED");
  return request.auth;
}

export const provisionarCuentaOperativaTenantSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const data = request.data as EntradaProvisionarCuentaOperativa;
  return provisionarCuentaOperativaTenant(
    getFirestore(), auth.uid, auth.token as TokenPlataforma, data,
  );
});
