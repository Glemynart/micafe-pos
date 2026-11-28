import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { tramitarReclamoPrivacidad } from "../../functions/src/legal/privacy-claims";
import { tramitarConsultaPrivacidad } from "../../functions/src/legal/privacy-inquiries";
import { obtenerCuentaRuntimeLegal } from "./runtime-identity";
import {
  aceptarDocumentosLegalesTenant as ejecutarAceptarDocumentosLegalesTenant,
  consultarEstadoLegalTenant as ejecutarConsultarEstadoLegalTenant,
} from "../../functions/src/legal/handler";
import { createContactExportManager } from "./contact-export-manager";

if (!getApps().length) initializeApp();

const serviceAccount = obtenerCuentaRuntimeLegal(process.env.GCLOUD_PROJECT);

export const consultarEstadoLegalTenant = onCall(
  { region: "us-central1", invoker: "public", serviceAccount },
  async (request) => ejecutarConsultarEstadoLegalTenant(request),
);

export const aceptarDocumentosLegalesTenant = onCall(
  { region: "us-central1", invoker: "public", serviceAccount },
  async (request) => ejecutarAceptarDocumentosLegalesTenant(request),
);

export const tramitarReclamoPrivacidadSaas = onCall(
  { region: "us-central1", invoker: "public", serviceAccount },
  async (request) => {
    const bearer = request.rawRequest.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!request.auth || !bearer) throw new HttpsError("unauthenticated", "Autenticación requerida.");
    const token = await getAuth().verifyIdToken(bearer, true).catch(() => {
      throw new HttpsError("unauthenticated", "Autenticación requerida.");
    });
    if (token.uid !== request.auth.uid) throw new HttpsError("unauthenticated", "Autenticación requerida.");
    return tramitarReclamoPrivacidad(getFirestore(), { uid: token.uid, token: { saas: token.saas } }, request.data);
  },
);

export const tramitarConsultaPrivacidadSaas = onCall(
  { region: "us-central1", invoker: "public", serviceAccount },
  async (request) => {
    const bearer = request.rawRequest.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!request.auth || !bearer) throw new HttpsError("unauthenticated", "Autenticación requerida.");
    const token = await getAuth().verifyIdToken(bearer, true).catch(() => {
      throw new HttpsError("unauthenticated", "Autenticación requerida.");
    });
    if (token.uid !== request.auth.uid) throw new HttpsError("unauthenticated", "Autenticación requerida.");
    return tramitarConsultaPrivacidad(getFirestore(), { uid: token.uid, token: { saas: token.saas } }, request.data);
  },
);

export const administrarContactoExportacionSaas = onCall(
  { region: "us-central1", invoker: "public", serviceAccount },
  async (request) => {
    const bearer = request.rawRequest.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!request.auth || !bearer) throw new HttpsError("unauthenticated", "Autenticación requerida.");
    const token = await getAuth().verifyIdToken(bearer, true).catch(() => {
      throw new HttpsError("unauthenticated", "Autenticación requerida.");
    });
    if (token.uid !== request.auth.uid) throw new HttpsError("unauthenticated", "Autenticación requerida.");
    const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
    if (!projectId) throw new HttpsError("failed-precondition", "CONTACTO_EXPORTACION_NO_DISPONIBLE");
    const syntheticEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST) && projectId.startsWith("demo-");
    const manager = createContactExportManager({
      db: getFirestore(), projectId, allowSyntheticWrites: syntheticEmulator,
    });
    return manager.handle({ uid: token.uid, token: { saas: token.saas } }, request.data);
  },
);
