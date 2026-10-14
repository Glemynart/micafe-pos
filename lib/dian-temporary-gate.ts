const EMPRESAS_CON_DIAN_PAUSADA = new Set([
  "1ae0rD9H8t3ZFSBKrrHR",
  "Prueba",
]);

export const MENSAJE_DIAN_TEMPORALMENTE_INDISPONIBLE =
  "La facturación electrónica está temporalmente deshabilitada para esta empresa. Ventas, inventario y caja siguen disponibles.";

export const MENSAJE_EMPRESA_DIAN_NO_RESUELTA =
  "No se pudo verificar la empresa activa. Actualiza el panel antes de emitir a DIAN.";

export type ResultadoAccionDian<T> =
  | { estado: "indisponible" }
  | { estado: "empresa_no_resuelta" }
  | { estado: "ejecutada"; valor: T };

/**
 * Bloqueo temporal aprobado por ADR-SAAS-079. Mantener la comparación exacta
 * por tenant; retirar solo después de migrar y verificar la emisión fiscal
 * server-side mediante un cambio aprobado.
 */
export async function ejecutarAccionDianConDisponibilidad<T>(
  empresaId: string | null | undefined,
  accion: () => Promise<T>,
): Promise<ResultadoAccionDian<T>> {
  if (!empresaId) return { estado: "empresa_no_resuelta" };
  if (EMPRESAS_CON_DIAN_PAUSADA.has(empresaId)) return { estado: "indisponible" };

  return { estado: "ejecutada", valor: await accion() };
}
