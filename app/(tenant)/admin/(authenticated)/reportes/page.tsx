"use client"

import { useState, useEffect, useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Loader2, BarChart3, TrendingUp, DollarSign, ShoppingCart, Users, Package, ChevronDown, ChevronUp, FileBarChart2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/demo-data"
import { generarReporteVentas, obtenerRangoFechas, type ReporteVentas } from "@/lib/reportes-service"
import { suscribirUsuarios, type Usuario } from "@/lib/permisos-service"
import { crearIndiceNombres } from "@/lib/actor-display"
import { resolverNombreVisibleVendedor } from "@/lib/reportes-vendedores"
import { useAuthContext } from "@/contexts/auth-context"
import { useConfiguracionEmpresa } from "@/contexts/configuracion-empresa-context"
import { useModulosHabilitados } from "@/contexts/modulos-context"
import { BodegaReportesAdmin } from "@/components/bodega/bodega-financial-report"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

const DIANA_EMPRESA_ID = "distribuidora-las-jimenez"

const periodos = [
  { key: "today", label: "Hoy" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
]

export default function ReportesPage() {
  const { usuario } = useAuthContext()
  const { empresaId, estado, vertical, revision, proyecciones, ejecutar } = useConfiguracionEmpresa()
  const { modulos } = useModulosHabilitados()
  if (estado !== "LISTA") return <p role="status" className="p-6 text-sm text-muted-foreground">Verificando la configuración del negocio…</p>
  if (vertical === "BODEGA_MVP1") {
    if (usuario?.rol !== "admin") return <p role="alert" className="p-6 text-sm">Reportes reservados a la administración de Bodega.</p>
    if (!modulos.includes("reports")) {
      if (empresaId === DIANA_EMPRESA_ID) {
        return <HabilitarReportesDiana
          revision={revision}
          modulos={proyecciones?.modulos.habilitados ?? []}
          ejecutar={ejecutar}
        />
      }
      return <p role="alert" className="p-6 text-sm">El módulo de reportes no está habilitado para este negocio.</p>
    }
    return <BodegaReportesAdmin />
  }
  return <LegacyReportesPage />
}

function HabilitarReportesDiana({
  revision,
  modulos,
  ejecutar,
}: {
  revision: number | null
  modulos: string[]
  ejecutar: ReturnType<typeof useConfiguracionEmpresa>["ejecutar"]
}) {
  const [guardando, setGuardando] = useState(false)

  async function habilitar() {
    if (revision === null) {
      toast.error("No se pudo leer la revisión actual de configuración.")
      return
    }
    setGuardando(true)
    const nonce = globalThis.crypto.randomUUID().replaceAll("-", "")
    try {
      await ejecutar("actualizarConfiguracionEmpresa", {
        expectedRevision: revision,
        idempotencyKey: `idem_reports_${nonce}`,
        commandId: `cmd_reports_${nonce}`,
        correlationId: `corr_reports_${nonce}`,
        motivo: "HABILITAR_REPORTES_OPERATIVOS_Diana",
        operaciones: [{
          tipo: "SET",
          ruta: "modulos.habilitados",
          valor: [...new Set([...modulos, "reports"])],
        }],
      })
      toast.success("Reportes habilitados para este negocio.")
    } catch {
      toast.error("No se pudo habilitar. La capacidad debe estar concedida y la configuración vigente.")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm" aria-labelledby="reports-setup-title">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileBarChart2 className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reportes del negocio</p>
          <h1 id="reports-setup-title" className="mt-1 text-xl font-semibold">Activar reportes operativos</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Después de que plataforma conceda la capacidad, la administración puede activar este módulo de solo lectura. La activación se valida contra el contrato vigente de Distribuidora Las Jiménez; no cambia el plan, el precio ni el plazo.</p>
          <Button className="mt-5" onClick={() => void habilitar()} disabled={guardando || revision === null}>
            {guardando && <Loader2 className="mr-2 size-4 animate-spin" />}
            Habilitar reportes
          </Button>
        </div>
      </div>
    </section>
  )
}

function LegacyReportesPage() {
  const [periodo, setPeriodo] = useState("today")
  const [reporte, setReporte] = useState<ReporteVentas | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(false)
  const [expandirVendedores, setExpandirVendedores] = useState(true)
  const [expandirProductos, setExpandirProductos] = useState(false)
  const [expandirTiempo, setExpandirTiempo] = useState(false)

  useEffect(() => { cargarReporte() }, [periodo])
  useEffect(() => suscribirUsuarios(setUsuarios), [])

  const nombres = useMemo(() => crearIndiceNombres(usuarios), [usuarios])

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
                        <span className="text-sm font-semibold text-foreground">{resolverNombreVisibleVendedor(v.id, v.nombre, nombres)}</span>
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
                        v.diferenciaCaja === null
                          ? "bg-muted/20 border border-border/50"
                          : v.diferenciaCaja < 0
                            ? "bg-red-500/10 border border-red-500/30"
                            : v.diferenciaCaja > 0
                              ? "bg-amber-500/10 border border-amber-500/30"
                              : "bg-emerald-500/10 border border-emerald-500/30"
                      )}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cuadre de caja</span>
                          <span className={cn(
                            "text-xs font-black tabular-nums",
                            v.diferenciaCaja === null
                              ? "text-muted-foreground"
                              : v.diferenciaCaja < 0
                                ? "text-red-400"
                                : v.diferenciaCaja > 0
                                  ? "text-amber-400"
                                  : "text-emerald-400"
                          )}>
                            {v.diferenciaCaja === null
                              ? "Sin cierre conciliable"
                              : v.diferenciaCaja === 0
                                ? "Cuadrado"
                                : `${v.diferenciaCaja < 0 ? "Faltante" : "Sobrante"} ${formatCurrency(Math.abs(v.diferenciaCaja))}`}
                          </span>
                        </div>
                        {v.diferenciaCaja === null ? (
                          <p className="text-[11px] text-muted-foreground/70">No hay turnos cerrados conciliables en este período.</p>
                        ) : (
                          <div className="flex items-center gap-3 text-[11px]">
                            <span className="text-muted-foreground/70">Esperado: <strong className="text-muted-foreground/80">{formatCurrency(v.efectivoEsperado ?? 0)}</strong></span>
                            <span className="text-muted-foreground/70">Contado: <strong className="text-muted-foreground/80">{formatCurrency(v.efectivoDeclarado ?? 0)}</strong></span>
                          </div>
                        )}
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
