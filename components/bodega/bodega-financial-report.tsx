"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, RefreshCw, CircleDollarSign, TrendingUp, Users, ShoppingBag } from "lucide-react"
import { useAuthContext } from "@/contexts/auth-context"
import { useConfiguracionEmpresa } from "@/contexts/configuracion-empresa-context"
import { suscribirUsuarios, type Usuario } from "@/lib/permisos-service"
import { calcularReporteBodega, csvReporteBodega, ordenarProductosReporte, type ProductoReporte } from "@/lib/bodega/financial-report"
import { leerReporteBodega, type DatosReporteBodega } from "@/lib/bodega/financial-report-service"

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n)
function mesActual() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit" }).formatToParts(new Date())
  return `${p.find(x => x.type === "year")?.value}-${p.find(x => x.type === "month")?.value}`
}

export function BodegaReportesAdmin() {
  const { usuario } = useAuthContext()
  const { empresaId } = useConfiguracionEmpresa()
  const [mes, setMes] = useState(mesActual)
  const [revision, setRevision] = useState(0)
  const [criterio, setCriterio] = useState<"ingreso" | "cantidad">("ingreso")
  const [unidadElegida, setUnidadElegida] = useState("")
  const [lectura, setLectura] = useState<{ key: string; datos?: DatosReporteBodega; error?: string } | null>(null)
  const [perfiles, setPerfiles] = useState<{ key: string; usuarios: Usuario[] } | null>(null)
  const scope = `${empresaId}:${usuario?.uid}`
  const key = `${scope}:${mes}:${revision}`

  useEffect(() => {
    if (!empresaId || !usuario?.uid || usuario.rol !== "admin") return
    let vigente = true
    void leerReporteBodega(mes).then(datos => {
      if (datos.empresaId !== empresaId || datos.uid !== usuario.uid) throw new Error("La sesión cambió. Vuelve a consultar el reporte.")
      if (vigente) setLectura({ key, datos })
    }).catch(error => { if (vigente) setLectura({ key, error: error instanceof Error ? error.message : "No se pudo consultar el reporte." }) })
    return () => { vigente = false }
  }, [empresaId, usuario?.uid, usuario?.rol, mes, key])

  useEffect(() => {
    if (!empresaId || usuario?.rol !== "admin") return
    return suscribirUsuarios(usuarios => setPerfiles({ key: scope, usuarios }))
  }, [empresaId, usuario?.uid, usuario?.rol, scope])

  const vista = useMemo(() => {
    if (lectura?.key !== key || !lectura.datos) return null
    try {
      const nombres = new Map((perfiles?.key === scope ? perfiles.usuarios : []).map(u => [u.uid, u.nombre]))
      return { reporte: calcularReporteBodega({ empresaId: lectura.datos.empresaId, mes, ventas: lectura.datos.ventas, productos: lectura.datos.productos, nombres }) }
    } catch (error) { return { error: error instanceof Error ? error.message : "Los datos no permiten construir un reporte fiable." } }
  }, [lectura, key, perfiles, scope, mes])
  const reporte = vista?.reporte
  const unidades = [...new Set(reporte?.productos.map(p => p.unidad) ?? [])].sort()
  const unidad = unidades.includes(unidadElegida) ? unidadElegida : unidades[0]
  const clasificacion = { criterio, unidad }
  const ranking = reporte && (criterio === "ingreso" || unidad) ? ordenarProductosReporte(reporte.productos, clasificacion) : []
  const menores = reporte && (criterio === "ingreso" || unidad) ? ordenarProductosReporte(reporte.productos, { ...clasificacion, ascendente: true }).slice(0,10) : []
  const error = lectura?.key === key ? lectura.error || vista?.error : undefined
  const cargando = lectura?.key !== key
  const descargar = () => {
    if (!reporte) return
    const url = URL.createObjectURL(new Blob([csvReporteBodega(reporte)], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a"); a.href = url; a.download = `dusema-ventas-${mes}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className="space-y-6" aria-label="Reportes del negocio">
    <header className="flex flex-col gap-4 @3xl:flex-row @3xl:items-end @3xl:justify-between">
      <div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary">Control del negocio</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Resumen financiero</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Ventas, medios de pago, vendedores y productos del mes. Consulta de solo lectura en horario de Colombia.</p></div>
      <div className="flex flex-wrap items-end gap-2"><label className="text-xs font-medium">Mes<input type="month" min="2020-01" max="2100-12" value={mes} onChange={e => { if (e.target.value) setMes(e.target.value) }} className="mt-1 block h-11 rounded-xl border border-border bg-card px-3 text-sm" /></label><button type="button" disabled={cargando} onClick={() => setRevision(v => v + 1)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-border bg-card px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><RefreshCw className={`size-4 ${cargando ? "animate-spin" : ""}`} />Actualizar</button></div>
    </header>
    {cargando && <p role="status" className="rounded-[16px] border border-border bg-card p-8 text-sm text-muted-foreground">Consultando registros del tenant…</p>}
    {error && <p role="alert" className="rounded-[16px] border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">{error}</p>}
    {!cargando && !error && reporte && <>
      <div className="grid gap-3 @xl:grid-cols-2 @4xl:grid-cols-4">
        <Metrica icon={CircleDollarSign} label="Ventas del mes" value={cop(reporte.ingresoCOP)} />
        <Metrica icon={TrendingUp} label="Utilidad bruta registrada" value={reporte.utilidadBrutaCOP === null ? "Sin determinar" : cop(reporte.utilidadBrutaCOP)} />
        <Metrica icon={ShoppingBag} label="Ventas pagadas" value={String(reporte.ventas)} />
        <Metrica icon={Users} label="Operadores con ventas" value={String(reporte.vendedores.length)} />
      </div>
      <div className="rounded-[16px] border border-border/70 bg-card p-5 text-sm leading-relaxed text-muted-foreground">
        <p>La utilidad bruta usa el costo histórico guardado al vender. No descuenta gastos del negocio ni determina renta o impuestos.</p>
        {reporte.lineasSinCosto > 0 && <p className="mt-2 text-amber-800 dark:text-amber-300">Hay {reporte.lineasSinCosto} líneas sin costo histórico válido. La utilidad del período queda sin determinar.</p>}
        {reporte.lineasCostoCero > 0 && <p className="mt-2 text-amber-800 dark:text-amber-300">{reporte.lineasCostoCero} líneas tienen costo registrado en cero. Revisa esos costos antes de interpretar la utilidad.</p>}
        <p className="mt-2">Se excluyen {reporte.anuladas} ventas anuladas. Los datos son operativos y no acreditan facturación fiscal.</p>
      </div>
      <div className="grid gap-5 @4xl:grid-cols-2">
        <section className="rounded-[16px] border border-border/70 bg-card p-5"><h2 className="text-lg font-semibold">Medios de pago</h2><p className="mt-1 text-xs text-muted-foreground">Valor de las ventas cobradas; el efectivo no incluye el cambio devuelto.</p><dl className="mt-5 divide-y divide-border/60">{Object.entries(reporte.pagos).map(([metodo,total]) => <div key={metodo} className="flex justify-between gap-4 py-3"><dt className="capitalize">{metodo}</dt><dd className="font-semibold tabular-nums">{cop(total)}</dd></div>)}</dl></section>
        <section className="rounded-[16px] border border-border/70 bg-card p-5"><h2 className="text-lg font-semibold">Ventas por operador</h2><p className="mt-1 text-xs text-muted-foreground">Vendedor que ejecutó la venta. Incluye ventas directas de administración.</p>{reporte.vendedores.length === 0 ? <Vacio /> : <div className="mt-5 divide-y divide-border/60">{reporte.vendedores.map(v => <div key={v.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-medium">{v.nombre}</p><p className="text-xs text-muted-foreground">{v.ventas} ventas</p></div><strong className="shrink-0 text-sm tabular-nums">{cop(v.ingresoCOP)}</strong></div>)}</div>}</section>
      </div>
      <section className="space-y-4"><div className="flex flex-wrap items-end justify-between gap-4"><h2 className="text-xl font-semibold">Productos del mes</h2><div className="flex flex-wrap gap-3"><label className="text-xs font-medium">Clasificar por<select value={criterio} onChange={e => setCriterio(e.target.value as "ingreso" | "cantidad")} className="mt-1 block h-11 rounded-xl border border-border bg-card px-3 text-sm"><option value="ingreso">Ingresos COP</option><option value="cantidad">Cantidad vendida</option></select></label>{criterio === "cantidad" && unidades.length > 0 && <label className="text-xs font-medium">Unidad base<select value={unidad} onChange={e => setUnidadElegida(e.target.value)} className="mt-1 block h-11 rounded-xl border border-border bg-card px-3 text-sm">{unidades.map(u => <option key={u} value={u}>{u}</option>)}</select></label>}</div></div><div className="grid gap-5 @4xl:grid-cols-2"><Ranking title="Más vendidos" criterio={criterio} productos={ranking.filter(p => criterio === "ingreso" ? p.ingresoCOP > 0 : p.unidadesBase > 0).slice(0,10)} /><Ranking title="Menos vendidos" criterio={criterio} productos={menores} /></div></section>
      <section className="flex flex-col gap-5 rounded-[16px] border border-primary/15 bg-primary/5 p-6 @3xl:flex-row @3xl:items-center @3xl:justify-between"><div className="max-w-2xl"><h2 className="text-lg font-semibold">Tu información en Excel</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Exporta el detalle operativo del mes o descarga la plantilla sencilla para ordenar ventas, gastos y soportes con tu contador. La plantilla se completa por separado y no es una declaración de renta.</p></div><div className="flex shrink-0 flex-col gap-2"><button type="button" disabled={!reporte.lineas.length} onClick={descargar} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-border bg-card px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"><Download className="size-4" />Ventas del mes (.csv)</button><a href="/templates/dusema-auxiliar-contable.xlsx" download className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[12px] border border-border bg-card px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"> <Download className="size-4" />Plantilla de resumen (.xlsx)</a></div></section>
      <p className="text-xs text-muted-foreground">Consulta: {new Date(lectura.datos!.consultadoEn).toLocaleString("es-CO",{timeZone:"America/Bogota"})} · America/Bogota. Se incluyen productos activos sin ventas. Al comparar cantidades se usa una sola unidad base.</p>
    </>}
  </section>
}

function Metrica({icon:Icon,label,value}:{icon:typeof Users;label:string;value:string}) { return <div className="rounded-[16px] border border-border/70 bg-card p-5"><Icon className="size-5 text-primary" aria-hidden="true" /><p className="mt-4 text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p></div> }
function Vacio() { return <p className="py-8 text-center text-sm text-muted-foreground">No hay ventas registradas en este período.</p> }
function Ranking({title,productos,criterio}:{title:string;productos:ProductoReporte[];criterio:"ingreso"|"cantidad"}) { return <section className="rounded-[16px] border border-border/70 bg-card p-5"><h3 className="text-lg font-semibold">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{criterio === "ingreso" ? "Orden por ingresos COP." : "Orden por cantidad vendida de la misma unidad base."}</p>{productos.length === 0 ? <Vacio /> : <ol className="mt-5 divide-y divide-border/60">{productos.map((p,i) => <li key={p.id} className="flex items-start gap-3 py-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">{i+1}</span><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{p.nombre}</p><p className="mt-1 text-xs text-muted-foreground">{p.unidadesBase} {p.unidad}{!p.activo ? " · Inactivo" : ""}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums">{cop(p.ingresoCOP)}</span></li>)}</ol>}</section> }
