import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { ejecutarBootstrapEmpresarial } from "./service";
import type { EntradaBootstrapEmpresarial } from "../../../lib/bootstrap/contrato";

const REGION = "us-central1";
// ADR-SAAS-013 — paso H (emisión de la credencial operativa inicial) hashea
// un PIN con este secreto; sin declararlo aquí, `.value()` no resuelve.
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");

export const bootstrapEmpresarialCallable = onCall(
  { region: REGION, secrets: [PIN_PEPPER] },
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
