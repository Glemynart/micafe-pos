import { getApps, initializeApp } from "firebase-admin/app";
import { defineSecret } from "firebase-functions/params";
import { onCall } from "firebase-functions/v2/https";
import {
  ejecutarActivacionRestablecimiento,
  ejecutarRestablecimientoAdministrador,
} from "../../functions/src/platform/credential-recovery";

if (!getApps().length) initializeApp();

const REGION = "us-central1";
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");
const OPTIONS = { region: REGION, secrets: [PIN_PEPPER], invoker: "public" as const };

export const restablecerCredencialAdministradorTenantSaas = onCall(
  OPTIONS,
  async (request) => ejecutarRestablecimientoAdministrador(request, false, PIN_PEPPER.value()),
);

export const reemitirRestablecimientoCredencialAdministradorTenantSaas = onCall(
  OPTIONS,
  async (request) => ejecutarRestablecimientoAdministrador(request, true, PIN_PEPPER.value()),
);

export const activarRestablecimientoCredencial = onCall(
  OPTIONS,
  async (request) => ejecutarActivacionRestablecimiento(request, PIN_PEPPER.value()),
);
