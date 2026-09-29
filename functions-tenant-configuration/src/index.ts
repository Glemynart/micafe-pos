import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import { obtenerConfiguracionEmpresa as leerConfiguracionTenant } from "../../functions/src/tenant-configuration/shared";

if (!getApps().length) initializeApp();

/** Adapter aislado de lectura tenant-aware; no declara Secrets. */
export const obtenerConfiguracionEmpresa = onCall(
  { region: "us-central1" },
  async (request) => leerConfiguracionTenant(request, getFirestore()),
);
