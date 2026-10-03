import { getApps, initializeApp } from "firebase-admin/app";

if (!getApps().length) initializeApp();

export { listarRecursosPlataformaSaas } from "../../functions/src/platform/platform-resources-callable";
export { consultarAuditoriaPlataformaSaas } from "../../functions/src/platform/platform-audit-callable";
