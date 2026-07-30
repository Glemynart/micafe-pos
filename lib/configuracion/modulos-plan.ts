import { MODULOS_CONFIGURACION, type ModuloConfiguracionId } from "./catalogos";

/**
 * Única proyección permitida de módulos iniciales: el catálogo B1 limita lo
 * soportado y el Plan limita lo contratado. La selección se mantiene
 * explícita para que ningún consumidor agregue capacidades silenciosamente.
 */
export function resolverModulosHabilitados(
  capacidadesPlan: readonly string[],
  seleccionInicial: readonly string[],
): ModuloConfiguracionId[] {
  const permitidosPorPlan = new Set(capacidadesPlan);
  return MODULOS_CONFIGURACION.filter(
    (modulo) => permitidosPorPlan.has(modulo) && seleccionInicial.includes(modulo),
  );
}
