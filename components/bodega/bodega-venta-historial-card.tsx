import { formatearFechaBodega, formatearReferenciaSolicitud, type VentaVendedorDTO } from "@/lib/bodega/ui-contract"

const money = (value: number | null) => value === null
  ? "—"
  : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)

export function BodegaVentaHistorialCard({ venta }: { venta: VentaVendedorDTO }) {
  return <article className="bodega-seller-panel bodega-history-card">
    <div className="bodega-history-top">
      <div className="bodega-history-customer">
        <p className="bodega-history-eyebrow">Venta registrada</p>
        <h2>{venta.cliente || "Cliente"}</h2>
      </div>
      <strong className="bodega-history-amount">{money(venta.total)}</strong>
    </div>
    <div className="bodega-history-meta">
      <span className="bodega-seller-pill">{venta.metodoPago || "Pago no disponible"}</span>
      {venta.metodoPago === "efectivo" && venta.turnoId === null && <span className="bodega-seller-pill">efectivo sin turno</span>}
      <time>{formatearFechaBodega(venta.fecha)}</time>
    </div>
    {venta.metodoPago === "efectivo" && venta.montoRecibidoCOP !== null && <p className="bodega-history-cash">Recibido {money(venta.montoRecibidoCOP)} <span>·</span> Cambio {money(venta.cambioCOP)}</p>}
    <details className="bodega-history-reference">
      <summary>Ref. {formatearReferenciaSolicitud(venta.id)}</summary>
      <code>{venta.id}</code>
    </details>
  </article>
}
