"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, Minus, Plus, RefreshCw, Search, ShoppingCart, Snowflake } from "lucide-react"
import { construirComandoVentaRetailNevera, type ComandoVentaRetailNevera, type MetodoPagoRetailNevera, type PresentacionRetailNeveraDTO, type ResultadoVentaRetailNevera } from "@/lib/bodega/nevera-contract"
import { consultarCatalogoNeveraVendedor, registrarVentaRetailNevera } from "@/lib/bodega/nevera-service"
import { mensajeErrorBodega } from "@/lib/bodega/ui-contract"

type LineaCarrito = PresentacionRetailNeveraDTO & { cantidad: number }
const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)

export function NeveraRetailView() {
  const [catalogo, setCatalogo] = useState<PresentacionRetailNeveraDTO[]>([])
  const [carrito, setCarrito] = useState<LineaCarrito[]>([])
  const [busqueda, setBusqueda] = useState("")
  const [metodoPago, setMetodoPago] = useState<MetodoPagoRetailNevera>("transferencia")
  const [montoRecibido, setMontoRecibido] = useState("")
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState("")
  const [resultado, setResultado] = useState<ResultadoVentaRetailNevera | null>(null)
  const comandoPendiente = useRef<ComandoVentaRetailNevera | null>(null)

  const actualizar = useCallback(async () => {
    setCargando(true)
    setError("")
    try { setCatalogo(await consultarCatalogoNeveraVendedor()) }
    catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setCargando(false) }
  }, [])

  useEffect(() => { void actualizar() }, [actualizar])
  useEffect(() => { comandoPendiente.current = null }, [carrito, metodoPago, montoRecibido])

  const filtrado = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase("es")
    return q ? catalogo.filter(item => `${item.productoNombre} ${item.presentacionNombre}`.toLocaleLowerCase("es").includes(q)) : catalogo
  }, [busqueda, catalogo])
  const total = carrito.reduce((sum, item) => sum + item.precioCOP * item.cantidad, 0)
  const recibido = montoRecibido === "" ? Number.NaN : Number(montoRecibido)
  const cambio = Number.isSafeInteger(recibido) && recibido >= total ? recibido - total : null

  function agregar(item: PresentacionRetailNeveraDTO) {
    if (!item.fifoListo || item.maximoPresentacionesVendibles <= 0) return
    setError("")
    setCarrito(current => {
      const existing = current.find(line => line.presentacionId === item.presentacionId)
      if (existing) return current.map(line => line.presentacionId === item.presentacionId
        ? { ...line, cantidad: Math.min(line.cantidad + 1, item.maximoPresentacionesVendibles) }
        : line)
      return [...current, { ...item, cantidad: 1 }]
    })
  }

  function setCantidad(presentacionId: string, cantidad: number) {
    setCarrito(current => current.flatMap(line => line.presentacionId !== presentacionId
      ? [line]
      : cantidad <= 0 ? [] : [{ ...line, cantidad: Math.min(cantidad, line.maximoPresentacionesVendibles) }]))
  }

  async function enviarVenta() {
    if (enviando || carrito.length === 0 || (metodoPago === "efectivo" && cambio === null)) return
    setEnviando(true)
    setError("")
    try {
      const command = comandoPendiente.current ?? construirComandoVentaRetailNevera({
        lineas: carrito.map(({ productoId, presentacionId, cantidad }) => ({ productoId, presentacionId, cantidad })),
        metodoPago,
        ...(metodoPago === "efectivo" ? { montoRecibidoCOP: recibido } : {}),
      })
      comandoPendiente.current = command
      const confirmacion = await registrarVentaRetailNevera(command)
      setResultado(confirmacion)
      setCarrito([])
      setMontoRecibido("")
      comandoPendiente.current = null
      await actualizar()
    } catch (cause) {
      setError(mensajeErrorBodega(cause))
    } finally { setEnviando(false) }
  }

  return <section className="space-y-5">
    <header className="seller-hero relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-primary via-primary to-primary/90 p-5 text-primary-foreground shadow-xl shadow-primary/15 sm:rounded-[2rem] sm:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 size-48 rounded-full border-[24px] border-accent/25" />
      <div className="relative flex items-center gap-4"><span className="grid size-12 place-items-center rounded-2xl bg-white/10"><Snowflake className="size-6" /></span><div><p className="text-xs font-bold uppercase tracking-[.2em] text-primary-foreground/70">Catálogo separado</p><h1 className="text-2xl font-extrabold tracking-tight">Venta retail · Nevera</h1><p className="mt-1 text-sm text-primary-foreground/80">Venta individual al consumidor final. No crea cartera externa ni modifica existencias de Bodega.</p></div></div>
    </header>

    {resultado && <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4"><CheckCircle2 className="mt-0.5 size-5 text-emerald-700" /><div><p className="font-semibold">Venta de Nevera registrada</p><p className="text-sm">{resultado.ventaId} · {money(resultado.total)} · {resultado.metodoPago}</p>{resultado.metodoPago === "efectivo" && <p className="mt-1 text-xs">Recibido {money(resultado.montoRecibidoCOP ?? 0)} · cambio {money(resultado.cambioCOP ?? 0)}</p>}</div><button type="button" onClick={() => setResultado(null)} className="ml-auto text-xs font-semibold">Cerrar</button></div>}
    {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-800">{error}</div>}

    <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0">
        <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Productos de Nevera</h2><p className="mt-1 text-sm text-muted-foreground">Solo se muestran productos de este catálogo; el servidor vuelve a validar precio y stock al cobrar.</p></div><button type="button" onClick={() => void actualizar()} disabled={cargando} aria-label="Actualizar catálogo Nevera" className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-card"><RefreshCw className={`size-4 ${cargando ? "animate-spin" : ""}`} /></button></div>
        <label className="seller-search mb-4 flex items-center gap-2 rounded-2xl border border-border/70 bg-card px-4 shadow-sm"><span className="sr-only">Buscar producto Nevera</span><Search className="size-5 shrink-0 text-primary" /><input value={busqueda} onChange={event => setBusqueda(event.target.value)} placeholder="Buscar producto o presentación" className="h-12 w-full bg-transparent text-sm outline-none" /></label>
        {cargando ? <div role="status" className="grid min-h-40 place-items-center"><RefreshCw className="size-6 animate-spin text-primary" /></div> : filtrado.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No hay productos Nevera que coincidan con la búsqueda.</div> : <div className="grid gap-3 @sm/catalog:grid-cols-2 @3xl/catalog:grid-cols-3">{filtrado.map(item => {
          const disabled = !item.fifoListo || item.maximoPresentacionesVendibles <= 0
          return <button key={item.presentacionId} type="button" disabled={disabled} onClick={() => agregar(item)} className="seller-product-card group min-h-36 rounded-2xl border border-border/70 bg-card p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 sm:p-5"><div className="mb-3 flex items-start justify-between gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary"><Snowflake className="size-5" /></span><span className="rounded-xl bg-accent/20 px-2.5 py-1.5 text-sm font-extrabold tabular-nums">{money(item.precioCOP)}</span></div><p className="font-semibold leading-snug">{item.productoNombre}</p><p className="mt-1 text-sm text-muted-foreground">{item.presentacionNombre} · {item.factorUnidadBase} {item.unidadBase}</p><p className="mt-3 text-xs text-muted-foreground">{!item.fifoListo ? "Pendiente de conciliar costo e inventario" : item.maximoPresentacionesVendibles > 0 ? `Disponibles: ${item.maximoPresentacionesVendibles}` : "Agotado"}</p></button>
        })}</div>}
      </section>

      <aside className="seller-cart-panel h-fit rounded-[1.5rem] border border-border/70 bg-card p-4 shadow-lg shadow-primary/5 sm:p-5 @4xl:sticky @4xl:top-24">
        <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Nevera</p><h2 className="mt-1 flex items-center gap-2 text-lg font-bold"><ShoppingCart className="size-5 text-primary" /> Venta actual</h2></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{carrito.length}/50</span></div>
        <div className="space-y-3">{carrito.length === 0 ? <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Selecciona productos para iniciar la venta.</p> : carrito.map(line => <article key={line.presentacionId} className="rounded-xl bg-muted/40 p-3"><div className="flex justify-between gap-3"><div><p className="text-sm font-semibold">{line.productoNombre}</p><p className="text-xs text-muted-foreground">{line.presentacionNombre}</p></div><p className="text-sm font-semibold">{money(line.precioCOP * line.cantidad)}</p></div><div className="mt-2 flex items-center gap-2"><button type="button" aria-label={`Quitar una unidad de ${line.presentacionNombre}`} onClick={() => setCantidad(line.presentacionId, line.cantidad - 1)} className="grid size-10 place-items-center rounded-lg bg-background"><Minus className="size-4" /></button><input aria-label={`Cantidad de ${line.presentacionNombre}`} type="number" min={1} max={line.maximoPresentacionesVendibles} value={line.cantidad} onChange={event => setCantidad(line.presentacionId, Number(event.target.value))} className="h-10 w-16 rounded-lg bg-background text-center" /><button type="button" aria-label={`Agregar una unidad de ${line.presentacionNombre}`} disabled={line.cantidad >= line.maximoPresentacionesVendibles} onClick={() => setCantidad(line.presentacionId, line.cantidad + 1)} className="grid size-10 place-items-center rounded-lg bg-background disabled:opacity-40"><Plus className="size-4" /></button></div></article>)}</div>
        <label className="mt-4 block text-xs font-semibold">Medio de pago<select value={metodoPago} onChange={event => setMetodoPago(event.target.value as MetodoPagoRetailNevera)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option></select></label>
        {metodoPago === "efectivo" && <label className="mt-3 block text-xs font-semibold">Efectivo recibido (COP)<input type="number" min={total} step={1} value={montoRecibido} onChange={event => setMontoRecibido(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />{cambio !== null && <span className="mt-1 block text-xs text-emerald-700">Cambio: {money(cambio)}</span>}</label>}
        <div className="mt-4 border-t border-border/70 pt-4"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Total retail</span><strong className="text-xl">{money(total)}</strong></div><p className="mt-1 text-[11px] text-muted-foreground">El ingreso se registra una vez. El costo FIFO se abona a la cuenta interna de Nevera.</p></div>
        <button type="button" disabled={enviando || carrito.length === 0 || (metodoPago === "efectivo" && cambio === null)} onClick={() => void enviarVenta()} className="mt-3 h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">{enviando ? "Registrando venta…" : "Cobrar venta de Nevera"}</button>
      </aside>
    </div>
  </section>
}
