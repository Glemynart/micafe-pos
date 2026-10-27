"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays, CheckCircle2, CircleDollarSign, ClipboardList, LogOut, Package, Plus, RefreshCw, Search, ShoppingCart, Store, UserPlus, Users } from "lucide-react"
import type { Usuario } from "@/lib/auth-service"
import { suscribirTurnoActivo, type Turno } from "@/lib/turnos-service"
import { cn } from "@/lib/utils"
import { calcularCambioEfectivoBodega, construirComandoAbonoVentaBodega, construirConfirmacionVentaBodega, construirProgramacionPedidoBodega, construirSolicitudVentaBodega, crearProtectorDobleEnvio, fechaLocalEnZonaHoraria, formatearFechaBodega, formatearReferenciaSolicitud, mensajeErrorBodega, METODO_PAGO_BODEGA_PREDETERMINADO, type CarteraClienteBodegaDTO, type ClienteVendedorDTO, type ComandoAbonoVentaBodega, type ComandoCrearProgramacionPedidoBodega, type ComandoSolicitudVentaBodega, type ConfirmacionVentaBodega, type EstadoSolicitudVentaBodega, type MetodoPagoBodega, type PresentacionVendedorDTO, type ProgramacionPedidoBodegaDTO, type ResultadoVentaBodega, type SolicitudVentaBodegaDTO, type VentaVendedorDTO } from "@/lib/bodega/ui-contract"
import { confirmarVentaBodega, consultarCarteraClienteBodega, consultarCatalogoBodega, consultarClientesVendedor, consultarMisVentasBodega, crearClienteVendedor, registrarAbonoVentaBodega } from "@/lib/bodega/vendedor-service"
import { cancelarSolicitudVentaBodega, consultarSolicitudesVentaBodega, crearSolicitudVentaBodega } from "@/lib/bodega/solicitudes-service"
import { BodegaAgendaVendedor } from "@/components/bodega/bodega-agenda-vendedor"
import { cancelarProgramacionPedidoBodega, consultarAgendaPedidosBodega, construirCancelacionProgramacionPedidoBodega, construirConversionProgramacionPedidoBodega, convertirProgramacionPedidoBodega, crearProgramacionPedidoBodega, type Envelope } from "@/lib/bodega/agenda-service"
import { useConfiguracionEmpresa } from "@/contexts/configuracion-empresa-context"
import { FcmManagerWrapper } from "@/components/fcm-manager-wrapper"
import { crearRefrescoCoalescido } from "@/lib/bodega/refresh-coalescido"
import { crearDetectorCambioSenalBodega, registrarRecuperacionEnLineaBodega, suscribirSenalBodega } from "@/lib/bodega/live-signals-service"

type Tab = "venta" | "solicitudes" | "agenda" | "clientes" | "historial"
const sellerTabs = [
  { id: "venta", label: "Nueva venta", icon: ShoppingCart },
  { id: "solicitudes", label: "Solicitudes", icon: ClipboardList },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "historial", label: "Mis ventas", icon: CircleDollarSign },
] as const

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
  const { empresaId, proyecciones, branding } = useConfiguracionEmpresa()
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
  const [cargandoMasAgenda, setCargandoMasAgenda] = useState(false)
  const [nextCursorAgenda, setNextCursorAgenda] = useState<string | null>(null)
  const [procesandoAgenda, setProcesandoAgenda] = useState("")
  const [clienteId, setClienteId] = useState("")
  const [carteraClientePedido, setCarteraClientePedido] = useState<CarteraClienteBodegaDTO | null>(null)
  const [cargandoCarteraPedido, setCargandoCarteraPedido] = useState(false)
  const [errorCarteraPedido, setErrorCarteraPedido] = useState("")
  const [carrito, setCarrito] = useState<LineaVisual[]>([])
  const [metodosPago, setMetodosPago] = useState<Record<string, MetodoPagoBodega>>({})
  const [montosRecibidos, setMontosRecibidos] = useState<Record<string, number | undefined>>({})
  const [turno, setTurno] = useState<Turno | null>(null)
  const [cargando, setCargando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState("")
  const [senalDesconectada, setSenalDesconectada] = useState(false)
  const [resultado, setResultado] = useState<ResultadoVentaBodega | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [mostrarCliente, setMostrarCliente] = useState(false)
  const comandoSolicitudPendiente = useRef<ComandoSolicitudVentaBodega | null>(null)
  const comandoAgendaPendiente = useRef<ComandoCrearProgramacionPedidoBodega | null>(null)
  const comandosAgendaPendientes = useRef(new Map<string, AgendaCancelCommand | AgendaConvertCommand>())
  const comandosVentaPendientes = useRef(new Map<string, ConfirmacionVentaBodega>())
  const suscripcionSenal = useRef<ReturnType<typeof suscribirSenalBodega> | null>(null)
  const agendaConsultaEnCurso = useRef(false)
  const consultaCarteraPedidoId = useRef(0)
  const guardiaEnvio = useRef(crearProtectorDobleEnvio())

  const cargar = useCallback(async () => {
    setCargando(true); setError("")
    try {
      const [clientesPermitidos, presentaciones, ventasPropias, solicitudesPropias] = await Promise.all([consultarClientesVendedor(), consultarCatalogoBodega(), consultarMisVentasBodega(), consultarSolicitudesVentaBodega()])
      setClientes(clientesPermitidos); setCatalogo(presentaciones); setVentas(ventasPropias); setSolicitudes(solicitudesPropias)
      setClienteId(actual => actual || clientesPermitidos[0]?.id || "")
    } catch (e) { setError(mensajeErrorBodega(e)) } finally { setCargando(false) }
  }, [])

  const actualizarSolicitudes = useMemo(() => crearRefrescoCoalescido(async () => {
    try { setSolicitudes(await consultarSolicitudesVentaBodega()) }
    catch (cause) { setError(mensajeErrorBodega(cause)) }
  }), [])

  const actualizarCatalogo = useMemo(() => crearRefrescoCoalescido(async () => {
    try { setCatalogo(await consultarCatalogoBodega()) }
    catch (cause) { setError(mensajeErrorBodega(cause)) }
  }), [])

  const actualizarSolicitudesConReconectar = useCallback(() => {
    suscripcionSenal.current?.reconectar()
    return actualizarSolicitudes()
  }, [actualizarSolicitudes])

  const actualizarCatalogoConReconectar = useCallback(() => {
    suscripcionSenal.current?.reconectar()
    return actualizarCatalogo()
  }, [actualizarCatalogo])

  const actualizarCarteraClientePedido = useCallback(async (id: string) => {
    const consultaId = ++consultaCarteraPedidoId.current
    if (!id) {
      setCarteraClientePedido(null)
      setCargandoCarteraPedido(false)
      setErrorCarteraPedido("")
      return
    }
    setCarteraClientePedido(null)
    setCargandoCarteraPedido(true)
    setErrorCarteraPedido("")
    try {
      const carteraActual = await consultarCarteraClienteBodega(id)
      if (consultaId !== consultaCarteraPedidoId.current) return
      setCarteraClientePedido(carteraActual)
      setClientes(actual => actual.map(cliente => cliente.id === id
        ? { ...cliente, saldoPendienteCOP: carteraActual.saldoPendienteCOP }
        : cliente))
    } catch (cause) {
      if (consultaId === consultaCarteraPedidoId.current) setErrorCarteraPedido(mensajeErrorBodega(cause))
    } finally {
      if (consultaId === consultaCarteraPedidoId.current) setCargandoCarteraPedido(false)
    }
  }, [])

  useEffect(() => {
    if (tab === "venta") void actualizarCarteraClientePedido(clienteId)
    else {
      consultaCarteraPedidoId.current += 1
      setCarteraClientePedido(null)
      setCargandoCarteraPedido(false)
      setErrorCarteraPedido("")
    }
  }, [tab, clienteId, actualizarCarteraClientePedido])

  const actualizarAgenda = useCallback(async (cursor?: string | null, preservarPaginas = false) => {
    if (agendaConsultaEnCurso.current) return
    agendaConsultaEnCurso.current = true
    if (cursor) setCargandoMasAgenda(true)
    else setCargandoAgenda(true)
    try {
      const page = await consultarAgendaPedidosBodega(cursor)
      if (cursor) {
        setAgenda(current => {
          const ids = new Set(current.map(item => item.programacionId))
          return [...current, ...page.programaciones.filter(item => !ids.has(item.programacionId))]
        })
        setNextCursorAgenda(page.nextCursor)
      } else if (preservarPaginas) {
        setAgenda(current => {
          const freshIds = new Set(page.programaciones.map(item => item.programacionId))
          return [...page.programaciones, ...current.filter(item => !freshIds.has(item.programacionId))]
        })
      } else {
        setAgenda(page.programaciones)
        setNextCursorAgenda(page.nextCursor)
      }
    }
    catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { agendaConsultaEnCurso.current = false; setCargandoAgenda(false); setCargandoMasAgenda(false) }
  }, [])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => suscribirTurnoActivo(usuario.uid, setTurno), [usuario.uid])
  useEffect(() => { comandoSolicitudPendiente.current = null }, [clienteId, carrito])
  useEffect(() => { comandoAgendaPendiente.current = null }, [clienteId, carrito, tipoPedido, fechaAgendada, franjaDesde, franjaHasta])
  useEffect(() => {
    if (!empresaId || (tab !== "venta" && tab !== "solicitudes")) { setSenalDesconectada(false); return }
    const catalogoActivo = tab === "venta"
    const actualizar = catalogoActivo ? actualizarCatalogo : actualizarSolicitudes
    const channel = catalogoActivo ? "disponibilidad" : "solicitudes_vendedor"
    const detectarCambio = crearDetectorCambioSenalBodega()
    const suscripcion = suscribirSenalBodega(empresaId, channel, catalogoActivo ? undefined : usuario.uid, state => {
      setSenalDesconectada(!state.conectada)
      if (detectarCambio(state)) void actualizar()
    })
    suscripcionSenal.current = suscripcion
    const actualizarConReconectar = () => {
      suscripcion.reconectar()
      void actualizar()
    }
    const actualizarSiVisible = () => { if (document.visibilityState === "visible") actualizarConReconectar() }
    void actualizar()
    document.addEventListener("visibilitychange", actualizarSiVisible)
    const limpiarRecuperacionEnLinea = registrarRecuperacionEnLineaBodega(window, () => suscripcion.reconectar(), () => { void actualizar() })
    return () => {
      if (suscripcionSenal.current === suscripcion) suscripcionSenal.current = null
      suscripcion.cerrar()
      document.removeEventListener("visibilitychange", actualizarSiVisible)
      limpiarRecuperacionEnLinea()
    }
  }, [empresaId, tab, usuario.uid, actualizarCatalogo, actualizarSolicitudes])
  useEffect(() => {
    if (tab !== "agenda") return
    const actualizarSiVisible = () => { if (document.visibilityState === "visible") void actualizarAgenda(undefined, true) }
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
      await Promise.all([actualizarAgenda(), actualizarSolicitudesConReconectar()])
      setTab("solicitudes")
    } catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setProcesandoAgenda("") }
  }

  const confirmarSolicitud = async (solicitud: SolicitudVentaBodegaDTO) => {
    if (guardiaEnvio.current.activo) return
    const metodoPendiente = (["efectivo", "transferencia", "pendiente"] as const).find(method => comandosVentaPendientes.current.has(`${solicitud.solicitudId}:${method}`))
    const metodoPago = metodoPendiente ?? metodosPago[solicitud.solicitudId] ?? METODO_PAGO_BODEGA_PREDETERMINADO
    const key = `${solicitud.solicitudId}:${metodoPago}`
    const comandoPendiente = comandosVentaPendientes.current.get(key)
    const montoRecibidoCOP = montosRecibidos[solicitud.solicitudId]
    if (!comandoPendiente && metodoPago === "efectivo" && calcularCambioEfectivoBodega(solicitud.totalCOP, montoRecibidoCOP ?? Number.NaN) === null) {
      setError("Ingresa un valor recibido entero igual o mayor al total aprobado."); return
    }
    setEnviando(true); setError("")
    await guardiaEnvio.current.ejecutar(async () => { try {
      const envelope = comandoPendiente ?? construirConfirmacionVentaBodega({
        clienteId: solicitud.clienteId, solicitudId: solicitud.solicitudId, metodoPago,
        ...(metodoPago === "efectivo" ? { montoRecibidoCOP } : {}),
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
    <div className="seller-workspace min-h-screen bg-background text-foreground lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/60 bg-card lg:flex">
        <div className="flex h-18 items-center gap-3 border-b border-border/60 px-6"><Store className="size-6 text-primary" /><div><p className="font-bold tracking-tight">Dusema POS</p><p className="text-[10px] uppercase tracking-[.16em] text-muted-foreground">Espacio de ventas</p></div></div>
        <nav aria-label="Navegación del vendedor" className="flex-1 space-y-1 p-3 pt-6">{sellerTabs.map(item => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)} className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors", tab === item.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/50")}><item.icon className="size-[18px] shrink-0" />{item.label}</button>)}</nav>
        <div className="m-4 rounded-xl bg-muted/40 p-4"><p className="text-sm font-semibold">{usuario.nombre}</p><p className="mt-1 text-xs text-muted-foreground">Vendedor</p></div>
      </aside>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground"><Store className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-primary">Tu espacio de ventas</p><p className="max-w-[45vw] truncate font-semibold tracking-tight sm:max-w-md">{branding.nombreVisible}</p></div></div>
          <div className="flex items-center gap-2"><span className={cn("rounded-full px-3 py-1 text-xs font-semibold", turno ? "bg-emerald-400/15 text-emerald-700 dark:text-emerald-300" : "bg-muted/40 text-muted-foreground")}>{turno ? "Turno abierto" : "Sin turno"}</span><button aria-label="Cerrar sesión" onClick={onLogout} className="rounded-xl border border-border/70 p-2 text-foreground hover:bg-muted/50"><LogOut className="h-4 w-4" /></button></div>
        </div>
      </header>

      <main className="@container mx-auto max-w-[1440px] px-4 pt-6 pb-44 sm:px-6 lg:px-8 lg:pt-8 lg:pb-10">
        <FcmManagerWrapper />
        {error && <div role="alert" className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">{error}</div>}
        {senalDesconectada && <div role="status" className="mb-4 rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">La sincronización está temporalmente desconectada; los datos pueden estar desactualizados. Usa Actualizar o vuelve a conectar para validar el estado vigente.</div>}
      {resultado && "ventaId" in resultado && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4"><CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700 dark:text-emerald-300" /><div><p className="font-semibold">Venta confirmada</p><p className="text-sm text-emerald-900 dark:text-emerald-100/80">Referencia {resultado.ventaId} · {money(resultado.total)} · {resultado.metodoPago}</p>{resultado.estado === "pendiente" && <p className="mt-1 text-xs text-amber-900 dark:text-amber-100">Quedó pendiente de pago · saldo {money(resultado.saldoPendienteCOP ?? resultado.total)}.</p>}{resultado.montoRecibidoCOP !== undefined && <p className="mt-1 text-xs text-emerald-900 dark:text-emerald-100/70">Recibido {money(resultado.montoRecibidoCOP)} · cambio {money(resultado.cambioCOP ?? 0)}{resultado.turnoId ? ` · turno ${resultado.turnoId}` : " · efectivo sin turno"}</p>}</div><button className="ml-auto text-xs text-emerald-800 dark:text-emerald-200" onClick={() => setResultado(null)}>Cerrar</button></div>}
        {cargando ? <div className="grid min-h-[50vh] place-items-center"><RefreshCw className="h-7 w-7 animate-spin text-primary" /></div> : tab === "venta" ? (
          <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="@container/catalog min-w-0">
              <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-primary">Solicitud de venta</p><h1 className="mt-1 text-2xl font-bold">Prepara una solicitud</h1><p className="mt-1 text-sm text-muted-foreground">El servidor resuelve cliente, presentaciones, precios y total. La venta queda pendiente hasta que administración la apruebe.</p><p className="mt-1 text-xs text-muted-foreground">Disponibilidad informativa; el servidor revalida el stock antes de aceptar.</p></div><button onClick={() => void actualizarCatalogoConReconectar()} className="shrink-0 rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground">Actualizar</button></div>
              <label className="mb-4 flex items-center gap-2 rounded-xl border border-border/70 bg-muted/40 px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto o presentación" className="h-11 w-full bg-transparent text-sm outline-none" /></label>
              <div className="grid gap-3 @sm/catalog:grid-cols-2 @3xl/catalog:grid-cols-3">{filtrado.map(item => <button key={item.presentacionId} onClick={() => agregar(item)} className="rounded-2xl border border-border/70 bg-card p-5 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"><div className="mb-3 flex items-start justify-between gap-3"><Package className="h-5 w-5 text-primary" /><span className="text-lg font-bold text-amber-800 dark:text-amber-200">{money(item.precioCOP)}</span></div><p className="font-semibold">{item.productoNombre}</p><p className="mt-1 text-sm text-muted-foreground">{item.presentacionNombre} · {item.factorUnidadBase} {item.unidadBase ?? "unidades"}</p><p className="mt-3 text-xs text-muted-foreground">Disponibles: {item.maximoPresentacionesVendibles ?? "por validar"}</p></button>)}</div>
              {filtrado.length === 0 && <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">No hay presentaciones activas para mostrar.</div>}
            </section>
            <aside id="seller-cart" className="h-fit scroll-mt-24 rounded-2xl border border-border/70 bg-card p-5 shadow-xs @4xl:sticky @4xl:top-24">
              <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold"><ShoppingCart className="h-5 w-5 text-primary" /> Resumen</h2><span className="text-xs text-muted-foreground">{carrito.length}/50 líneas</span></div>
              <fieldset className="mb-4"><legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Tipo de atención</legend><div className="grid grid-cols-3 gap-2"><button type="button" aria-pressed={tipoPedido === "venta"} onClick={() => setTipoPedido("venta")} className={cn("rounded-lg border px-2 py-2 text-xs font-semibold", tipoPedido === "venta" ? "border-primary bg-primary text-primary-foreground" : "border-border/70 text-foreground")}>Venta de hoy</button><button type="button" aria-pressed={tipoPedido === "hoy"} onClick={() => setTipoPedido("hoy")} className={cn("rounded-lg border px-2 py-2 text-xs font-semibold", tipoPedido === "hoy" ? "border-primary bg-primary text-primary-foreground" : "border-border/70 text-foreground")}>Pedido para hoy</button><button type="button" aria-pressed={tipoPedido === "agendar"} onClick={() => setTipoPedido("agendar")} className={cn("rounded-lg border px-2 py-2 text-xs font-semibold", tipoPedido === "agendar" ? "border-primary bg-primary text-primary-foreground" : "border-border/70 text-foreground")}>Agendar entrega</button></div></fieldset>
              {tipoPedido !== "venta" && <div className="mb-4 space-y-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3">{tipoPedido === "hoy" ? <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Pedido para hoy · {hoy}</p> : <label className="block text-sm">Fecha de entrega preferida<input required type="date" min={manana} value={fechaAgendadaVigente} onChange={event => setFechaAgendada(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-foreground" /></label>}<div className="grid grid-cols-2 gap-2"><label className="text-xs text-foreground">Desde (opcional)<input type="time" step={900} value={franjaDesde} onChange={event => setFranjaDesde(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border/70 bg-background px-2 text-foreground" /></label><label className="text-xs text-foreground">Hasta (opcional)<input type="time" step={900} value={franjaHasta} onChange={event => setFranjaHasta(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border/70 bg-background px-2 text-foreground" /></label></div><p className="text-[11px] text-muted-foreground">La franja es una preferencia. Administración debe aceptar para retener stock; no se confirma precio, venta ni entrega exacta.</p></div>}
              <label htmlFor="seller-client" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cliente</label><div className="mt-2 flex gap-2"><select id="seller-client" value={clienteId} onChange={e => setClienteId(e.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-border/70 bg-background px-3 text-sm"><option value="">Seleccionar cliente</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} · {c.cedula}</option>)}</select><button aria-label="Crear cliente" onClick={() => setMostrarCliente(true)} className="rounded-xl bg-muted/60 px-3 hover:bg-muted"><UserPlus className="h-4 w-4" /></button></div>
              {clienteId && <section aria-label="Cuenta pendiente del cliente" className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div aria-live="polite">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">Saldo de pedidos anteriores</p>
                    {cargandoCarteraPedido ? <p role="status" className="mt-1 text-sm text-muted-foreground">Actualizando saldo…</p>
                      : errorCarteraPedido ? <p role="alert" className="mt-1 text-sm text-rose-800 dark:text-rose-200">No se pudo consultar la cartera.</p>
                        : carteraClientePedido?.clienteId === clienteId && <p className="mt-1 text-lg font-bold tabular-nums">{money(carteraClientePedido.saldoPendienteCOP)} <span className="text-xs font-normal text-muted-foreground">· {carteraClientePedido.facturas.length} facturas pendientes</span></p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {errorCarteraPedido
                      ? <button type="button" disabled={cargandoCarteraPedido} onClick={() => void actualizarCarteraClientePedido(clienteId)} className="min-h-10 rounded-lg border border-border/70 px-3 text-xs font-semibold disabled:opacity-50">Reintentar</button>
                      : <button type="button" disabled={cargandoCarteraPedido} onClick={() => void actualizarCarteraClientePedido(clienteId)} className="flex min-h-10 items-center gap-2 rounded-lg border border-border/70 px-3 text-xs font-semibold disabled:opacity-50"><RefreshCw className={cn("size-3.5", cargandoCarteraPedido && "animate-spin")} />Actualizar saldo</button>}
                    <button type="button" onClick={() => setTab("clientes")} className="flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">
                      <CircleDollarSign className="size-4" /> Ver facturas y registrar abono
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Si el cliente paga una deuda anterior al hacer este pedido, registra el abono en su cuenta. Este pedido nuevo no aplica pagos automáticamente.</p>
              </section>}
              <div className="my-4 space-y-3">{carrito.length === 0 && <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center"><ShoppingCart className="mx-auto mb-3 size-7 text-muted-foreground/50" /><p className="text-sm font-medium">Tu pedido empieza aquí</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Selecciona un cliente y añade productos del catálogo.</p></div>}{carrito.map(linea => <div key={linea.presentacionId} className="rounded-xl bg-muted/40 p-3"><div className="flex justify-between gap-3"><div><p className="text-sm font-semibold">{linea.productoNombre}</p><p className="text-xs text-muted-foreground">{linea.presentacionNombre}</p></div><p className="text-sm font-semibold">{money(linea.precioCOP * linea.cantidad)}</p></div><div className="mt-2 flex items-center gap-2"><button aria-label={`Reducir cantidad de ${linea.presentacionNombre}`} onClick={() => cantidad(linea.presentacionId, linea.cantidad - 1)} className="size-11 shrink-0 rounded-xl bg-muted/60">−</button><input aria-label={`Cantidad de ${linea.presentacionNombre}`} type="number" min={1} value={linea.cantidad} onChange={e => cantidad(linea.presentacionId, Number(e.target.value))} className="h-11 w-16 rounded-xl bg-background text-center" /><button aria-label={`Aumentar cantidad de ${linea.presentacionNombre}`} onClick={() => cantidad(linea.presentacionId, linea.cantidad + 1)} className="size-11 shrink-0 rounded-xl bg-muted/60">+</button></div></div>)}</div>
              <div className="border-t border-border/70 pt-4"><div className="flex justify-between text-sm text-muted-foreground"><span>{tipoPedido === "venta" ? "Total visual estimado" : "Precio de referencia de hoy"}</span><strong className="text-lg text-foreground">{money(estimado)}</strong></div><p className="mt-1 text-[11px] text-muted-foreground">{tipoPedido === "venta" ? "El total autoritativo llegará con la respuesta del servidor." : "El precio y el stock se volverán a resolver cuando se atienda el pedido."}</p></div>
              <button disabled={enviando || carrito.length === 0 || !clienteId || (tipoPedido === "agendar" && !fechaAgendadaVigente) || (!!franjaDesde !== !!franjaHasta)} onClick={() => void (tipoPedido === "venta" ? enviarSolicitud() : enviarProgramacion())} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">{tipoPedido === "venta" ? <ClipboardList className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}{enviando ? "Enviando…" : tipoPedido === "venta" ? "Enviar solicitud de venta" : tipoPedido === "hoy" ? "Enviar pedido para hoy" : "Agendar entrega"}</button>
            </aside>
          </div>
        ) : tab === "solicitudes" ? <SolicitudesView solicitudes={solicitudes} metodosPago={metodosPago} setMetodoPago={(id, method) => setMetodosPago(current => ({ ...current, [id]: method }))} montosRecibidos={montosRecibidos} setMontoRecibido={(id, value) => setMontosRecibidos(current => ({ ...current, [id]: value }))} tieneConfirmacionPendiente={solicitudId => (["efectivo", "transferencia", "pendiente"] as const).some(method => comandosVentaPendientes.current.has(`${solicitudId}:${method}`))} enviando={enviando} turnoAbierto={!!turno} onConfirmar={solicitud => void confirmarSolicitud(solicitud)} onCancelar={solicitud => void cancelarSolicitud(solicitud)} onActualizar={() => void actualizarSolicitudesConReconectar()} onCrearOtra={() => setTab("venta")} /> : tab === "agenda" ? <BodegaAgendaVendedor programaciones={agenda} hoy={hoy} cargando={cargandoAgenda} cargandoMas={cargandoMasAgenda} hayMas={!!nextCursorAgenda} procesando={procesandoAgenda} onActualizar={() => void actualizarAgenda()} onCargarMas={() => void actualizarAgenda(nextCursorAgenda)} onCancelar={item => void cancelarProgramacion(item)} onConvertir={item => void convertirProgramacion(item)} /> : tab === "clientes" ? <ClientesView clientes={clientes} clienteInicial={clienteId} onCrear={() => setMostrarCliente(true)} /> : <HistorialView ventas={ventas} />}
      </main>

      {tab === "venta" && carrito.length > 0 && <a href="#seller-cart" className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-xl lg:hidden"><span className="flex items-center gap-2"><ShoppingCart className="size-5" />Ver pedido ({carrito.length})</span><span className="tabular-nums">{money(estimado)}</span></a>}
      <nav aria-label="Navegación móvil de ventas" className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"><div className="mx-auto flex h-18 max-w-2xl">{sellerTabs.map(item => <button key={item.id} type="button" aria-pressed={tab === item.id} onClick={() => setTab(item.id)} className={cn("flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 text-[10px] font-semibold", tab === item.id ? "text-primary" : "text-muted-foreground")}><span className={cn("rounded-xl px-4 py-1.5", tab === item.id && "bg-primary/10")}><item.icon className="size-5" /></span>{item.label}</button>)}</div></nav>
      {mostrarCliente && <CrearClienteModal onCerrar={() => setMostrarCliente(false)} onCreado={cliente => { setClientes(actual => [...actual, cliente].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))); setClienteId(cliente.id); setMostrarCliente(false) }} />}
    </div>
  )
}

function SolicitudesView({ solicitudes, metodosPago, setMetodoPago, montosRecibidos, setMontoRecibido, tieneConfirmacionPendiente, enviando, turnoAbierto, onConfirmar, onCancelar, onActualizar, onCrearOtra }: {
  solicitudes: SolicitudVentaBodegaDTO[]
  metodosPago: Record<string, MetodoPagoBodega>
  setMetodoPago(id: string, method: MetodoPagoBodega): void
  montosRecibidos: Record<string, number | undefined>
  setMontoRecibido(id: string, value: number | undefined): void
  tieneConfirmacionPendiente(solicitudId: string): boolean
  enviando: boolean
  turnoAbierto: boolean
  onConfirmar(solicitud: SolicitudVentaBodegaDTO): void
  onCancelar(solicitud: SolicitudVentaBodegaDTO): void
  onActualizar(): void
  onCrearOtra(): void
}) {
  return <section>
    <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-primary">Aprobación previa</p><h1 className="mt-1 text-2xl font-bold">Mis solicitudes</h1><p className="mt-1 text-sm text-muted-foreground">Después de aprobada y entregada, confirma el pago o déjala pendiente.</p><p className="mt-1 text-xs text-muted-foreground">Se actualizan automáticamente mientras esta vista está abierta.</p></div><div className="flex shrink-0 gap-2"><button onClick={onActualizar} className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground">Actualizar</button><button onClick={onCrearOtra} className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Nueva</button></div></div>
    <div className="space-y-3">{solicitudes.map(solicitud => {
      const metodo = metodosPago[solicitud.solicitudId] ?? METODO_PAGO_BODEGA_PREDETERMINADO
      const cancelable = solicitud.estado === "PENDIENTE_APROBACION" || solicitud.estado === "APROBADA"
      const confirmacionPendiente = tieneConfirmacionPendiente(solicitud.solicitudId)
      const recuperarConfirmacion = solicitud.estado === "EJECUTADA" && confirmacionPendiente
      const montoRecibidoCOP = montosRecibidos[solicitud.solicitudId]
      const cambioCOP = calcularCambioEfectivoBodega(solicitud.totalCOP, montoRecibidoCOP ?? Number.NaN)
      return <article key={solicitud.solicitudId} className="rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold">{solicitud.cliente?.nombre || "Cliente no disponible"}</p><p className="mt-1 text-xs text-muted-foreground">Solicitud · {formatearReferenciaSolicitud(solicitud.solicitudId)}</p></div><span className={cn("shrink-0 rounded-full px-2 py-1 text-xs font-bold", solicitud.estado === "APROBADA" ? "bg-emerald-400/15 text-emerald-700 dark:text-emerald-300" : solicitud.estado === "PENDIENTE_APROBACION" ? "bg-amber-300/15 text-amber-800 dark:text-amber-200" : "bg-muted/60 text-foreground")}>{solicitud.estado.replaceAll("_", " ")}</span></div>
        <div className="my-3 space-y-2">{solicitud.lineas.map((linea, index) => <div key={`${linea.presentacionId}-${index}`} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{linea.cantidad} × {linea.presentacionNombre} ({linea.factorUnidadBase} {linea.unidadBase})</span><span className="shrink-0">{money(linea.subtotalCOP)}</span></div>)}</div>
        <div className="flex justify-between border-t border-border/70 pt-3"><span className="text-sm text-muted-foreground">Total resuelto por servidor</span><strong>{money(solicitud.totalCOP)}</strong></div>
        {solicitud.estado === "PENDIENTE_APROBACION" && <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">Esperando revisión de administración. Aún no se creó una venta ni se descontó inventario.</p>}
        {solicitud.estado === "APROBADA" && <div className="mt-3 space-y-3"><p className="text-xs text-emerald-800 dark:text-emerald-200">Aprobada por administración; vence {formatearFechaBodega(solicitud.aprobacion?.expiraEn)}. El inventario se revisa al confirmar.</p><div className="grid grid-cols-3 gap-2">{(["efectivo", "transferencia", "pendiente"] as const).map(method => <button key={method} disabled={confirmacionPendiente} onClick={() => setMetodoPago(solicitud.solicitudId, method)} className={cn("rounded-xl border px-2 py-2 text-sm font-semibold capitalize", metodo === method ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-muted/40", confirmacionPendiente && "cursor-not-allowed opacity-50")}>{method === "pendiente" ? "Pendiente de pago" : method}</button>)}</div>{metodo === "efectivo" && <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3"><label className="text-xs font-semibold text-amber-900 dark:text-amber-100">Efectivo recibido<input aria-label="Efectivo recibido" type="number" min={solicitud.totalCOP} step={1} disabled={confirmacionPendiente} value={montoRecibidoCOP ?? ""} onChange={event => setMontoRecibido(solicitud.solicitudId, event.target.value === "" ? undefined : Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-border/70 bg-background px-3 text-foreground" /></label>{cambioCOP !== null ? <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">Cambio estimado: {money(cambioCOP)}</p> : <p className="mt-2 text-xs text-amber-100/70">Debe ser un valor entero igual o mayor a {money(solicitud.totalCOP)}.</p>}{!turnoAbierto && <p className="mt-2 text-[11px] text-muted-foreground">Esta venta quedará sin turno y se revisará por venta y fecha.</p>}</div>}{metodo === "pendiente" && <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs text-amber-900 dark:text-amber-100">Se registra la entrega, se descuenta el inventario y el saldo queda pendiente en la cuenta del cliente.</p>}<button disabled={enviando || (metodo === "efectivo" && cambioCOP === null)} onClick={() => onConfirmar(solicitud)} className="h-11 w-full rounded-xl bg-emerald-400 font-bold text-primary-foreground disabled:opacity-40">{enviando ? "Confirmando…" : confirmacionPendiente ? "Reintentar confirmación" : metodo === "pendiente" ? "Confirmar entrega pendiente de pago" : "Confirmar venta pagada"}</button></div>}
        {solicitud.estado === "EJECUTADA" && <div className="mt-3 space-y-2"><p className="text-xs text-emerald-800 dark:text-emerald-200">Entrega registrada. El inventario y la forma de pago seleccionada fueron procesados.</p>{recuperarConfirmacion && <button disabled={enviando} onClick={() => onConfirmar(solicitud)} className="h-11 w-full rounded-xl border border-emerald-300/40 px-3 text-sm font-semibold text-emerald-800 dark:text-emerald-200 disabled:opacity-50">{enviando ? "Recuperando…" : "Recuperar confirmación"}</button>}</div>}
        {cancelable && <button disabled={enviando} onClick={() => onCancelar(solicitud)} className="mt-3 w-full rounded-xl border border-border/70 px-3 py-2 text-sm text-foreground disabled:opacity-50">Cancelar solicitud</button>}
      </article>
    })}{solicitudes.length === 0 && <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">Todavía no tienes solicitudes. Puedes preparar una nueva.</p>}</div>
  </section>
}

function ClientesView({ clientes, clienteInicial, onCrear }: { clientes: ClienteVendedorDTO[]; clienteInicial: string; onCrear(): void }) {
  const [seleccionado, setSeleccionado] = useState(clienteInicial)
  const [cartera, setCartera] = useState<CarteraClienteBodegaDTO | null>(null)
  const [cargandoCartera, setCargandoCartera] = useState(false)
  const [guardandoAbono, setGuardandoAbono] = useState("")
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [metodos, setMetodos] = useState<Record<string, "efectivo" | "transferencia">>({})
  const [fechas, setFechas] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const comandosAbonoPendientes = useRef(new Map<string, ComandoAbonoVentaBodega>())
  const consultaCarteraId = useRef(0)
  const cargarCartera = useCallback(async (clienteId: string) => {
    const consultaId = ++consultaCarteraId.current
    setSeleccionado(clienteId); setCartera(null); setCargandoCartera(true); setError("")
    try {
      const carteraActual = await consultarCarteraClienteBodega(clienteId)
      if (consultaId === consultaCarteraId.current) setCartera(carteraActual)
    } catch (cause) {
      if (consultaId === consultaCarteraId.current) { setCartera(null); setError(mensajeErrorBodega(cause)) }
    } finally {
      if (consultaId === consultaCarteraId.current) setCargandoCartera(false)
    }
  }, [])
  useEffect(() => {
    if (clienteInicial) void cargarCartera(clienteInicial)
  }, [clienteInicial, cargarCartera])
  const registrarAbono = async (factura: CarteraClienteBodegaDTO["facturas"][number]) => {
    const montoCOP = Number(montos[factura.ventaId] ?? "")
    if (!Number.isSafeInteger(montoCOP) || montoCOP <= 0 || montoCOP > factura.saldoPendienteCOP) {
      setError(`Ingresa un abono entero entre $1 y ${money(factura.saldoPendienteCOP)}.`); return
    }
    const metodoPago = metodos[factura.ventaId] ?? "transferencia"
    const fechaCompromisoPagoLocal = fechas[factura.ventaId] ?? ""
    const key = `${factura.ventaId}:${montoCOP}:${metodoPago}:${fechaCompromisoPagoLocal}`
    const command = comandosAbonoPendientes.current.get(key) ?? construirComandoAbonoVentaBodega({
      ventaId: factura.ventaId,
      montoCOP,
      metodoPago,
      ...(fechaCompromisoPagoLocal ? { fechaCompromisoPagoLocal } : {}),
    })
    comandosAbonoPendientes.current.set(key, command)
    setGuardandoAbono(factura.ventaId); setError("")
    try {
      await registrarAbonoVentaBodega(command)
      comandosAbonoPendientes.current.delete(key)
      setMontos(current => ({ ...current, [factura.ventaId]: "" }))
      await cargarCartera(seleccionado)
    } catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setGuardandoAbono("") }
  }
  return <section><div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-primary">Directorio comercial</p><h1 className="mt-1 text-2xl font-bold">Clientes activos</h1><p className="mt-1 text-sm text-muted-foreground">Consulta las facturas pendientes y registra los abonos recibidos.</p></div><button onClick={onCrear} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><Plus className="h-4 w-4" />Nuevo</button></div>
    {error && <p role="alert" className="mb-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-800 dark:text-rose-200">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2">{clientes.map(c => <article key={c.id} className="rounded-2xl border border-border/70 bg-card p-4"><p className="font-semibold">{c.nombre}</p><p className="mt-1 text-sm text-muted-foreground">{c.tipoDocumento ?? "Documento"} {c.cedula}</p><p className="mt-2 text-sm text-foreground">{c.telefono}</p>{c.barrioZona && <p className="mt-1 text-xs text-muted-foreground">{c.barrioZona}</p>}<div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3"><p className="text-xs text-muted-foreground">Saldo pendiente <strong className="ml-1 text-foreground">{money(seleccionado === c.id && cartera ? cartera.saldoPendienteCOP : c.saldoPendienteCOP)}</strong></p><button type="button" disabled={cargandoCartera} onClick={() => void cargarCartera(c.id)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">{seleccionado === c.id ? "Actualizar cuenta" : "Ver cuenta"}</button></div></article>)}</div>
    {seleccionado && <section className="mt-5 rounded-2xl border border-border/70 bg-card p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-primary">Cuenta por cobrar</p><h2 className="mt-1 text-lg font-bold">{clientes.find(client => client.id === seleccionado)?.nombre ?? "Cliente"}</h2></div><strong className="text-right tabular-nums">{money(cartera?.saldoPendienteCOP ?? 0)}</strong></div>{cargandoCartera && <p role="status" className="mt-4 text-sm text-muted-foreground">Consultando saldos…</p>}{!cargandoCartera && cartera?.facturas.map(factura => <article key={factura.ventaId} className="mt-4 rounded-xl border border-border/60 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">Factura {factura.ventaId.slice(-10)}</p><p className="mt-1 text-xs text-muted-foreground">Registrada {formatearFechaBodega(factura.fecha)}</p>{factura.fechaCompromisoPagoLocal && <p className="mt-1 text-xs text-muted-foreground">Compromiso actual: {factura.fechaCompromisoPagoLocal}</p>}</div><div className="text-right text-sm"><p>Total {money(factura.totalCOP)}</p><p>Abonado {money(factura.totalAbonadoCOP)}</p><p className="font-bold">Saldo {money(factura.saldoPendienteCOP)}</p></div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Abono recibido<input aria-label={`Abono para factura ${factura.ventaId}`} type="number" min={1} max={factura.saldoPendienteCOP} step={1} value={montos[factura.ventaId] ?? ""} onChange={event => setMontos(current => ({ ...current, [factura.ventaId]: event.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label><label className="text-xs font-semibold">Medio de pago<select aria-label={`Medio de pago factura ${factura.ventaId}`} value={metodos[factura.ventaId] ?? "transferencia"} onChange={event => setMetodos(current => ({ ...current, [factura.ventaId]: event.target.value as "efectivo" | "transferencia" }))} className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option></select></label><label className="text-xs font-semibold sm:col-span-2">Compromiso para el siguiente pago (opcional)<input aria-label={`Compromiso de pago factura ${factura.ventaId}`} type="date" value={fechas[factura.ventaId] ?? ""} onChange={event => setFechas(current => ({ ...current, [factura.ventaId]: event.target.value }))} className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" /></label></div><button type="button" disabled={guardandoAbono === factura.ventaId || !montos[factura.ventaId]} onClick={() => void registrarAbono(factura)} className="mt-3 h-11 w-full rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{guardandoAbono === factura.ventaId ? "Registrando abono…" : "Registrar abono"}</button></article>)}{!cargandoCartera && cartera?.facturas.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Este cliente no tiene facturas pendientes de pago.</p>}</section>}
    </section>
}

function HistorialView({ ventas }: { ventas: VentaVendedorDTO[] }) {
  return <section><p className="text-xs font-bold uppercase tracking-[.22em] text-primary">Trazabilidad personal</p><h1 className="mt-1 text-2xl font-bold">Mis ventas</h1><div className="mt-4 space-y-3">{ventas.map(v => <article key={v.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-4"><div><p className="font-semibold">{v.cliente ?? "Cliente"}</p><p className="text-xs text-muted-foreground">{v.id} · {v.metodoPago}{v.metodoPago === "efectivo" && v.turnoId === null ? " · efectivo sin turno" : ""}</p>{v.estado === "pendiente" && <p className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-200">Saldo pendiente {money(v.saldoPendienteCOP ?? null)}{v.fechaCompromisoPagoLocal ? ` · compromiso ${v.fechaCompromisoPagoLocal}` : ""}</p>}{v.metodoPago === "efectivo" && v.montoRecibidoCOP !== null && <p className="mt-1 text-xs text-muted-foreground">Recibido {money(v.montoRecibidoCOP)} · cambio {money(v.cambioCOP)}</p>}</div><div className="text-right"><p className="font-bold text-emerald-700 dark:text-emerald-300">{money(v.total)}</p><p className="text-[11px] text-muted-foreground">{formatearFechaBodega(v.fecha)}</p></div></article>)}{ventas.length === 0 && <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">Todavía no tienes ventas registradas.</p>}</div></section>
}

function CrearClienteModal({ onCerrar, onCreado }: { onCerrar(): void; onCreado(cliente: ClienteVendedorDTO): void }) {
  const [form, setForm] = useState({ nombre: "", cedula: "", telefono: "", tipoDocumento: "NIT" as "NIT" | "CC", contacto: "", direccion: "", barrioZona: "" })
  const [guardando, setGuardando] = useState(false); const [error, setError] = useState("")
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (guardando) return; setGuardando(true); setError(""); try { const opcionales = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== "")); onCreado(await crearClienteVendedor(opcionales as typeof form)) } catch (e) { setError(mensajeErrorBodega(e)) } finally { setGuardando(false) } }
  return <div className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 sm:place-items-center sm:p-4"><form onSubmit={submit} className="max-h-[92dvh] w-full max-w-lg overflow-auto rounded-t-3xl border border-border/70 bg-card p-5 sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Alta comercial</p><h2 className="text-xl font-bold">Nuevo cliente</h2></div><button type="button" onClick={onCerrar} className="text-sm text-muted-foreground">Cancelar</button></div>{error && <p className="mb-3 rounded-xl bg-rose-400/10 p-3 text-sm text-rose-800 dark:text-rose-200">{error}</p>}<div className="grid gap-3 sm:grid-cols-2"><Field label="Nombre comercial *" value={form.nombre} onChange={nombre => setForm({ ...form, nombre })} /><Field label="Documento *" value={form.cedula} onChange={cedula => setForm({ ...form, cedula })} /><Field label="Teléfono *" value={form.telefono} onChange={telefono => setForm({ ...form, telefono })} /><label className="text-sm text-foreground">Tipo<select value={form.tipoDocumento} onChange={e => setForm({ ...form, tipoDocumento: e.target.value as "NIT" | "CC" })} className="mt-1 h-11 w-full rounded-xl border border-border/70 bg-background px-3"><option>NIT</option><option>CC</option></select></label><Field label="Contacto" value={form.contacto} onChange={contacto => setForm({ ...form, contacto })} /><Field label="Dirección" value={form.direccion} onChange={direccion => setForm({ ...form, direccion })} /><Field label="Barrio / zona" value={form.barrioZona} onChange={barrioZona => setForm({ ...form, barrioZona })} /></div><button disabled={guardando} className="mt-5 h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50">{guardando ? "Guardando…" : "Crear cliente"}</button></form></div>
}

function Field({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) { return <label className="text-sm text-foreground">{label}<input required={label.endsWith("*")} value={value} onChange={e => onChange(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border/70 bg-background px-3 outline-none focus:border-amber-300/60" /></label> }
