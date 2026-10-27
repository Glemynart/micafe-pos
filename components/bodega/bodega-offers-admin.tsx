"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { BadgePercent, CalendarClock, CircleCheck, Clock3, Plus, RefreshCw, Tag, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  actualizarOfertaBodega,
  cerrarOfertaBodega,
  consultarOfertasBodega,
  crearOfertaBodega,
  obtenerSnapshotCatalogoBodega,
  type CanalOfertaBodega,
  type LineaOfertaBodegaAdmin,
  type OfertaBodegaAdmin,
} from "@/lib/bodega/admin-service"
import { mensajeErrorBodega } from "@/lib/bodega/ui-contract"

type Catalogo = Awaited<ReturnType<typeof obtenerSnapshotCatalogoBodega>>
type LineaFormulario = LineaOfertaBodegaAdmin & { key: string }

const moneda = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)

function ahoraBogotaParaInput(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date())
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? "00"
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`
}

function fechaBogotaParaInput(millis: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(millis))
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? "00"
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`
}

function mostrarFechaBogota(millis: number): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(millis))
}

function estadoVisible(oferta: OfertaBodegaAdmin, now: number) {
  if (oferta.estado === "CERRADA") return { label: "Cerrada", className: "bg-slate-100 text-slate-700" }
  if (now < oferta.inicioEnMillis) return { label: "Programada", className: "bg-blue-50 text-blue-800" }
  if (oferta.finEnMillis !== null && now >= oferta.finEnMillis) return { label: "Vencida · precio base vigente", className: "bg-amber-50 text-amber-900" }
  return { label: "Vigente", className: "bg-emerald-50 text-emerald-800" }
}

export function BodegaOfertasAdmin() {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [ofertas, setOfertas] = useState<OfertaBodegaAdmin[]>([])
  const [nombre, setNombre] = useState("")
  const [inicio, setInicio] = useState("")
  const [fin, setFin] = useState("")
  const [lineas, setLineas] = useState<LineaFormulario[]>([])
  const [editando, setEditando] = useState<string | null>(null)
  const [confirmarCierre, setConfirmarCierre] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const [ahora, setAhora] = useState(() => Date.now())

  const actualizarLista = useCallback(async () => {
    setError("")
    try { setOfertas(await consultarOfertasBodega()) }
    catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setCargando(false) }
  }, [])

  useEffect(() => {
    let activo = true
    void obtenerSnapshotCatalogoBodega().then(snapshot => { if (activo) setCatalogo(snapshot) })
      .catch(cause => { if (activo) setError(mensajeErrorBodega(cause)) })
    void actualizarLista()
    const clock = window.setInterval(() => setAhora(Date.now()), 60_000)
    return () => { activo = false; window.clearInterval(clock) }
  }, [actualizarLista])

  const productos = useMemo(() => new Map(catalogo?.productos.map(item => [item.id, item.nombre]) ?? []), [catalogo])
  const presentaciones = useMemo(() => catalogo?.presentaciones.filter(item => item.activo) ?? [], [catalogo])
  const presentacionPorId = useMemo(() => new Map(presentaciones.map(item => [item.id, item])), [presentaciones])

  function iniciarNueva() {
    setEditando(null); setNombre(""); setInicio(ahoraBogotaParaInput()); setFin(""); setLineas([])
    setConfirmarCierre(null); setError(""); setMensaje("")
  }

  function iniciarEdicion(oferta: OfertaBodegaAdmin) {
    if (oferta.estado !== "ACTIVA" || oferta.inicioEnMillis <= Date.now()) return
    setEditando(oferta.ofertaId); setNombre(oferta.nombre)
    setInicio(fechaBogotaParaInput(oferta.inicioEnMillis))
    setFin(oferta.finEnMillis === null ? "" : fechaBogotaParaInput(oferta.finEnMillis))
    setLineas(oferta.lineas.map((line, index) => ({ ...line, key: `${oferta.ofertaId}-${index}` })))
    setConfirmarCierre(null); setError(""); setMensaje("")
    document.getElementById("offer-editor")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function agregarLinea() {
    setLineas(current => [...current, { key: `line-${Date.now()}-${current.length}`, presentacionId: "", canal: "tienda", precioFinalCOP: 0 }])
  }

  function actualizarLinea(key: string, changes: Partial<LineaFormulario>) {
    setLineas(current => current.map(line => line.key === key ? { ...line, ...changes } : line))
  }

  async function guardar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(""); setMensaje("")
    const invalidLine = lineas.some(line => !line.presentacionId || !Number.isSafeInteger(line.precioFinalCOP) || line.precioFinalCOP <= 0)
    const keys = lineas.map(line => `${line.presentacionId}:${line.canal}`)
    if (!nombre.trim() || !inicio || lineas.length === 0 || invalidLine || new Set(keys).size !== keys.length) {
      setError("Completa el nombre, la hora de inicio y al menos una línea válida sin presentaciones/canales repetidos.")
      return
    }
    setGuardando(true)
    try {
      const payload = {
        nombre: nombre.trim(), inicioLocalBogota: inicio,
        finLocalBogota: fin || null,
        lineas: lineas.map(line => ({ presentacionId: line.presentacionId, canal: line.canal, precioFinalCOP: line.precioFinalCOP })),
      }
      const estabaEditando = Boolean(editando)
      if (editando) await actualizarOfertaBodega({ ofertaId: editando, ...payload })
      else await crearOfertaBodega(payload)
      setEditando(null); setNombre(""); setInicio(ahoraBogotaParaInput()); setFin(""); setLineas([]); setConfirmarCierre(null)
      setMensaje(estabaEditando ? "Oferta programada actualizada." : "Oferta programada creada.")
      await actualizarLista()
    } catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setGuardando(false) }
  }

  async function cerrar(ofertaId: string) {
    setGuardando(true); setError(""); setMensaje("")
    try {
      await cerrarOfertaBodega(ofertaId)
      setConfirmarCierre(null)
      setMensaje("Oferta cerrada. Las ventas nuevas vuelven al precio base.")
      await actualizarLista()
    } catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setGuardando(false) }
  }

  return <div className="space-y-7">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary">Promociones Bodega</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Ofertas</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Programa precios promocionales por presentación y canal. Las horas se interpretan en Colombia; al vencer, el POS vuelve automáticamente al precio base.</p></div>
      <Button type="button" variant="outline" className="shrink-0" onClick={() => { setCargando(true); void actualizarLista() }} disabled={guardando}><RefreshCw className="size-4" />Actualizar</Button>
    </header>

    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
    {mensaje && <div role="status" className="rounded-xl border border-emerald-600/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{mensaje}</div>}

    <section id="offer-editor" className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs sm:p-6">
      <div className="mb-5 flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><BadgePercent className="size-5" /></span><div><h2 className="text-lg font-semibold">{editando ? "Editar oferta programada" : "Crear oferta"}</h2><p className="mt-1 text-sm text-muted-foreground">Una oferta iniciada no se edita: puedes cerrarla manualmente. Sus ventas anteriores conservan sus precios.</p></div></div>
      {!editando && ofertas.length > 0 && <Button type="button" variant="secondary" size="sm" className="mb-4" onClick={iniciarNueva}><Plus className="size-4" />Nueva oferta</Button>}
      <form className="space-y-5" onSubmit={guardar}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Nombre de la oferta<input value={nombre} onChange={event => setNombre(event.target.value)} maxLength={120} required className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Ej. Oferta fin de semana" /></label>
          <label className="text-sm font-medium">Inicio · hora Colombia<input type="datetime-local" value={inicio} onChange={event => setInicio(event.target.value)} required className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <label className="text-sm font-medium sm:col-span-2">Fin · hora Colombia <span className="font-normal text-muted-foreground">(opcional; sin fecha, termina al cerrar manualmente)</span><input type="datetime-local" value={fin} onChange={event => setFin(event.target.value)} min={inicio || undefined} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-md" /></label>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Productos y precios</h3><p className="mt-0.5 text-xs text-muted-foreground">El precio final se valida en el servidor contra la tarifa vigente.</p></div><Button type="button" size="sm" variant="outline" onClick={agregarLinea} disabled={!catalogo}><Plus className="size-4" />Agregar presentación</Button></div>
          {lineas.length === 0 && <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Agrega las presentaciones que participarán en la oferta.</div>}
          {lineas.map((line, index) => {
            const presentation = presentacionPorId.get(line.presentacionId)
            const productoNombre = presentation ? productos.get(presentation.productoId) ?? "Producto" : ""
            return <div key={line.key} className="grid gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(130px,1fr)_minmax(150px,1fr)_auto] sm:items-end">
              <label className="text-sm font-medium">Presentación {index + 1}<select value={line.presentacionId} onChange={event => actualizarLinea(line.key, { presentacionId: event.target.value })} required className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal"><option value="">Selecciona producto</option>{presentaciones.map(item => <option key={item.id} value={item.id}>{productos.get(item.productoId) ?? "Producto"} · {item.nombre}</option>)}</select>{presentation && <span className="mt-1 block text-xs font-normal text-muted-foreground">{productoNombre} · factor {presentation.factorUnidadBase}</span>}</label>
              <label className="text-sm font-medium">Canal<select value={line.canal} onChange={event => actualizarLinea(line.key, { canal: event.target.value as CanalOfertaBodega })} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal"><option value="tienda">Tienda</option><option value="consumidor_final">Consumidor final</option></select></label>
              <label className="text-sm font-medium">Precio final COP<input type="number" inputMode="numeric" min={1} step={1} value={line.precioFinalCOP || ""} onChange={event => actualizarLinea(line.key, { precioFinalCOP: event.target.value === "" ? 0 : Number(event.target.value) })} required className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 font-normal" placeholder="0" /></label>
              <Button type="button" size="icon" variant="ghost" aria-label="Quitar presentación" onClick={() => setLineas(current => current.filter(item => item.key !== line.key))}><X className="size-4" /></Button>
            </div>
          })}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
          {editando && <Button type="button" variant="outline" onClick={iniciarNueva} disabled={guardando}>Cancelar edición</Button>}
          <Button type="submit" disabled={guardando || !catalogo || lineas.length === 0}>{guardando ? "Guardando…" : editando ? "Guardar cambios" : "Programar oferta"}</Button>
        </div>
      </form>
    </section>

    <section className="space-y-3">
      <div className="flex items-center gap-2"><Tag className="size-5 text-primary" /><h2 className="text-xl font-semibold">Ofertas registradas</h2></div>
      {cargando ? <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Cargando ofertas…</div>
        : ofertas.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"><CircleCheck className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">Todavía no hay ofertas</p><p className="mt-1 text-sm text-muted-foreground">Cuando programes una, aparecerá aquí.</p></div>
          : <div className="grid gap-3">{ofertas.map(oferta => {
            const status = estadoVisible(oferta, ahora)
            const editable = oferta.estado === "ACTIVA" && oferta.inicioEnMillis > ahora
            return <article key={oferta.ofertaId} className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs sm:p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-base font-semibold">{oferta.nombre}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>{status.label}</span></div><p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><Clock3 className="size-4 shrink-0" />{mostrarFechaBogota(oferta.inicioEnMillis)}{oferta.finEnMillis === null ? " · Sin vencimiento" : ` – ${mostrarFechaBogota(oferta.finEnMillis)}`}</p></div>
                <div className="flex shrink-0 flex-wrap gap-2">{editable && <Button type="button" size="sm" variant="outline" onClick={() => iniciarEdicion(oferta)} disabled={guardando}>Editar</Button>}{oferta.estado === "ACTIVA" && (confirmarCierre === oferta.ofertaId ? <><Button type="button" size="sm" variant="destructive" onClick={() => void cerrar(oferta.ofertaId)} disabled={guardando}>Confirmar cierre</Button><Button type="button" size="sm" variant="ghost" onClick={() => setConfirmarCierre(null)}>Cancelar</Button></> : <Button type="button" size="sm" variant="outline" onClick={() => setConfirmarCierre(oferta.ofertaId)} disabled={guardando}>Cerrar oferta</Button>)}</div>
              </div>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">{oferta.lineas.map((line, index) => { const presentation = presentacionPorId.get(line.presentacionId); return <li key={`${line.presentacionId}-${line.canal}-${index}`} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-muted/35 px-3 py-2.5 text-sm"><span className="min-w-0 truncate">{presentation ? `${productos.get(presentation.productoId) ?? "Producto"} · ${presentation.nombre}` : "Presentación no disponible"}<span className="ml-1 text-xs text-muted-foreground">({line.canal === "tienda" ? "Tienda" : "Consumidor final"})</span></span><span className="shrink-0 font-semibold tabular-nums">{moneda(line.precioFinalCOP)}</span></li> })}</ul>
            </article>
          })}</div>}
      <p className="text-xs leading-relaxed text-muted-foreground">La consulta y los cambios usan la sesión del tenant actual. Los precios de ofertas pasadas no modifican ventas o solicitudes ya registradas.</p>
    </section>
  </div>
}
