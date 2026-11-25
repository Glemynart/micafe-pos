import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { tramitarReclamoPrivacidad } from "../../functions/src/legal/privacy-claims";
import { tramitarConsultaPrivacidad } from "../../functions/src/legal/privacy-inquiries";
import {
  aceptarDocumentosLegalesTenant as ejecutarAceptarDocumentosLegalesTenant,
  consultarEstadoLegalTenant as ejecutarConsultarEstadoLegalTenant,
} from "../../functions/src/legal/handler";

if (!getApps().length) initializeApp();

export const consultarEstadoLegalTenant = onCall(
  { region: "us-central1", invoker: "public" },
  async (request) => ejecutarConsultarEstadoLegalTenant(request),
);

export const aceptarDocumentosLegalesTenant = onCall(
  { region: "us-central1", invoker: "public" },
  async (request) => ejecutarAceptarDocumentosLegalesTenant(request),
);

export const tramitarReclamoPrivacidadSaas = onCall(
  { region: "us-central1", invoker: "public" },
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
  { region: "us-central1", invoker: "public" },
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
