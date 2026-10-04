import { getApps, initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";
import { ejecutarActualizarMembresiaBodegaV1 } from "../../functions/src/bodega-membership/handler";

if (!getApps().length) initializeApp();
export const actualizarMembresiaBodegaV1 = onCall({ region: "us-central1", invoker: "public" }, async (request) => ejecutarActualizarMembresiaBodegaV1(request));
