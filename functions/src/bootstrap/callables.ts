import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ejecutarBootstrapEmpresarial } from "./service";
import type { EntradaBootstrapEmpresarial } from "../../../lib/bootstrap/contrato";

const REGION = "us-central1";

export const bootstrapEmpresarialCallable = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Autenticación requerida.");
    const data = request.data as EntradaBootstrapEmpresarial | undefined;
    if (!data) throw new HttpsError("invalid-argument", "Datos de bootstrap requeridos.");
    if (data.ownerUid !== request.auth.uid) {
      throw new HttpsError("permission-denied", "Acceso denegado.");
    }
    return ejecutarBootstrapEmpresarial(undefined, data);
  }
);
