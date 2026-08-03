import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { exigirAdminTenant, exigirTenantActivo } from "../operational-auth";
import { METODOS_PAGO_CONFIGURACION } from "../../../lib/configuracion/catalogos";
import { ejecutarComandoConfiguracion, leerConfiguracionEmpresa, type EntradaComandoConfiguracion } from "./service";
import { resolverModulosInicialesDelPlan } from "./capacidades-plan";
const REGION = "us-central1";

function requiereCapacidadesPlan(operaciones: unknown): boolean {
  if (!Array.isArray(operaciones)) return false;
  return operaciones.some((operacion) => {
    if (!operacion || typeof operacion !== "object") return false;
    const ruta = (operacion as { ruta?: unknown }).ruta;
    return ruta === "modulos.habilitados" || ruta === "pos.metodosPagoHabilitados";
  });
}

async function contextoCapacidadesPlan(db: ReturnType<typeof getFirestore>, empresaId: string, operaciones: unknown) {
  if (!requiereCapacidadesPlan(operaciones)) return {};
  return {
    modulosPermitidos: await resolverModulosInicialesDelPlan(db, empresaId),
    metodosPagoPermitidos: [...METODOS_PAGO_CONFIGURACION],
  };
}

function callable(comando: EntradaComandoConfiguracion["comando"]) {
  return onCall({ region: REGION }, async (request) => {
    const empresa = await exigirAdminTenant(request);
    const data = request.data as Omit<EntradaComandoConfiguracion, "comando">;
    const db = getFirestore();
    const capacidades = await contextoCapacidadesPlan(db, empresa.id, data.operaciones);
    return ejecutarComandoConfiguracion(db, { ...data, comando }, {
      empresaId: empresa.id,
      actorId: request.auth!.uid,
      origen: "ADMIN",
      paisFiscal: "CO",
      ...capacidades,
    });
  });
}
export const actualizarConfiguracionEmpresa = callable("ActualizarConfiguracionEmpresa");
export const actualizarParametrosFiscales = callable("ActualizarParametrosFiscales");
export const actualizarPreferenciasImpresion = callable("ActualizarPreferenciasImpresion");
export const actualizarPoliticasOperativas = callable("ActualizarPoliticasOperativas");
export const obtenerConfiguracionEmpresa = onCall({ region: REGION }, async (request) => {
  const empresa = await exigirTenantActivo(request);
  return leerConfiguracionEmpresa(getFirestore(), empresa.id);
});
