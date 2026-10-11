import { resolverCallableCompra } from "./bodega/compra-routing";
import type { VerticalTenant } from "./configuracion/contrato";

export interface CompraCommandParams {
  proveedor: string;
  proveedorId?: string;
  items: Array<{
    tipo?: "insumo" | "producto";
    insumoId?: string;
    itemId?: string;
    cantidad: number;
    costoUnitario: number;
  }>;
  espacioId: string;
  cuentaClaveOperativa?: string;
  fechaCompra?: string;
}

export interface ComandoCompraPendiente {
  huella: string;
  commandId: string;
}

export function construirPayloadCompra(params: CompraCommandParams): Record<string, unknown> {
  return {
    proveedor: params.proveedor,
    ...(params.proveedorId ? { proveedorId: params.proveedorId } : {}),
    espacioId: params.espacioId,
    fechaCompra: params.fechaCompra ?? null,
    ...(params.cuentaClaveOperativa ? { cuentaClaveOperativa: params.cuentaClaveOperativa } : {}),
    items: params.items.map(item => ({
      tipo: item.tipo ?? "insumo",
      articuloId: item.itemId ?? item.insumoId,
      cantidad: item.cantidad,
      costoUnitario: item.costoUnitario,
    })),
  };
}

function huellaIntencionCompra(params: CompraCommandParams, vertical?: VerticalTenant | null): string {
  return JSON.stringify({
    tipo: resolverCallableCompra(vertical),
    causationId: null,
    motivo: "compra_proveedor",
    payload: construirPayloadCompra(params),
  });
}

export function obtenerComandoCompraPendiente(
  params: CompraCommandParams,
  vertical: VerticalTenant | null | undefined,
  pendiente?: ComandoCompraPendiente | null,
  crearUuid: () => string = () => crypto.randomUUID(),
): ComandoCompraPendiente {
  const huella = huellaIntencionCompra(params, vertical);
  if (pendiente?.huella === huella) return pendiente;
  return { huella, commandId: `compra:${crearUuid()}` };
}
