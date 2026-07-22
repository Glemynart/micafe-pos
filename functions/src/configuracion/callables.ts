import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { exigirAdminTenant, exigirTenantActivo } from "../operational-auth";
import { ejecutarComandoConfiguracion, leerConfiguracionEmpresa, type EntradaComandoConfiguracion } from "./service";
const REGION = "us-central1";
function callable(comando: EntradaComandoConfiguracion["comando"]) { return onCall({ region: REGION }, async (request) => { const empresa = await exigirAdminTenant(request); const data = request.data as Omit<EntradaComandoConfiguracion, "comando">; return ejecutarComandoConfiguracion(getFirestore(), { ...data, comando }, { empresaId: empresa.id, actorId: request.auth!.uid, origen: "ADMIN", paisFiscal: "CO" }); }); }
export const actualizarConfiguracionEmpresa = callable("ActualizarConfiguracionEmpresa");
export const actualizarParametrosFiscales = callable("ActualizarParametrosFiscales");
export const actualizarPreferenciasImpresion = callable("ActualizarPreferenciasImpresion");
export const actualizarPoliticasOperativas = callable("ActualizarPoliticasOperativas");
export const obtenerConfiguracionEmpresa = onCall({ region: REGION }, async (request) => {
  const empresa = await exigirTenantActivo(request);
  return leerConfiguracionEmpresa(getFirestore(), empresa.id);
});
