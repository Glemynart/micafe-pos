import { getApps, initializeApp } from "firebase-admin/app";

if (!getApps().length) initializeApp();

export { consultarContextoPlataforma } from "../../functions/src/platform/context-callable";
