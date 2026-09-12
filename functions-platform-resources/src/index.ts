import { getApps, initializeApp } from "firebase-admin/app";

if (!getApps().length) initializeApp();

export { listarRecursosPlataformaSaas } from "../../functions/src/platform/platform-resources-callable";
