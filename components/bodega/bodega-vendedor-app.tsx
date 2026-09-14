"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, CircleDollarSign, LogOut, Package, Plus, RefreshCw, Search, ShoppingCart, Store, UserPlus, Users } from "lucide-react"
import type { Usuario } from "@/lib/auth-service"
import { abrirTurno, suscribirTurnoActivo, type Turno } from "@/lib/turnos-service"
import { cn } from "@/lib/utils"
import { construirConfirmacionVentaBodega, crearProtectorDobleEnvio, mensajeErrorBodega, type ClienteVendedorDTO, type ConfirmacionVentaBodega, type MetodoPagoBodega, type PresentacionVendedorDTO, type ResultadoVentaBodega, type VentaVendedorDTO } from "@/lib/bodega/ui-contract"
import { confirmarVentaBodega, consultarCatalogoBodega, consultarClientesVendedor, consultarMisVentasBodega, crearClienteVendedor } from "@/lib/bodega/vendedor-service"

type Tab = "venta" | "clientes" | "historial"
type LineaVisual = PresentacionVendedorDTO & { cantidad: number }
const money = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)

export function BodegaVendedorApp({ usuario, onLogout }: { usuario: Usuario; onLogout(): void }) {
  const [tab, setTab] = useState<Tab>("venta")
  const [clientes, setClientes] = useState<ClienteVendedorDTO[]>([])
  const [catalogo, setCatalogo] = useState<PresentacionVendedorDTO[]>([])
  const [ventas, setVentas] = useState<VentaVendedorDTO[]>([])
  const [clienteId, setClienteId] = useState("")
  const [carrito, setCarrito] = useState<LineaVisual[]>([])
  const [metodoPago, setMetodoPago] = useState<MetodoPagoBodega>("efectivo")
  const [turno, setTurno] = useState<Turno | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState("")
  const [resultado, setResultado] = useState<ResultadoVentaBodega | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [mostrarCliente, setMostrarCliente] = useState(false)
  const [baseApertura, setBaseApertura] = useState(0)
  const comandoPendiente = useRef<ConfirmacionVentaBodega | null>(null)
  const guardiaEnvio = useRef(crearProtectorDobleEnvio())

  const cargar = useCallback(async () => {
    setCargando(true); setError("")
    try {
      const [clientesPermitidos, presentaciones, ventasPropias] = await Promise.all([consultarClientesVendedor(), consultarCatalogoBodega(), consultarMisVentasBodega()])
      setClientes(clientesPermitidos); setCatalogo(presentaciones); setVentas(ventasPropias)
      setClienteId(actual => actual || clientesPermitidos[0]?.id || "")
    } catch (e) { setError(mensajeErrorBodega(e)) } finally { setCargando(false) }
  }, [])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => suscribirTurnoActivo(usuario.uid, setTurno), [usuario.uid])
  useEffect(() => { comandoPendiente.current = null }, [clienteId, carrito, metodoPago])

  const filtrado = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase("es")
    return q ? catalogo.filter(item => `${item.productoNombre} ${item.presentacionNombre}`.toLocaleLowerCase("es").includes(q)) : catalogo
  }, [busqueda, catalogo])
  const estimado = carrito.reduce((total, linea) => total + linea.precioCOP * linea.cantidad, 0)

  const agregar = (item: PresentacionVendedorDTO) => setCarrito(actual => {
    const existente = actual.find(linea => linea.presentacionId === item.presentacionId)
    return existente ? actual.map(linea => linea.presentacionId === item.presentacionId ? { ...linea, cantidad: linea.cantidad + 1 } : linea) : [...actual, { ...item, cantidad: 1 }]
  })
  const cantidad = (id: string, value: number) => setCarrito(actual => value <= 0 ? actual.filter(linea => linea.presentacionId !== id) : actual.map(linea => linea.presentacionId === id ? { ...linea, cantidad: value } : linea))

  const confirmar = async () => {
    if (guardiaEnvio.current.activo) return
    if (!clienteId || carrito.length === 0) { setError("Selecciona un cliente y agrega al menos una presentación."); return }
    if (metodoPago === "efectivo" && !turno) { setError("Abre tu turno antes de cobrar en efectivo."); return }
    setEnviando(true); setError("")
    await guardiaEnvio.current.ejecutar(async () => { try {
      const envelope = comandoPendiente.current ?? construirConfirmacionVentaBodega({ clienteId, metodoPago, lineas: carrito.map(({ productoId, presentacionId, cantidad }) => ({ productoId, presentacionId, cantidad })) })
      comandoPendiente.current = envelope
      const final = await confirmarVentaBodega(envelope)
      setResultado(final); setCarrito([]); comandoPendiente.current = null
      setVentas(await consultarMisVentasBodega())
    } catch (e) { setError(mensajeErrorBodega(e)) } finally { setEnviando(false) } })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-slate-950"><Store className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-amber-300">Bodega móvil</p><p className="font-semibold">{usuario.nombre}</p></div></div>
          <div className="flex items-center gap-2"><span className={cn("rounded-full px-3 py-1 text-xs font-semibold", turno ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-slate-400")}>{turno ? "Turno abierto" : "Sin turno"}</span><button aria-label="Cerrar sesión" onClick={onLogout} className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/5"><LogOut className="h-4 w-4" /></button></div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-5">
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {resultado && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" /><div><p className="font-semibold">Venta confirmada</p><p className="text-sm text-emerald-100/80">Referencia {resultado.ventaId} · {money(resultado.total)} · {resultado.metodoPago}</p></div><button className="ml-auto text-xs text-emerald-200" onClick={() => setResultado(null)}>Cerrar</button></div>}
        {cargando ? <div className="grid min-h-[50vh] place-items-center"><RefreshCw className="h-7 w-7 animate-spin text-amber-300" /></div> : tab === "venta" ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
            <section>
              <div className="mb-4"><p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">Venta directa</p><h1 className="mt-1 text-2xl font-bold">Selecciona una presentación</h1><p className="mt-1 text-sm text-slate-400">Los precios, factores y existencias finales se validan en el servidor.</p></div>
              <label className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3"><Search className="h-4 w-4 text-slate-500" /><input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto o presentación" className="h-11 w-full bg-transparent text-sm outline-none" /></label>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtrado.map(item => <button key={item.presentacionId} onClick={() => agregar(item)} className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-left transition hover:border-amber-300/50 hover:bg-slate-800"><div className="mb-3 flex items-start justify-between gap-3"><Package className="h-5 w-5 text-amber-300" /><span className="text-lg font-bold text-amber-200">{money(item.precioCOP)}</span></div><p className="font-semibold">{item.productoNombre}</p><p className="mt-1 text-sm text-slate-400">{item.presentacionNombre} · {item.factorUnidadBase} {item.unidadBase ?? "unidades"}</p><p className="mt-3 text-xs text-slate-500">Disponibles: {item.maximoPresentacionesVendibles ?? "por validar"}</p></button>)}</div>
              {filtrado.length === 0 && <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-400">No hay presentaciones activas para mostrar.</div>}
            </section>
            <aside className="h-fit rounded-2xl border border-white/10 bg-slate-900 p-4 lg:sticky lg:top-24">
              <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold"><ShoppingCart className="h-5 w-5 text-amber-300" /> Resumen</h2><span className="text-xs text-slate-400">{carrito.length}/50 líneas</span></div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Cliente</label><div className="mt-2 flex gap-2"><select value={clienteId} onChange={e => setClienteId(e.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm"><option value="">Seleccionar cliente</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} · {c.cedula}</option>)}</select><button aria-label="Crear cliente" onClick={() => setMostrarCliente(true)} className="rounded-xl bg-white/10 px-3 hover:bg-white/15"><UserPlus className="h-4 w-4" /></button></div>
              <div className="my-4 space-y-3">{carrito.map(linea => <div key={linea.presentacionId} className="rounded-xl bg-white/5 p-3"><div className="flex justify-between gap-3"><div><p className="text-sm font-semibold">{linea.productoNombre}</p><p className="text-xs text-slate-400">{linea.presentacionNombre}</p></div><p className="text-sm font-semibold">{money(linea.precioCOP * linea.cantidad)}</p></div><div className="mt-2 flex items-center gap-2"><button onClick={() => cantidad(linea.presentacionId, linea.cantidad - 1)} className="h-8 w-8 rounded-lg bg-white/10">−</button><input aria-label={`Cantidad de ${linea.presentacionNombre}`} type="number" min={1} value={linea.cantidad} onChange={e => cantidad(linea.presentacionId, Number(e.target.value))} className="h-8 w-16 rounded-lg bg-slate-950 text-center" /><button onClick={() => cantidad(linea.presentacionId, linea.cantidad + 1)} className="h-8 w-8 rounded-lg bg-white/10">+</button></div></div>)}</div>
              <div className="border-t border-white/10 pt-4"><div className="flex justify-between text-sm text-slate-400"><span>Total visual estimado</span><strong className="text-lg text-white">{money(estimado)}</strong></div><p className="mt-1 text-[11px] text-slate-500">El total canónico se resuelve al confirmar.</p></div>
              <div className="mt-4 grid grid-cols-2 gap-2">{(["efectivo", "transferencia"] as const).map(metodo => <button key={metodo} onClick={() => setMetodoPago(metodo)} className={cn("rounded-xl border px-3 py-3 text-sm font-semibold capitalize", metodoPago === metodo ? "border-amber-300 bg-amber-300 text-slate-950" : "border-white/10 bg-white/5")}>{metodo}</button>)}</div>
              {metodoPago === "efectivo" && !turno && <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3"><label className="text-xs font-semibold text-amber-100">Base real de apertura<input aria-label="Base de apertura" type="number" min={0} value={baseApertura} onChange={e => setBaseApertura(Number(e.target.value))} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-white" /></label><button onClick={async () => { try { await abrirTurno({ baseApertura, notasApertura: "Turno vendedor Bodega" }) } catch (e) { setError(mensajeErrorBodega(e)) } }} className="mt-2 w-full rounded-lg border border-amber-300/40 px-4 py-2 text-sm font-semibold text-amber-200">Abrir turno para efectivo</button></div>}
              <button disabled={enviando || carrito.length === 0 || !clienteId || (metodoPago === "efectivo" && !turno)} onClick={() => void confirmar()} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"><CircleDollarSign className="h-5 w-5" />{enviando ? "Confirmando…" : "Confirmar venta"}</button>
            </aside>
          </div>
        ) : tab === "clientes" ? <ClientesView clientes={clientes} onCrear={() => setMostrarCliente(true)} /> : <HistorialView ventas={ventas} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"><div className="mx-auto flex h-16 max-w-lg">{([{ id: "venta", label: "Vender", icon: ShoppingCart }, { id: "clientes", label: "Clientes", icon: Users }, { id: "historial", label: "Mis ventas", icon: CircleDollarSign }] as const).map(item => <button key={item.id} onClick={() => setTab(item.id)} className={cn("flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold", tab === item.id ? "text-amber-300" : "text-slate-500")}><item.icon className="h-5 w-5" />{item.label}</button>)}</div></nav>
      {mostrarCliente && <CrearClienteModal onCerrar={() => setMostrarCliente(false)} onCreado={cliente => { setClientes(actual => [...actual, cliente].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))); setClienteId(cliente.id); setMostrarCliente(false) }} />}
    </div>
  )
}

function ClientesView({ clientes, onCrear }: { clientes: ClienteVendedorDTO[]; onCrear(): void }) {
  return <section><div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">Directorio comercial</p><h1 className="mt-1 text-2xl font-bold">Clientes activos</h1></div><button onClick={onCrear} className="flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950"><Plus className="h-4 w-4" />Nuevo</button></div><div className="grid gap-3 sm:grid-cols-2">{clientes.map(c => <article key={c.id} className="rounded-2xl border border-white/10 bg-slate-900 p-4"><p className="font-semibold">{c.nombre}</p><p className="mt-1 text-sm text-slate-400">{c.tipoDocumento ?? "Documento"} {c.cedula}</p><p className="mt-2 text-sm text-slate-300">{c.telefono}</p>{c.barrioZona && <p className="mt-1 text-xs text-slate-500">{c.barrioZona}</p>}</article>)}</div></section>
}

function HistorialView({ ventas }: { ventas: VentaVendedorDTO[] }) {
  return <section><p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">Trazabilidad personal</p><h1 className="mt-1 text-2xl font-bold">Mis ventas</h1><div className="mt-4 space-y-3">{ventas.map(v => <article key={v.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900 p-4"><div><p className="font-semibold">{v.cliente ?? "Cliente"}</p><p className="text-xs text-slate-500">{v.id} · {v.metodoPago}</p></div><p className="font-bold text-emerald-300">{money(v.total)}</p></article>)}{ventas.length === 0 && <p className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-400">Todavía no tienes ventas registradas.</p>}</div></section>
}

function CrearClienteModal({ onCerrar, onCreado }: { onCerrar(): void; onCreado(cliente: ClienteVendedorDTO): void }) {
  const [form, setForm] = useState({ nombre: "", cedula: "", telefono: "", tipoDocumento: "NIT" as "NIT" | "CC", contacto: "", direccion: "", barrioZona: "" })
  const [guardando, setGuardando] = useState(false); const [error, setError] = useState("")
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (guardando) return; setGuardando(true); setError(""); try { const opcionales = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== "")); onCreado(await crearClienteVendedor(opcionales as typeof form)) } catch (e) { setError(mensajeErrorBodega(e)) } finally { setGuardando(false) } }
  return <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 sm:place-items-center sm:p-4"><form onSubmit={submit} className="max-h-[92dvh] w-full max-w-lg overflow-auto rounded-t-3xl border border-white/10 bg-slate-900 p-5 sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-amber-300">Alta comercial</p><h2 className="text-xl font-bold">Nuevo cliente</h2></div><button type="button" onClick={onCerrar} className="text-sm text-slate-400">Cancelar</button></div>{error && <p className="mb-3 rounded-xl bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}<div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre comercial *" value={form.nombre} onChange={nombre => setForm({ ...form, nombre })} /><Field label="Documento *" value={form.cedula} onChange={cedula => setForm({ ...form, cedula })} /><Field label="Teléfono *" value={form.telefono} onChange={telefono => setForm({ ...form, telefono })} /><label className="text-sm text-slate-300">Tipo<select value={form.tipoDocumento} onChange={e => setForm({ ...form, tipoDocumento: e.target.value as "NIT" | "CC" })} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3"><option>NIT</option><option>CC</option></select></label><Field label="Contacto" value={form.contacto} onChange={contacto => setForm({ ...form, contacto })} /><Field label="Dirección" value={form.direccion} onChange={direccion => setForm({ ...form, direccion })} /><Field label="Barrio / zona" value={form.barrioZona} onChange={barrioZona => setForm({ ...form, barrioZona })} /></div><button disabled={guardando} className="mt-5 h-12 w-full rounded-xl bg-amber-300 font-bold text-slate-950 disabled:opacity-50">{guardando ? "Guardando…" : "Crear cliente"}</button></form></div>
}

function Field({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) { return <label className="text-sm text-slate-300">{label}<input required={label.endsWith("*")} value={value} onChange={e => onChange(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 outline-none focus:border-amber-300/60" /></label> }
