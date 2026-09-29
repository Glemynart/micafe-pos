import { getApps, initializeApp } from "firebase-admin/app";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { activarIncorporacionDirecta as activarIncorporacionDirectaServicio, type SolicitudActivacionDirecta } from "../../functions/src/operational-activation/shared";

if (!getApps().length) initializeApp();

const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");

function obtenerPepper(): string {
  const pepper = PIN_PEPPER.value();
  if (!pepper) throw new HttpsError("internal", "No fue posible crear la incorporacion.");
  return pepper;
}

/**
 * Adapter aislado: toda la identidad de la activación se deriva de Auth.
 * El payload no transporta tenant, UID, claims ni identificadores internos.
 */
export const activarIncorporacionDirecta = onCall(
  { region: "us-central1", secrets: [PIN_PEPPER] },
  async (request) => {
    if (!request.auth || request.auth.token.authStage !== "DIRECTA_TEMP"
      || typeof request.auth.token.incorporacionId !== "string") {
      throw new HttpsError("permission-denied", "Acceso denegado.");
    }
    return activarIncorporacionDirectaServicio({
      incorporacionId: request.auth.token.incorporacionId,
      uid: request.auth.uid,
      data: request.data as SolicitudActivacionDirecta | undefined,
      pepper: obtenerPepper(),
    });
  },
);
