import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { autorizarPlataforma, type TokenPlataforma } from "../../functions/src/platform/authorization";
import type { EnvelopePlataforma } from "../../functions/src/platform/contracts";
import { obtenerDetalleEmpresaPlataforma } from "../../functions/src/platform/tenant-access-detail";
import { reemitirCredencialInicialTemporalTenant } from "../../functions/src/platform/tenant-access-reemision";

if (!getApps().length) initializeApp();

const REGION = "us-central1";
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");

function exigirAuth(request: { auth?: { uid: string; token: Record<string, unknown> } | null }) {
  if (!request.auth) throw new HttpsError("unauthenticated", "AUTH_REQUIRED");
  return request.auth;
}

export const obtenerDetalleEmpresaPlataformaSaas = onCall({ region: REGION }, async (request) => {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token as TokenPlataforma, "PLATAFORMA_CONSULTAR");
  const data = request.data as { empresaId?: unknown };
  if (typeof data?.empresaId !== "string") throw new HttpsError("invalid-argument", "EMPRESA_ID_INVALIDO");
  return obtenerDetalleEmpresaPlataforma(db, data.empresaId);
});

export const reemitirCredencialInicialTemporalSaas = onCall({ region: REGION, secrets: [PIN_PEPPER] }, async (request) => {
  const auth = exigirAuth(request);
  const db = getFirestore();
  await autorizarPlataforma(db, auth.uid, auth.token as TokenPlataforma, "LIFECYCLE_GOBERNAR");
  const data = request.data as (EnvelopePlataforma & { empresaId?: unknown; incorporacionId?: unknown }) | undefined;
  if (!data || typeof data.empresaId !== "string") throw new HttpsError("invalid-argument", "EMPRESA_ID_INVALIDO");
  if (typeof data.incorporacionId !== "string" || !data.incorporacionId.trim()) {
    throw new HttpsError("invalid-argument", "INCORPORACION_ID_INVALIDO");
  }
  return reemitirCredencialInicialTemporalTenant(
    db,
    auth.uid,
    data as EnvelopePlataforma & { empresaId: string; incorporacionId: string },
    auth.token as TokenPlataforma,
    (uid) => getAuth().getUser(uid),
    PIN_PEPPER.value(),
  );
});
