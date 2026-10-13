import { getApps, initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";
import { ejecutarRegistrarPerfilComercialBodegaV1 } from "../../functions/src/tenant-profile/handler";

if (!getApps().length) initializeApp();

export const registrarPerfilComercialBodegaV1 = onCall(
  { region: "us-central1", invoker: "public" },
  async (request) => ejecutarRegistrarPerfilComercialBodegaV1(request),
);
