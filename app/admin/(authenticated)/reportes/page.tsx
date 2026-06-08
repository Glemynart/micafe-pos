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
  const [periodo, setPeriodo] = useState("month")
  const [reporte, setReporte] = useState<ReporteVentas | null>(null)
  const [cargando, setCargando] = useState(false)
  const [expandirVendedores, setExpandirVendedores] = useState(false)
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
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-100 bg-white">
        <h1 className="text-xl font-bold text-slate-900">Reportes</h1>
        <p className="text-xs text-slate-400 mt-0.5">Análisis de ventas y rentabilidad</p>
      </div>

      {/* Period Selector */}
      <div className="px-4 pt-4 pb-2 bg-white border-b border-slate-100">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {periodos.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={cn(
                "flex-1 py-1.5 rounded-md text-sm font-semibold transition-all",
                periodo === p.key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!reporte ? (
        <div className="px-4 pt-6 text-center text-sm text-slate-400">No hay datos para este periodo</div>
      ) : (
        <div className="px-4 pt-4 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tituloRango}</p>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { l: "Ventas totales", v: formatCurrency(reporte.ventasTotales), i: DollarSign, accent: "text-emerald-700", bg: "bg-emerald-50", bar: "bg-emerald-500" },
              { l: "Ganancia bruta", v: formatCurrency(reporte.gananciaBruta), i: TrendingUp, accent: "text-blue-700", bg: "bg-blue-50", bar: "bg-blue-500" },
              { l: "Margen bruto", v: `${reporte.margenBruto.toFixed(1)}%`, i: BarChart3, accent: "text-violet-700", bg: "bg-violet-50", bar: "bg-violet-500" },
              { l: "Costo total", v: formatCurrency(reporte.costoTotal), i: ShoppingCart, accent: "text-slate-700", bg: "bg-slate-100", bar: "bg-slate-500" },
            ].map(kpi => {
              const Icon = kpi.i
              return (
                <div key={kpi.l} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{kpi.l}</span>
                    <Icon className={`h-3.5 w-3.5 ${kpi.accent}`} />
                  </div>
                  <p className="text-base font-bold text-slate-900 tabular-nums">{kpi.v}</p>
                  <div className={`mt-2 h-0.5 w-8 ${kpi.bar} rounded-full opacity-50`} />
                </div>
              )
            })}
          </div>

          {/* Top Productos */}
          {reporte.topProductos.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-sm font-semibold text-slate-700">Top Productos</span>
              </div>
              <div className="divide-y divide-slate-100">
                {reporte.topProductos.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-bold text-slate-300 w-4 shrink-0">#{i + 1}</span>
                      <span className="text-sm text-slate-700 truncate">{p.name}</span>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatCurrency(p.revenue)}</p>
                      <p className="text-[10px] text-slate-400">{p.sold} uds</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Por Vendedor */}
          {reporte.ventasPorVendedor.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandirVendedores(!expandirVendedores)}
                className="w-full px-4 py-3 flex items-center justify-between border-b border-slate-100 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700">Por Vendedor</span>
                </div>
                {expandirVendedores ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </button>
              {expandirVendedores && (
                <div className="divide-y divide-slate-100">
                  {reporte.ventasPorVendedor.map(v => (
                    <div key={v.id} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-800">{v.nombre}</span>
                        <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatCurrency(v.total)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                        <span>{v.ventas} ventas</span>
                        <span>·</span>
                        <span>Prom {formatCurrency(v.average)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Rentabilidad */}
          {reporte.rentabilidadProductos.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandirProductos(!expandirProductos)}
                className="w-full px-4 py-3 flex items-center justify-between border-b border-slate-100 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700">Rentabilidad</span>
                </div>
                {expandirProductos ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </button>
              {expandirProductos && (
                <div className="divide-y divide-slate-100">
                  {reporte.rentabilidadProductos.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-3">
                      <div className="min-w-0 mr-3">
                        <p className="text-sm text-slate-700 truncate">{p.name}</p>
                        <p className="text-[11px] text-slate-400">{p.unitsSold} uds</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatCurrency(p.profit)}</p>
                        <Badge className={cn(
                          "text-[10px] font-semibold border-0 mt-0.5",
                          p.marginPercent >= 30 ? "bg-emerald-50 text-emerald-700" : p.marginPercent >= 10 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
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
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandirTiempo(!expandirTiempo)}
                className="w-full px-4 py-3 flex items-center justify-between border-b border-slate-100 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-700">Tendencia de ventas</span>
                </div>
                {expandirTiempo ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
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
                            className="w-full bg-amber-500 rounded-sm opacity-80 hover:opacity-100 transition-opacity"
                            style={{ height: `${Math.max(pct, 3)}%` }}
                          />
                          <span className="text-[8px] text-slate-400 truncate w-full text-center">{d.fecha}</span>
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
