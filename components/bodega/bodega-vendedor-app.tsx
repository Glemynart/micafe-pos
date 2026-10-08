"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays, CheckCircle2, CircleDollarSign, ClipboardList, LogOut, Package, Plus, RefreshCw, Search, ShoppingCart, Store, UserPlus, Users } from "lucide-react"
import type { Usuario } from "@/lib/auth-service"
import { abrirTurno, suscribirTurnoActivo, type Turno } from "@/lib/turnos-service"
import { cn } from "@/lib/utils"
import { construirConfirmacionVentaBodega, construirProgramacionPedidoBodega, construirSolicitudVentaBodega, crearProtectorDobleEnvio, fechaLocalEnZonaHoraria, formatearFechaBodega, formatearReferenciaSolicitud, mensajeErrorBodega, type ClienteVendedorDTO, type ComandoCrearProgramacionPedidoBodega, type ComandoSolicitudVentaBodega, type ConfirmacionVentaBodega, type EstadoSolicitudVentaBodega, type MetodoPagoBodega, type PresentacionVendedorDTO, type ProgramacionPedidoBodegaDTO, type ResultadoVentaBodega, type SolicitudVentaBodegaDTO, type VentaVendedorDTO } from "@/lib/bodega/ui-contract"
import { confirmarVentaBodega, consultarCatalogoBodega, consultarClientesVendedor, consultarMisVentasBodega, crearClienteVendedor } from "@/lib/bodega/vendedor-service"
import { cancelarSolicitudVentaBodega, consultarSolicitudesVentaBodega, crearSolicitudVentaBodega } from "@/lib/bodega/solicitudes-service"
import { BodegaAgendaVendedor } from "@/components/bodega/bodega-agenda-vendedor"
import { cancelarProgramacionPedidoBodega, consultarAgendaPedidosBodega, construirCancelacionProgramacionPedidoBodega, construirConversionProgramacionPedidoBodega, convertirProgramacionPedidoBodega, crearProgramacionPedidoBodega, type Envelope } from "@/lib/bodega/agenda-service"
import { useConfiguracionEmpresa } from "@/contexts/configuracion-empresa-context"
import { FcmManagerWrapper } from "@/components/fcm-manager-wrapper"

type Tab = "venta" | "solicitudes" | "agenda" | "clientes" | "historial"
type TipoPedido = "venta" | "hoy" | "agendar"
type LineaVisual = PresentacionVendedorDTO & { cantidad: number }
type AgendaCancelCommand = Envelope<{ programacionId: string; revision: number }>
type AgendaConvertCommand = Envelope<{ programacionId: string }>
const money = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)

function sumarDiaLocal(value: string) {
  const fecha = new Date(`${value}T00:00:00.000Z`)
  fecha.setUTCDate(fecha.getUTCDate() + 1)
  return fecha.toISOString().slice(0, 10)
}

export function BodegaVendedorApp({ usuario, onLogout }: { usuario: Usuario; onLogout(): void }) {
  const { proyecciones } = useConfiguracionEmpresa()
  const zonaHoraria = proyecciones?.localizacion.zonaHoraria ?? "America/Bogota"
  const hoy = fechaLocalEnZonaHoraria(new Date(), zonaHoraria)
  const manana = sumarDiaLocal(hoy)
  const [tab, setTab] = useState<Tab>("venta")
  const [tipoPedido, setTipoPedido] = useState<TipoPedido>("venta")
  const [fechaAgendada, setFechaAgendada] = useState(manana)
  const fechaAgendadaVigente = fechaAgendada < manana ? manana : fechaAgendada
  const [franjaDesde, setFranjaDesde] = useState("")
  const [franjaHasta, setFranjaHasta] = useState("")
  const [clientes, setClientes] = useState<ClienteVendedorDTO[]>([])
  const [catalogo, setCatalogo] = useState<PresentacionVendedorDTO[]>([])
  const [ventas, setVentas] = useState<VentaVendedorDTO[]>([])
  const [solicitudes, setSolicitudes] = useState<SolicitudVentaBodegaDTO[]>([])
  const [agenda, setAgenda] = useState<ProgramacionPedidoBodegaDTO[]>([])
  const [cargandoAgenda, setCargandoAgenda] = useState(false)
  const [procesandoAgenda, setProcesandoAgenda] = useState("")
  const [clienteId, setClienteId] = useState("")
  const [carrito, setCarrito] = useState<LineaVisual[]>([])
  const [metodosPago, setMetodosPago] = useState<Record<string, MetodoPagoBodega>>({})
  const [turno, setTurno] = useState<Turno | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState("")
  const [resultado, setResultado] = useState<ResultadoVentaBodega | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [mostrarCliente, setMostrarCliente] = useState(false)
  const [baseApertura, setBaseApertura] = useState(0)
  const comandoSolicitudPendiente = useRef<ComandoSolicitudVentaBodega | null>(null)
  const comandoAgendaPendiente = useRef<ComandoCrearProgramacionPedidoBodega | null>(null)
  const comandosAgendaPendientes = useRef(new Map<string, AgendaCancelCommand | AgendaConvertCommand>())
  const comandosVentaPendientes = useRef(new Map<string, ConfirmacionVentaBodega>())
  const solicitudesConsultaEnCurso = useRef(false)
  const agendaConsultaEnCurso = useRef(false)
  const guardiaEnvio = useRef(crearProtectorDobleEnvio())

  const cargar = useCallback(async () => {
    setCargando(true); setError("")
    try {
      const [clientesPermitidos, presentaciones, ventasPropias, solicitudesPropias] = await Promise.all([consultarClientesVendedor(), consultarCatalogoBodega(), consultarMisVentasBodega(), consultarSolicitudesVentaBodega()])
      setClientes(clientesPermitidos); setCatalogo(presentaciones); setVentas(ventasPropias); setSolicitudes(solicitudesPropias)
      setClienteId(actual => actual || clientesPermitidos[0]?.id || "")
    } catch (e) { setError(mensajeErrorBodega(e)) } finally { setCargando(false) }
  }, [])

  const actualizarSolicitudes = useCallback(async () => {
    if (solicitudesConsultaEnCurso.current) return
    solicitudesConsultaEnCurso.current = true
    try {
      setSolicitudes(await consultarSolicitudesVentaBodega())
    } catch (cause) {
      setError(mensajeErrorBodega(cause))
    } finally {
      solicitudesConsultaEnCurso.current = false
    }
  }, [])

  const actualizarAgenda = useCallback(async () => {
    if (agendaConsultaEnCurso.current) return
    agendaConsultaEnCurso.current = true
    setCargandoAgenda(true)
    try { setAgenda(await consultarAgendaPedidosBodega()) }
    catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { agendaConsultaEnCurso.current = false; setCargandoAgenda(false) }
  }, [])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => suscribirTurnoActivo(usuario.uid, setTurno), [usuario.uid])
  useEffect(() => { comandoSolicitudPendiente.current = null }, [clienteId, carrito])
  useEffect(() => { comandoAgendaPendiente.current = null }, [clienteId, carrito, tipoPedido, fechaAgendada, franjaDesde, franjaHasta])
  useEffect(() => {
    if (tab !== "solicitudes") return
    const actualizarSiVisible = () => {
      if (document.visibilityState === "visible") void actualizarSolicitudes()
    }
    void actualizarSolicitudes()
    const interval = window.setInterval(actualizarSiVisible, 15_000)
    document.addEventListener("visibilitychange", actualizarSiVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", actualizarSiVisible)
    }
  }, [tab, actualizarSolicitudes])
  useEffect(() => {
    if (tab !== "agenda") return
    const actualizarSiVisible = () => { if (document.visibilityState === "visible") void actualizarAgenda() }
    void actualizarAgenda()
    const interval = window.setInterval(actualizarSiVisible, 30_000)
    document.addEventListener("visibilitychange", actualizarSiVisible)
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", actualizarSiVisible) }
  }, [tab, actualizarAgenda])

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

  const enviarSolicitud = async () => {
    if (guardiaEnvio.current.activo) return
    if (!clienteId || carrito.length === 0) { setError("Selecciona un cliente y agrega al menos una presentación."); return }
    setEnviando(true); setError("")
    await guardiaEnvio.current.ejecutar(async () => { try {
      const envelope = comandoSolicitudPendiente.current ?? construirSolicitudVentaBodega({ clienteId, lineas: carrito.map(({ productoId, presentacionId, cantidad }) => ({ productoId, presentacionId, cantidad })) })
      comandoSolicitudPendiente.current = envelope
      await crearSolicitudVentaBodega(envelope)
      setCarrito([]); comandoSolicitudPendiente.current = null
      setSolicitudes(await consultarSolicitudesVentaBodega()); setTab("solicitudes")
    } catch (e) { setError(mensajeErrorBodega(e)) } finally { setEnviando(false) } })
  }

  const enviarProgramacion = async () => {
    if (guardiaEnvio.current.activo) return
    if (!clienteId || carrito.length === 0) { setError("Selecciona un cliente y agrega al menos una presentación."); return }
    if (!!franjaDesde !== !!franjaHasta) { setError("Completa la hora inicial y final de la franja, o deja ambas vacías."); return }
    setEnviando(true); setError("")
    await guardiaEnvio.current.ejecutar(async () => { try {
      const fechaLocal = tipoPedido === "hoy" ? hoy : fechaAgendadaVigente
      const franja = franjaDesde && franjaHasta ? { desde: franjaDesde, hasta: franjaHasta } : null
      const command = comandoAgendaPendiente.current ?? construirProgramacionPedidoBodega({
        clienteId,
        fechaLocal,
        franja,
        lineas: carrito.map(({ productoId, presentacionId, cantidad }) => ({ productoId, presentacionId, cantidad })),
      })
      comandoAgendaPendiente.current = command
      await crearProgramacionPedidoBodega(command)
      comandoAgendaPendiente.current = null; setCarrito([]); setTipoPedido("venta"); setFranjaDesde(""); setFranjaHasta("")
      await actualizarAgenda(); setTab("agenda")
    } catch (cause) { setError(mensajeErrorBodega(cause)) } finally { setEnviando(false) } })
  }

  const cancelarProgramacion = async (item: ProgramacionPedidoBodegaDTO) => {
    if (enviando) return
    const key = `${item.programacionId}:cancelar:${item.revision}`
    const command = comandosAgendaPendientes.current.get(key) as AgendaCancelCommand | undefined
      ?? construirCancelacionProgramacionPedidoBodega({ programacionId: item.programacionId, revision: item.revision })
    comandosAgendaPendientes.current.set(key, command)
    setProcesandoAgenda(item.programacionId); setError("")
    try { await cancelarProgramacionPedidoBodega(command); comandosAgendaPendientes.current.delete(key); await actualizarAgenda() }
    catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setProcesandoAgenda("") }
  }

  const convertirProgramacion = async (item: ProgramacionPedidoBodegaDTO) => {
    if (enviando) return
    const key = `${item.programacionId}:convertir`
    const command = comandosAgendaPendientes.current.get(key) as AgendaConvertCommand | undefined
      ?? construirConversionProgramacionPedidoBodega(item.programacionId)
    comandosAgendaPendientes.current.set(key, command)
    setProcesandoAgenda(item.programacionId); setError("")
    try {
      await convertirProgramacionPedidoBodega(command)
      comandosAgendaPendientes.current.delete(key)
      await Promise.all([actualizarAgenda(), actualizarSolicitudes()])
      setTab("solicitudes")
    } catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setProcesandoAgenda("") }
  }

  const confirmarSolicitud = async (solicitud: SolicitudVentaBodegaDTO) => {
    if (guardiaEnvio.current.activo) return
    const metodoPago = metodosPago[solicitud.solicitudId] ?? "transferencia"
    if (metodoPago === "efectivo" && !turno) { setError("Abre tu turno antes de cobrar en efectivo."); return }
    const key = `${solicitud.solicitudId}:${metodoPago}`
    setEnviando(true); setError("")
    await guardiaEnvio.current.ejecutar(async () => { try {
      const envelope = comandosVentaPendientes.current.get(key) ?? construirConfirmacionVentaBodega({
        clienteId: solicitud.clienteId, solicitudId: solicitud.solicitudId, metodoPago,
        lineas: solicitud.lineas.map(({ productoId, presentacionId, cantidad }) => ({ productoId, presentacionId, cantidad })),
      })
      comandosVentaPendientes.current.set(key, envelope)
      const result = await confirmarVentaBodega(envelope)
      if (!("ventaId" in result)) {
        comandosVentaPendientes.current.delete(key)
        setError("El catálogo cambió desde la aprobación. Envía una solicitud nueva para obtener el precio vigente.")
      } else {
        setResultado(result); comandosVentaPendientes.current.delete(key)
      }
      setSolicitudes(await consultarSolicitudesVentaBodega()); setVentas(await consultarMisVentasBodega())
    } catch (cause) { setError(mensajeErrorBodega(cause)) } finally { setEnviando(false) } })
  }

  const cancelarSolicitud = async (solicitud: SolicitudVentaBodegaDTO) => {
    if (enviando) return
    setEnviando(true); setError("")
    try {
      await cancelarSolicitudVentaBodega({ solicitudId: solicitud.solicitudId, revision: solicitud.revision })
      setSolicitudes(await consultarSolicitudesVentaBodega())
    } catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setEnviando(false) }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <FcmManagerWrapper />
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-slate-950"><Store className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-amber-300">Bodega móvil</p><p className="font-semibold">{usuario.nombre}</p></div></div>
          <div className="flex items-center gap-2"><span className={cn("rounded-full px-3 py-1 text-xs font-semibold", turno ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-slate-400")}>{turno ? "Turno abierto" : "Sin turno"}</span><button aria-label="Cerrar sesión" onClick={onLogout} className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/5"><LogOut className="h-4 w-4" /></button></div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-5">
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
        {resultado && "ventaId" in resultado && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" /><div><p className="font-semibold">Venta confirmada</p><p className="text-sm text-emerald-100/80">Referencia {resultado.ventaId} · {money(resultado.total)} · {resultado.metodoPago}</p></div><button className="ml-auto text-xs text-emerald-200" onClick={() => setResultado(null)}>Cerrar</button></div>}
        {cargando ? <div className="grid min-h-[50vh] place-items-center"><RefreshCw className="h-7 w-7 animate-spin text-amber-300" /></div> : tab === "venta" ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
            <section>
              <div className="mb-4"><p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">Solicitud de venta</p><h1 className="mt-1 text-2xl font-bold">Prepara una solicitud</h1><p className="mt-1 text-sm text-slate-400">El servidor resuelve cliente, presentaciones, precios y total. La venta queda pendiente hasta que administración la apruebe.</p></div>
              <label className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3"><Search className="h-4 w-4 text-slate-500" /><input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto o presentación" className="h-11 w-full bg-transparent text-sm outline-none" /></label>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{filtrado.map(item => <button key={item.presentacionId} onClick={() => agregar(item)} className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-left transition hover:border-amber-300/50 hover:bg-slate-800"><div className="mb-3 flex items-start justify-between gap-3"><Package className="h-5 w-5 text-amber-300" /><span className="text-lg font-bold text-amber-200">{money(item.precioCOP)}</span></div><p className="font-semibold">{item.productoNombre}</p><p className="mt-1 text-sm text-slate-400">{item.presentacionNombre} · {item.factorUnidadBase} {item.unidadBase ?? "unidades"}</p><p className="mt-3 text-xs text-slate-500">Disponibles: {item.maximoPresentacionesVendibles ?? "por validar"}</p></button>)}</div>
              {filtrado.length === 0 && <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-400">No hay presentaciones activas para mostrar.</div>}
            </section>
            <aside className="h-fit rounded-2xl border border-white/10 bg-slate-900 p-4 lg:sticky lg:top-24">
              <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold"><ShoppingCart className="h-5 w-5 text-amber-300" /> Resumen</h2><span className="text-xs text-slate-400">{carrito.length}/50 líneas</span></div>
              <fieldset className="mb-4"><legend className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Tipo de atención</legend><div className="grid grid-cols-3 gap-2"><button type="button" aria-pressed={tipoPedido === "venta"} onClick={() => setTipoPedido("venta")} className={cn("rounded-lg border px-2 py-2 text-xs font-semibold", tipoPedido === "venta" ? "border-amber-300 bg-amber-300 text-slate-950" : "border-white/10 text-slate-300")}>Venta de hoy</button><button type="button" aria-pressed={tipoPedido === "hoy"} onClick={() => setTipoPedido("hoy")} className={cn("rounded-lg border px-2 py-2 text-xs font-semibold", tipoPedido === "hoy" ? "border-amber-300 bg-amber-300 text-slate-950" : "border-white/10 text-slate-300")}>Pedido para hoy</button><button type="button" aria-pressed={tipoPedido === "agendar"} onClick={() => setTipoPedido("agendar")} className={cn("rounded-lg border px-2 py-2 text-xs font-semibold", tipoPedido === "agendar" ? "border-amber-300 bg-amber-300 text-slate-950" : "border-white/10 text-slate-300")}>Agendar entrega</button></div></fieldset>
              {tipoPedido !== "venta" && <div className="mb-4 space-y-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3">{tipoPedido === "hoy" ? <p className="text-sm font-semibold text-amber-100">Pedido para hoy · {hoy}</p> : <label className="block text-sm">Fecha de entrega preferida<input required type="date" min={manana} value={fechaAgendadaVigente} onChange={event => setFechaAgendada(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-white" /></label>}<div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-300">Desde (opcional)<input type="time" step={900} value={franjaDesde} onChange={event => setFranjaDesde(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-white" /></label><label className="text-xs text-slate-300">Hasta (opcional)<input type="time" step={900} value={franjaHasta} onChange={event => setFranjaHasta(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-white" /></label></div><p className="text-[11px] text-slate-400">La franja es una preferencia. Administración debe aceptar para retener stock; no se confirma precio, venta ni entrega exacta.</p></div>}
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Cliente</label><div className="mt-2 flex gap-2"><select value={clienteId} onChange={e => setClienteId(e.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm"><option value="">Seleccionar cliente</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} · {c.cedula}</option>)}</select><button aria-label="Crear cliente" onClick={() => setMostrarCliente(true)} className="rounded-xl bg-white/10 px-3 hover:bg-white/15"><UserPlus className="h-4 w-4" /></button></div>
              <div className="my-4 space-y-3">{carrito.map(linea => <div key={linea.presentacionId} className="rounded-xl bg-white/5 p-3"><div className="flex justify-between gap-3"><div><p className="text-sm font-semibold">{linea.productoNombre}</p><p className="text-xs text-slate-400">{linea.presentacionNombre}</p></div><p className="text-sm font-semibold">{money(linea.precioCOP * linea.cantidad)}</p></div><div className="mt-2 flex items-center gap-2"><button onClick={() => cantidad(linea.presentacionId, linea.cantidad - 1)} className="h-8 w-8 rounded-lg bg-white/10">−</button><input aria-label={`Cantidad de ${linea.presentacionNombre}`} type="number" min={1} value={linea.cantidad} onChange={e => cantidad(linea.presentacionId, Number(e.target.value))} className="h-8 w-16 rounded-lg bg-slate-950 text-center" /><button onClick={() => cantidad(linea.presentacionId, linea.cantidad + 1)} className="h-8 w-8 rounded-lg bg-white/10">+</button></div></div>)}</div>
              <div className="border-t border-white/10 pt-4"><div className="flex justify-between text-sm text-slate-400"><span>{tipoPedido === "venta" ? "Total visual estimado" : "Precio de referencia de hoy"}</span><strong className="text-lg text-white">{money(estimado)}</strong></div><p className="mt-1 text-[11px] text-slate-500">{tipoPedido === "venta" ? "El total autoritativo llegará con la respuesta del servidor." : "El precio y el stock se volverán a resolver cuando se atienda el pedido."}</p></div>
              <button disabled={enviando || carrito.length === 0 || !clienteId || (tipoPedido === "agendar" && !fechaAgendadaVigente) || (!!franjaDesde !== !!franjaHasta)} onClick={() => void (tipoPedido === "venta" ? enviarSolicitud() : enviarProgramacion())} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{tipoPedido === "venta" ? <ClipboardList className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}{enviando ? "Enviando…" : tipoPedido === "venta" ? "Enviar solicitud de venta" : tipoPedido === "hoy" ? "Enviar pedido para hoy" : "Agendar entrega"}</button>
            </aside>
          </div>
        ) : tab === "solicitudes" ? <SolicitudesView solicitudes={solicitudes} metodosPago={metodosPago} setMetodoPago={(id, method) => setMetodosPago(current => ({ ...current, [id]: method }))} enviando={enviando} turnoAbierto={!!turno} baseApertura={baseApertura} setBaseApertura={setBaseApertura} onAbrirTurno={() => void abrirTurno({ baseApertura, notasApertura: "Turno vendedor Bodega" }).catch(cause => setError(mensajeErrorBodega(cause)))} onConfirmar={solicitud => void confirmarSolicitud(solicitud)} onCancelar={solicitud => void cancelarSolicitud(solicitud)} onActualizar={() => void actualizarSolicitudes()} onCrearOtra={() => setTab("venta")} /> : tab === "agenda" ? <BodegaAgendaVendedor programaciones={agenda} hoy={hoy} cargando={cargandoAgenda} procesando={procesandoAgenda} onActualizar={() => void actualizarAgenda()} onCancelar={item => void cancelarProgramacion(item)} onConvertir={item => void convertirProgramacion(item)} /> : tab === "clientes" ? <ClientesView clientes={clientes} onCrear={() => setMostrarCliente(true)} /> : <HistorialView ventas={ventas} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"><div className="mx-auto flex h-16 max-w-2xl">{([{ id: "venta", label: "Nueva", icon: ShoppingCart }, { id: "solicitudes", label: "Solicitudes", icon: ClipboardList }, { id: "agenda", label: "Agenda", icon: CalendarDays }, { id: "clientes", label: "Clientes", icon: Users }, { id: "historial", label: "Mis ventas", icon: CircleDollarSign }] as const).map(item => <button key={item.id} onClick={() => setTab(item.id)} className={cn("flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold", tab === item.id ? "text-amber-300" : "text-slate-500")}><item.icon className="h-5 w-5" />{item.label}</button>)}</div></nav>
      {mostrarCliente && <CrearClienteModal onCerrar={() => setMostrarCliente(false)} onCreado={cliente => { setClientes(actual => [...actual, cliente].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))); setClienteId(cliente.id); setMostrarCliente(false) }} />}
    </div>
  )
}

function SolicitudesView({ solicitudes, metodosPago, setMetodoPago, enviando, turnoAbierto, baseApertura, setBaseApertura, onAbrirTurno, onConfirmar, onCancelar, onActualizar, onCrearOtra }: {
  solicitudes: SolicitudVentaBodegaDTO[]
  metodosPago: Record<string, MetodoPagoBodega>
  setMetodoPago(id: string, method: MetodoPagoBodega): void
  enviando: boolean
  turnoAbierto: boolean
  baseApertura: number
  setBaseApertura(value: number): void
  onAbrirTurno(): void
  onConfirmar(solicitud: SolicitudVentaBodegaDTO): void
  onCancelar(solicitud: SolicitudVentaBodegaDTO): void
  onActualizar(): void
  onCrearOtra(): void
}) {
  return <section>
    <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">Aprobación previa</p><h1 className="mt-1 text-2xl font-bold">Mis solicitudes</h1><p className="mt-1 text-sm text-slate-400">La venta solo se registra después de aprobación, al confirmar el pago.</p><p className="mt-1 text-xs text-slate-500">Se actualizan automáticamente mientras esta vista está abierta.</p></div><div className="flex shrink-0 gap-2"><button onClick={onActualizar} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200">Actualizar</button><button onClick={onCrearOtra} className="rounded-xl bg-amber-300 px-3 py-2 text-xs font-bold text-slate-950">Nueva</button></div></div>
    <div className="space-y-3">{solicitudes.map(solicitud => {
      const metodo = metodosPago[solicitud.solicitudId] ?? "transferencia"
      const cancelable = solicitud.estado === "PENDIENTE_APROBACION" || solicitud.estado === "APROBADA"
      return <article key={solicitud.solicitudId} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold">{solicitud.cliente?.nombre || "Cliente no disponible"}</p><p className="mt-1 text-xs text-slate-500">Solicitud · {formatearReferenciaSolicitud(solicitud.solicitudId)}</p></div><span className={cn("shrink-0 rounded-full px-2 py-1 text-xs font-bold", solicitud.estado === "APROBADA" ? "bg-emerald-400/15 text-emerald-300" : solicitud.estado === "PENDIENTE_APROBACION" ? "bg-amber-300/15 text-amber-200" : "bg-white/10 text-slate-300")}>{solicitud.estado.replaceAll("_", " ")}</span></div>
        <div className="my-3 space-y-2">{solicitud.lineas.map((linea, index) => <div key={`${linea.presentacionId}-${index}`} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{linea.cantidad} × {linea.presentacionNombre} ({linea.factorUnidadBase} {linea.unidadBase})</span><span className="shrink-0">{money(linea.subtotalCOP)}</span></div>)}</div>
        <div className="flex justify-between border-t border-white/10 pt-3"><span className="text-sm text-slate-400">Total resuelto por servidor</span><strong>{money(solicitud.totalCOP)}</strong></div>
        {solicitud.estado === "PENDIENTE_APROBACION" && <p className="mt-3 text-xs text-amber-200">Esperando revisión de administración. Aún no se creó una venta ni se descontó inventario.</p>}
        {solicitud.estado === "APROBADA" && <div className="mt-3 space-y-3"><p className="text-xs text-emerald-200">Aprobada por administración; vence {formatearFechaBodega(solicitud.aprobacion?.expiraEn)}. El inventario se revisa al confirmar.</p><div className="grid grid-cols-2 gap-2">{(["efectivo", "transferencia"] as const).map(method => <button key={method} onClick={() => setMetodoPago(solicitud.solicitudId, method)} className={cn("rounded-xl border px-3 py-2 text-sm font-semibold capitalize", metodo === method ? "border-amber-300 bg-amber-300 text-slate-950" : "border-white/10 bg-white/5")}>{method}</button>)}</div>{metodo === "efectivo" && !turnoAbierto && <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3"><label className="text-xs font-semibold text-amber-100">Base real de apertura<input aria-label="Base de apertura" type="number" min={0} value={baseApertura} onChange={event => setBaseApertura(Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-white" /></label><button onClick={onAbrirTurno} className="mt-2 w-full rounded-lg border border-amber-300/40 px-4 py-2 text-sm font-semibold text-amber-200">Abrir turno para efectivo</button></div>}<button disabled={enviando || (metodo === "efectivo" && !turnoAbierto)} onClick={() => onConfirmar(solicitud)} className="h-11 w-full rounded-xl bg-emerald-400 font-bold text-slate-950 disabled:opacity-40">{enviando ? "Confirmando…" : "Confirmar venta"}</button></div>}
        {cancelable && <button disabled={enviando} onClick={() => onCancelar(solicitud)} className="mt-3 w-full rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 disabled:opacity-50">Cancelar solicitud</button>}
      </article>
    })}{solicitudes.length === 0 && <p className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-400">Todavía no tienes solicitudes. Puedes preparar una nueva.</p>}</div>
  </section>
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
