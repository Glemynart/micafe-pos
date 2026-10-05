import { getApps, initializeApp } from "firebase-admin/app";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { ejecutarRestablecimientoOperadorTenant } from "../../functions/src/tenant-credential-recovery/handler";

if (!getApps().length) initializeApp();

const REGION = "us-central1";
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/cafeatrato-[a-z0-9-]+-glemynarts-projects\.vercel\.app$/;
const CORS_ORIGINS: Array<string | RegExp> = [
  "https://cafeatrato.vercel.app",
  "https://cafeatrato-bg6o3l7mf-glemynarts-projects.vercel.app",
  VERCEL_PREVIEW_ORIGIN,
];
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");

function pepper(): string {
  const value = PIN_PEPPER.value();
  if (!value) throw new HttpsError("internal", "No se pudo procesar la credencial.");
  return value;
}

export const restablecerCredencialOperativa = onCall(
  { region: REGION, secrets: [PIN_PEPPER], cors: CORS_ORIGINS, invoker: "public" },
  async (request) => ejecutarRestablecimientoOperadorTenant(request, pepper()),
);
