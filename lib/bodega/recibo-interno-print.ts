import { imprimirTicketHtml, resolverOpcionesImpresion } from "@/lib/tickets";
import type { ReciboInternoVentaBodega } from "@/lib/bodega/recibo-interno";
import { renderReciboInternoVentaBodega } from "@/lib/bodega/recibo-interno-renderer";

/** Impresión y reimpresión son una representación de solo lectura del snapshot. */
export function imprimirReciboInternoVentaBodega(recibo: ReciboInternoVentaBodega, estadoVenta?: string | null) {
  return imprimirTicketHtml(renderReciboInternoVentaBodega(recibo, estadoVenta, resolverOpcionesImpresion()));
}
