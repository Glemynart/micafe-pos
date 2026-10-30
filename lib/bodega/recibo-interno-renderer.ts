import { formatFecha, formatMoney } from "@/lib/tickets/format";
import { DEFAULT_RENDER_OPTIONS, type RenderOptions } from "@/lib/tickets/render-options";
import type { ReciboInternoVentaBodega } from "@/lib/bodega/recibo-interno";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));

export function renderReciboInternoVentaBodega(
  recibo: ReciboInternoVentaBodega,
  estadoVenta: string | null | undefined,
  options: RenderOptions = DEFAULT_RENDER_OPTIONS,
): string {
  const { fecha, hora } = formatFecha(recibo.fechaConfirmacionIso, options);
  const money = (value: number) => escapeHtml(formatMoney(value, options));
  const anulada = estadoVenta?.toLocaleLowerCase("es") === "anulada";
  const items = recibo.lineas.map(linea => `
    <tr>
      <td class="item">
        <strong>${escapeHtml(linea.nombreProducto)}</strong><br>
        <span>${escapeHtml(linea.nombrePresentacion)} · ${linea.cantidad} × ${money(linea.precioUnitarioCOP)}</span>
      </td>
      <td class="amount">${money(linea.subtotalCOP)}</td>
    </tr>`).join("");

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recibo ${escapeHtml(recibo.folioInterno)}</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-size:${options.fuenteBasePx}px;line-height:1.4;color:#111;width:${options.anchoCuerpoPx}px;padding:8px}
    .center{text-align:center}.brand{font-size:${options.fuenteBasePx + 2}px;font-weight:700}.title{font-size:${options.fuenteBasePx + 1}px;font-weight:700;margin:10px 0 2px}.disclaimer{font-size:${options.fuenteBasePx - 2}px}.rule{border-top:1px dashed #333;margin:10px 0}.row{display:flex;justify-content:space-between;gap:8px;margin:4px 0}.label{color:#444}table{width:100%;border-collapse:collapse;margin:8px 0}td{vertical-align:top;padding:6px 0;border-bottom:1px solid #ddd}.item{padding-right:5px}.item span{font-size:${options.fuenteBasePx - 1}px}.amount{text-align:right;white-space:nowrap;font-weight:600}.total{font-size:${options.fuenteBasePx + 2}px;font-weight:700;border-top:1px dashed #333;padding-top:8px}.status{margin:8px 0;padding:7px;border:1px solid #777;text-align:center;font-weight:700}.cancelled{border:2px solid #a00;color:#a00;font-weight:700;text-align:center;padding:6px;margin:8px 0}
    @page{margin:0} @media print{html,body{margin:0!important;padding:0!important}body{padding:8px!important}}
  </style></head><body>
    <header class="center">
      ${recibo.nombreComercialSnapshot ? `<div class="brand">${escapeHtml(recibo.nombreComercialSnapshot)}</div>` : ""}
      <div class="title">RECIBO INTERNO DE VENTA</div>
      <div class="disclaimer">No es factura electrónica ni documento fiscal.</div>
    </header>
    <div class="rule"></div>
    <div class="row"><span class="label">Consecutivo</span><strong>${escapeHtml(recibo.folioInterno)}</strong></div>
    <div class="row"><span class="label">Fecha</span><span>${escapeHtml(fecha)} ${escapeHtml(hora)}</span></div>
    <div class="row"><span class="label">Cliente</span><strong>${escapeHtml(recibo.cliente.nombre)}</strong></div>
    ${anulada ? '<div class="cancelled">VENTA ANULADA</div>' : ""}
    <div class="rule"></div>
    <table aria-label="Productos vendidos"><tbody>${items}</tbody></table>
    ${recibo.descuentoCOP > 0 ? `<div class="row"><span class="label">Descuentos y ofertas</span><span>−${money(recibo.descuentoCOP)}</span></div>` : ""}
    <div class="row total"><span>TOTAL</span><span>${money(recibo.totalCOP)}</span></div>
    <div class="rule"></div>
    <div class="row"><span class="label">Forma de pago</span><span>${recibo.metodoPago === "cuenta_cobro" ? "Crédito" : escapeHtml(recibo.metodoPago)}</span></div>
    <div class="status">${recibo.estadoPagoInicial === "PENDIENTE" ? "PENDIENTE DE PAGO" : "PAGADA"}</div>
    ${recibo.estadoPagoInicial === "PENDIENTE" ? `<div class="row"><strong>Saldo inicial pendiente</strong><strong>${money(recibo.saldoInicialCOP)}</strong></div>` : ""}
    ${recibo.montoRecibidoCOP !== null ? `<div class="row"><span class="label">Recibido</span><span>${money(recibo.montoRecibidoCOP)}</span></div>` : ""}
    ${recibo.cambioCOP !== null ? `<div class="row"><span class="label">Cambio</span><span>${money(recibo.cambioCOP)}</span></div>` : ""}
    <div class="rule"></div><p class="center">Documento interno para constancia de entrega.</p>
  </body></html>`;
}
