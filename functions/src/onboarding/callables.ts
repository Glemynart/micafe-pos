import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { exigirAdminTenant, exigirTenantActivo } from "../operational-auth";
import {
  completarPasoConfiguracionFiscalOnboarding,
  completarPasoNumeracionOnboarding,
  obtenerEstadoOnboardingTenant,
  type EntradaPasoFiscalOnboarding,
  type EntradaPasoNumeracionOnboarding,
} from "./service";

const REGION = "us-central1";

export const obtenerEstadoOnboarding = onCall({ region: REGION }, async (request) => {
  const empresa = await exigirTenantActivo(request);
  const db = getFirestore();
  return obtenerEstadoOnboardingTenant(db, empresa.id, empresa.paisFiscal ?? "CO");
});

export const completarPasoFiscalOnboardingCallable = onCall({ region: REGION }, async (request) => {
  const empresa = await exigirAdminTenant(request);
  const data = request.data as EntradaPasoFiscalOnboarding | undefined;
  if (!data) throw new HttpsError("invalid-argument", "Datos de paso fiscal requeridos.");

  const db = getFirestore();
  return completarPasoConfiguracionFiscalOnboarding(db, data, {
    empresaId: empresa.id,
    actorId: request.auth!.uid,
    origen: "ONBOARDING",
    paisFiscal: empresa.paisFiscal ?? "CO",
  });
});

export const completarPasoNumeracionOnboardingCallable = onCall({ region: REGION }, async (request) => {
  const empresa = await exigirAdminTenant(request);
  const data = request.data as EntradaPasoNumeracionOnboarding | undefined;
  if (!data) throw new HttpsError("invalid-argument", "Datos de paso numeración requeridos.");

  const db = getFirestore();
  return completarPasoNumeracionOnboarding(db, data, {
    empresaId: empresa.id,
    actorId: request.auth!.uid,
    origen: "ADMIN",
    paisFiscal: empresa.paisFiscal ?? "CO",
  });
});
