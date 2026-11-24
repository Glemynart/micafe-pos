import { getApps, initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";
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
