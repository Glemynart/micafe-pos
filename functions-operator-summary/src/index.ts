import { getApps, initializeApp } from "firebase-admin/app";

if (!getApps().length) initializeApp();

export { obtenerResumenOperadorSaas } from "../../functions/src/platform/operator-summary-callable";
