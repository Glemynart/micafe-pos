import { getApps, initializeApp } from "firebase-admin/app";

if (!getApps().length) initializeApp();

export { ejecutarComandoComercialSaas } from "../../functions/src/platform/commercial-callable";
export { consultarOfertaComercialTenantSaas } from "../../functions/src/platform/commercial-callable";
