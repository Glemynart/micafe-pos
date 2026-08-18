"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Loader2, BarChart3, TrendingUp, DollarSign, ShoppingCart, Users, Package, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/demo-data"
import { generarReporteVentas, obtenerRangoFechas, type ReporteVentas } from "@/lib/reportes-service"

const periodos = [
  { key: "today", label: "Hoy" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
]

export default function ReportesPage() {
  const [periodo, setPeriodo] = useState("today")
  const [reporte, setReporte] = useState<ReporteVentas | null>(null)
  const [cargando, setCargando] = useState(false)
  const [expandirVendedores, setExpandirVendedores] = useState(true)
  const [expandirProductos, setExpandirProductos] = useState(false)
  const [expandirTiempo, setExpandirTiempo] = useState(false)

  useEffect(() => { cargarReporte() }, [periodo])

  const cargarReporte = async () => {
    setCargando(true)
    try {
      const r = await generarReporteVentas(periodo)
      setReporte(r)
    } catch { setReporte(null) }
    finally { setCargando(false) }
  }

  const rango = obtenerRangoFechas(periodo)
  const tituloRango = periodo === "today"
    ? rango.inicio.toLocaleDateString("es-CO", { day: "numeric", month: "long" })
    : periodo === "week"
      ? `${rango.inicio.toLocaleDateString("es-CO", { day: "numeric" })} – ${rango.fin.toLocaleDateString("es-CO", { day: "numeric", month: "short" })}`
      : rango.inicio.toLocaleDateString("es-CO", { month: "long", year: "numeric" })

  if (cargando) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
    </div>
  )

  return (
    <div className="pb-4">
      <div className="px-4 pt-5 pb-4 border-b border-border/50">
        <h1 className="text-xl font-bold text-foreground">Reportes</h1>
        <p className="text-xs text-muted-foreground/70 mt-0.5">Analisis de ventas y rentabilidad</p>
      </div>

      <div className="px-4 pt-4 pb-2 border-b border-border/50">
        <div className="flex gap-1 bg-card/50 rounded-lg p-1">
          {periodos.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={cn(
                "flex-1 py-1.5 rounded-md text-sm font-semibold transition-all",
                periodo === p.key
                  ? "bg-muted/50 text-foreground shadow-sm"
                  : "text-muted-foreground/70 hover:text-muted-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!reporte ? (
        <div className="px-4 pt-6 text-center text-sm text-muted-foreground/70">No hay datos para este periodo</div>
      ) : (
        <div className="px-4 pt-4 space-y-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{tituloRango}</p>

          <div className="grid grid-cols-2 gap-2">
            {[
              { l: "Ventas totales", v: formatCurrency(reporte.ventasTotales), i: DollarSign, accent: "text-emerald-400", bg: "bg-emerald-500/15", bar: "bg-emerald-400" },
              { l: "Ganancia bruta", v: formatCurrency(reporte.gananciaBruta), i: TrendingUp, accent: "text-blue-400", bg: "bg-blue-500/15", bar: "bg-blue-400" },
              { l: "Margen bruto", v: `${reporte.margenBruto.toFixed(1)}%`, i: BarChart3, accent: "text-violet-400", bg: "bg-violet-500/15", bar: "bg-violet-400" },
              { l: "Costo total", v: formatCurrency(reporte.costoTotal), i: ShoppingCart, accent: "text-muted-foreground/80", bg: "bg-card/50", bar: "bg-muted" },
            ].map(kpi => {
              const Icon = kpi.i
              return (
                <div key={kpi.l} className="bg-card/50 border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">{kpi.l}</span>
                    <Icon className={`h-3.5 w-3.5 ${kpi.accent}`} />
                  </div>
                  <p className="text-base font-bold text-foreground tabular-nums">{kpi.v}</p>
                  <div className={`mt-2 h-0.5 w-8 ${kpi.bar} rounded-full opacity-50`} />
                </div>
              )
            })}
          </div>

          {reporte.topProductos.length > 0 && (
            <div className="bg-card/50 border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground/70">Top Productos</span>
              </div>
              <div className="divide-y divide-border/50">
                {reporte.topProductos.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-bold text-muted-foreground/50 w-4 shrink-0">#{i + 1}</span>
                      <span className="text-sm text-foreground/70 truncate">{p.name}</span>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(p.revenue)}</p>
                      <p className="text-[10px] text-muted-foreground/70">{p.sold} uds</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Por Vendedor */}
          {reporte.ventasPorVendedor.length > 0 && (
            <div className="bg-card/50 border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandirVendedores(!expandirVendedores)}
                className="w-full px-4 py-3 flex items-center justify-between border-b border-border/50 hover:bg-card/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground/70">Por Vendedor</span>
                </div>
                {expandirVendedores ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {expandirVendedores && (
                <div className="divide-y divide-border/50">
                  {reporte.ventasPorVendedor.map(v => (
                    <div key={v.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-foreground">{v.nombre}</span>
                        <div className="text-right">
                          <span className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(v.total)}</span>
                          <p className="text-[10px] text-muted-foreground/70">{v.ventas} ventas · Prom {formatCurrency(v.average)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div className="text-center bg-emerald-500/10 rounded-lg py-1.5 px-1">
                          <p className="text-[10px] text-emerald-300 font-medium">Efectivo</p>
                          <p className="text-xs font-bold text-emerald-200 tabular-nums">{formatCurrency(v.efectivo)}</p>
                        </div>
                        <div className="text-center bg-blue-500/10 rounded-lg py-1.5 px-1">
                          <p className="text-[10px] text-blue-300 font-medium">Transferencia</p>
                          <p className="text-xs font-bold text-blue-200 tabular-nums">{formatCurrency(v.transferencia)}</p>
                        </div>
                        <div className="text-center bg-amber-500/10 rounded-lg py-1.5 px-1">
                          <p className="text-[10px] text-amber-300 font-medium">Cta. Cobro</p>
                          <p className="text-xs font-bold text-amber-200 tabular-nums">{formatCurrency(v.cuentaCobro)}</p>
                        </div>
                      </div>
                      <div className={cn(
                        "rounded-lg p-2.5",
                        v.diferenciaCaja < -5000 ? "bg-red-500/10 border border-red-500/30" : v.diferenciaCaja < 0 ? "bg-amber-500/10 border border-amber-500/30" : "bg-emerald-500/10 border border-emerald-500/30"
                      )}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cuadre de Caja</span>
                          <span className={cn(
                            "text-xs font-black tabular-nums",
                            v.diferenciaCaja < 0 ? "text-red-400" : "text-emerald-400"
                          )}>
                            {v.diferenciaCaja < 0 ? "Faltante " : "Sobrante "}
                            {formatCurrency(Math.abs(v.diferenciaCaja))}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px]">
                          <span className="text-muted-foreground/70">Vendido: <strong className="text-muted-foreground/80">{formatCurrency(v.efectivo)}</strong></span>
                          <span className="text-muted-foreground/70">Declarado: <strong className="text-muted-foreground/80">{formatCurrency(v.efectivoDeclarado)}</strong></span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Rentabilidad */}
          {reporte.rentabilidadProductos.length > 0 && (
            <div className="bg-card/50 border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandirProductos(!expandirProductos)}
                className="w-full px-4 py-3 flex items-center justify-between border-b border-border/50 hover:bg-card/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground/70">Rentabilidad</span>
                </div>
                {expandirProductos ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {expandirProductos && (
                <div className="divide-y divide-border/50">
                  {reporte.rentabilidadProductos.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0 mr-3">
                        <p className="text-sm text-foreground/70 truncate">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground/70">{p.unitsSold} uds</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(p.profit)}</p>
                        <Badge className={cn(
                          "text-[10px] font-semibold border-0 mt-0.5",
                          p.marginPercent >= 30 ? "bg-emerald-500/20 text-emerald-300" : p.marginPercent >= 10 ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300"
                        )}>
                          {p.marginPercent.toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ventas en el Tiempo */}
          {reporte.ventasEnElTiempo.length > 0 && (
            <div className="bg-card/50 border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandirTiempo(!expandirTiempo)}
                className="w-full px-4 py-3 flex items-center justify-between border-b border-border/50 hover:bg-card/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground/70">Tendencia de ventas</span>
                </div>
                {expandirTiempo ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {expandirTiempo && (
                <div className="px-4 pb-4 pt-3">
                  <div className="flex items-end gap-1 h-28">
                    {reporte.ventasEnElTiempo.map((d, i) => {
                      const max = Math.max(...reporte.ventasEnElTiempo.map(x => x.sales), 1)
                      const pct = (d.sales / max) * 100
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                          <div
                            className="w-full bg-primary rounded-sm opacity-80 hover:opacity-100 transition-opacity"
                            style={{ height: `${Math.max(pct, 3)}%` }}
                          />
                          <span className="text-[8px] text-muted-foreground/70 truncate w-full text-center">{d.fecha}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
