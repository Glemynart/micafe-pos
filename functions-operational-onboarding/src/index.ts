import { getApps, initializeApp } from "firebase-admin/app";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { crearIncorporacionDirecta as crearIncorporacionDirectaServicio } from "../../functions/src/operational-onboarding/direct";
import { exigirTenantActivo } from "../../functions/src/tenant-configuration/authority";

if (!getApps().length) initializeApp();

const REGION = "us-central1";
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");
const OPTIONS = { region: REGION, secrets: [PIN_PEPPER], invoker: "public" as const };

function obtenerPepper(): string {
  const pepper = PIN_PEPPER.value();
  if (!pepper) throw new HttpsError("internal", "No fue posible crear la incorporacion.");
  return pepper;
}

/** Alta directa aislada: la empresa y el administrador provienen de Auth/membresía revalidados. */
export const crearIncorporacionDirecta = onCall(OPTIONS, async (request) => {
  const tenant = await exigirTenantActivo(request);
  if (tenant.rol !== "admin") throw new HttpsError("permission-denied", "Acceso denegado.");
  return crearIncorporacionDirectaServicio({
    empresaId: tenant.id,
    emisorUid: request.auth!.uid,
    data: request.data,
    pepper: obtenerPepper(),
  });
});
