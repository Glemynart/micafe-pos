"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  ReceiptText,
  Search,
  TrendingDown,
  TrendingUp,
  UserRound,
  Wallet,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/demo-data"
import {
  calcularVentasTurno,
  suscribirHistorialTurnos,
  type Turno,
} from "@/lib/turnos-service"
import { suscribirEgresosPorTurno, type Egreso } from "@/lib/egresos-service"
import { suscribirUsuarios, type Usuario } from "@/lib/permisos-service"
import { crearIndiceNombres, resolverNombreActor } from "@/lib/actor-display"

type FiltroTurno = "todos" | "abierto" | "cerrado" | "alerta"
type ResumenVentas = Awaited<ReturnType<typeof calcularVentasTurno>>

function toDate(value: { toDate?: () => Date } | Date | null | undefined): Date | null {
  if (value instanceof Date) return value
  return value?.toDate?.() ?? null
}

function formatDateTime(value: { toDate?: () => Date } | Date | null | undefined): string {
  const date = toDate(value)
  return date
    ? date.toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "No disponible"
}

function diferenciaEstado(diferencia: number): "faltante" | "sobrante" | "cuadrado" {
  if (diferencia < 0) return "faltante"
  if (diferencia > 0) return "sobrante"
  return "cuadrado"
}

function diferenciaTexto(diferencia: number): string {
  const estado = diferenciaEstado(diferencia)
  if (estado === "faltante") return "Faltante"
  if (estado === "sobrante") return "Sobrante"
  return "Cuadrado"
}

function formatEgresoDate(value: Egreso["fecha"]): string {
  return formatDateTime(value as unknown as { toDate?: () => Date } | Date)
}

export default function TurnosPage() {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [filtro, setFiltro] = useState<FiltroTurno>("todos")
  const [seleccionado, setSeleccionado] = useState<Turno | null>(null)
  const [ventasDetalle, setVentasDetalle] = useState<ResumenVentas | null>(null)
  const [egresosDetalle, setEgresosDetalle] = useState<Egreso[]>([])
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = suscribirHistorialTurnos((data) => {
      setTurnos(data)
      setCargando(false)
    })
    return unsubscribe
  }, [])

  useEffect(() => suscribirUsuarios(setUsuarios), [])

  useEffect(() => {
    let activo = true
    if (!seleccionado) {
      setVentasDetalle(null)
      setEgresosDetalle([])
      setErrorDetalle(null)
      return () => { activo = false }
    }

    setCargandoDetalle(true)
    setVentasDetalle(null)
    setEgresosDetalle([])
    setErrorDetalle(null)

    const unsubscribeEgresos = suscribirEgresosPorTurno(seleccionado.id, (egresos) => {
      if (activo) setEgresosDetalle(egresos)
    })

    void calcularVentasTurno(seleccionado.id)
      .then((ventas) => {
        if (activo) setVentasDetalle(ventas)
      })
      .catch(() => {
        if (activo) setErrorDetalle("No fue posible cargar las ventas de este turno.")
      })
      .finally(() => {
        if (activo) setCargandoDetalle(false)
      })

    return () => {
      activo = false
      unsubscribeEgresos()
    }
  }, [seleccionado])

  const nombres = useMemo(() => crearIndiceNombres(usuarios), [usuarios])
  const abiertos = useMemo(() => turnos.filter((turno) => turno.estado === "abierto"), [turnos])
  const cerrados = useMemo(() => turnos.filter((turno) => turno.estado !== "abierto"), [turnos])
  const turnosConAlerta = useMemo(
    () => cerrados.filter((turno) => (turno.diferenciaEfectivo || 0) !== 0),
    [cerrados],
  )
  const totalFaltantes = useMemo(
    () => cerrados.reduce((total, turno) => total + Math.max(0, -(turno.diferenciaEfectivo || 0)), 0),
    [cerrados],
  )
  const totalSobrantes = useMemo(
    () => cerrados.reduce((total, turno) => total + Math.max(0, turno.diferenciaEfectivo || 0), 0),
    [cerrados],
  )

  const nombreCajero = (turno: Turno) =>
    resolverNombreActor(turno.cajeroId, turno.cajeroNombre, nombres)

  const turnosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es-CO")
    return turnos.filter((turno) => {
      const diferencia = turno.diferenciaEfectivo || 0
      const coincideFiltro =
        filtro === "todos" ||
        (filtro === "abierto" && turno.estado === "abierto") ||
        (filtro === "cerrado" && turno.estado !== "abierto") ||
        (filtro === "alerta" && turno.estado !== "abierto" && diferencia !== 0)
      const coincideBusqueda = !texto || [
        nombreCajero(turno),
        turno.cajeroId,
        turno.notasApertura,
        turno.notasCierre,
      ].some((valor) => valor?.toLocaleLowerCase("es-CO").includes(texto))
      return coincideFiltro && coincideBusqueda
    })
  }, [busqueda, filtro, nombres, turnos])

  if (cargando) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-white/20" />
    </div>
  )

  return (
    <div className="pb-4 space-y-4">
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Clock className="h-5 w-5 text-[#F9B207]" />
          Turnos y caja
        </h1>
        <p className="text-white/40 text-sm mt-1">Revisa quién abrió, cuánto debía entregar y qué ocurrió al cerrar.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4">
          <p className="text-[10px] font-bold text-emerald-300/70 uppercase tracking-wider">En curso</p>
          <p className="text-2xl font-black text-white mt-1">{abiertos.length}</p>
          <p className="text-[11px] text-white/40 mt-1">turnos abiertos</p>
        </div>
        <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Cerrados</p>
          <p className="text-2xl font-black text-white mt-1">{cerrados.length}</p>
          <p className="text-[11px] text-white/40 mt-1">en el historial visible</p>
        </div>
        <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4">
          <p className="text-[10px] font-bold text-red-300/70 uppercase tracking-wider">Faltantes</p>
          <p className="text-xl font-black text-red-300 mt-1">{formatCurrency(totalFaltantes)}</p>
          <p className="text-[11px] text-white/40 mt-1">{turnosConAlerta.filter((turno) => (turno.diferenciaEfectivo || 0) < 0).length} cierres</p>
        </div>
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4">
          <p className="text-[10px] font-bold text-amber-300/70 uppercase tracking-wider">Sobrantes</p>
          <p className="text-xl font-black text-amber-300 mt-1">{formatCurrency(totalSobrantes)}</p>
          <p className="text-[11px] text-white/40 mt-1">{turnosConAlerta.filter((turno) => (turno.diferenciaEfectivo || 0) > 0).length} cierres</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar por cajero o nota..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#F9B207]/50"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {([
            ["todos", "Todos"],
            ["abierto", "En curso"],
            ["cerrado", "Cerrados"],
            ["alerta", "Con diferencia"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFiltro(value)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold border transition-colors",
                filtro === value
                  ? "bg-[#F9B207]/15 border-[#F9B207]/50 text-[#F9B207]"
                  : "bg-white/5 border-white/10 text-white/50 hover:text-white/80",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {turnos.length === 0 ? (
        <div className="rounded-2xl bg-white/5 border border-white/10 py-12 text-center text-sm text-white/40">
          No hay turnos registrados.
        </div>
      ) : turnosFiltrados.length === 0 ? (
        <div className="rounded-2xl bg-white/5 border border-white/10 py-12 text-center text-sm text-white/40">
          No hay turnos que coincidan con el filtro.
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-white/35 uppercase tracking-widest">
            Mostrando {turnosFiltrados.length} de {turnos.length}
          </p>
          <div className="rounded-2xl bg-white/5 border border-white/10 divide-y divide-white/5 overflow-hidden">
            {turnosFiltrados.map((turno) => {
              const diferencia = turno.diferenciaEfectivo || 0
              const estado = diferenciaEstado(diferencia)
              const abierto = turno.estado === "abierto"
              return (
                <button
                  key={turno.id}
                  onClick={() => setSeleccionado(turno)}
                  className="w-full text-left px-4 py-4 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-[#F9B207] shrink-0" />
                        <p className="text-sm font-bold text-white truncate">{nombreCajero(turno)}</p>
                      </div>
                      <p className="text-[11px] text-white/40 mt-1">
                        Apertura: {formatDateTime(turno.fechaApertura)}
                        {!abierto && ` · Cierre: ${formatDateTime(turno.fechaCierre)}`}
                      </p>
                    </div>
                    <span className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold border",
                      abierto
                        ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30"
                        : estado === "faltante"
                          ? "text-red-300 bg-red-500/15 border-red-500/30"
                          : estado === "sobrante"
                            ? "text-amber-300 bg-amber-500/15 border-amber-500/30"
                            : "text-white/60 bg-white/5 border-white/10",
                    )}>
                      {abierto ? "ABIERTO" : diferenciaTexto(diferencia).toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 mt-3">
                    {[
                      { label: "Base", value: formatCurrency(turno.baseApertura || 0) },
                      { label: "Esperado", value: formatCurrency(turno.totalEsperadoEfectivo || 0) },
                      { label: "Contado", value: formatCurrency(turno.totalReportadoEfectivo || 0) },
                      { label: "Diferencia", value: formatCurrency(diferencia), alert: !abierto && diferencia !== 0 },
                    ].map((item) => (
                      <div key={item.label} className={cn("rounded-lg p-2", item.alert ? "bg-red-500/10" : "bg-white/5")}>
                        <p className="text-[9px] text-white/35 uppercase tracking-wide font-bold">{item.label}</p>
                        <p className={cn("text-[11px] font-black mt-0.5 tabular-nums", item.alert ? "text-red-300" : "text-white/75")}>
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3 text-[11px] text-white/40">
                    <span>{turno.totalEgresos ? `Gastos de caja: ${formatCurrency(turno.totalEgresos)}` : "Sin gastos de caja reportados"}</span>
                    <span className="inline-flex items-center gap-1 text-[#F9B207] font-bold">Ver detalle <ChevronRight className="h-3.5 w-3.5" /></span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {seleccionado && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center" onClick={() => setSeleccionado(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-[#0f1e35] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-white/35 uppercase tracking-widest">Detalle del turno</p>
                <h2 className="text-xl font-black text-white mt-1">{nombreCajero(seleccionado)}</h2>
                <p className="text-xs text-white/40 mt-1">{seleccionado.estado === "abierto" ? "Turno en curso" : "Turno cerrado"}</p>
              </div>
              <button onClick={() => setSeleccionado(null)} className="h-9 w-9 rounded-xl bg-white/5 flex items-center justify-center text-white/60 hover:text-white" aria-label="Cerrar detalle">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/5 p-3">
                <p className="text-[10px] text-white/35 uppercase font-bold">Apertura</p>
                <p className="text-xs font-semibold text-white/80 mt-1">{formatDateTime(seleccionado.fechaApertura)}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-3">
                <p className="text-[10px] text-white/35 uppercase font-bold">Cierre</p>
                <p className="text-xs font-semibold text-white/80 mt-1">{formatDateTime(seleccionado.fechaCierre)}</p>
              </div>
            </div>

            <section>
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="h-4 w-4 text-[#F9B207]" />
                <h3 className="text-sm font-bold text-white">Cuadre de caja</h3>
              </div>
              <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
                {[
                  ["Base de apertura", seleccionado.baseApertura || 0],
                  ["Ventas en efectivo", seleccionado.ventasEfectivo || 0],
                  ["Gastos de caja", seleccionado.totalEgresos || 0],
                  ["Efectivo esperado", seleccionado.totalEsperadoEfectivo || 0],
                  ["Efectivo contado", seleccionado.totalReportadoEfectivo || 0],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex items-center justify-between px-3 py-2.5 text-sm">
                    <span className="text-white/50">{label}</span>
                    <span className="font-bold text-white">{formatCurrency(Number(value))}</span>
                  </div>
                ))}
                <div className={cn("flex items-center justify-between px-3 py-3", seleccionado.estado === "abierto" ? "bg-white/5" : (seleccionado.diferenciaEfectivo || 0) < 0 ? "bg-red-500/10" : (seleccionado.diferenciaEfectivo || 0) > 0 ? "bg-amber-500/10" : "bg-emerald-500/10")}>
                  <span className="text-sm font-bold text-white/80">{seleccionado.estado === "abierto" ? "Cuadre pendiente" : `Diferencia · ${diferenciaTexto(seleccionado.diferenciaEfectivo || 0)}`}</span>
                  <span className="text-sm font-black text-white">{seleccionado.estado === "abierto" ? "—" : formatCurrency(seleccionado.diferenciaEfectivo || 0)}</span>
                </div>
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Ventas por medio de pago</h3>
              </div>
              {cargandoDetalle ? (
                <div className="rounded-xl bg-white/5 py-5 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-white/30" /></div>
              ) : ventasDetalle ? (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ["Efectivo", ventasDetalle.efectivo],
                    ["Transferencia", ventasDetalle.transferencia],
                    ["Tarjeta", ventasDetalle.tarjeta],
                    ["Otros", ventasDetalle.otros],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl bg-white/5 p-3">
                      <p className="text-[10px] text-white/35 uppercase font-bold">{label}</p>
                      <p className="text-sm font-black text-white mt-1">{formatCurrency(Number(value))}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/40">{errorDetalle || "No hay ventas calculadas para este turno."}</p>
              )}
            </section>

            <section>
              <div className="flex items-center gap-2 mb-2">
                <ReceiptText className="h-4 w-4 text-orange-400" />
                <h3 className="text-sm font-bold text-white">Gastos y salidas reportadas</h3>
              </div>
              {egresosDetalle.length === 0 ? (
                <p className="rounded-xl bg-white/5 p-4 text-xs text-white/40">No hay gastos de caja registrados para este turno.</p>
              ) : (
                <div className="rounded-xl bg-white/5 divide-y divide-white/5 overflow-hidden">
                  {egresosDetalle.map((egreso) => (
                    <div key={egreso.id} className="px-3 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{egreso.motivo || "Salida de caja"}</p>
                        <p className="text-[11px] text-white/35 mt-1">{formatEgresoDate(egreso.fecha)} · Reportó: {egreso.cajeroNombre || "Sin identificar"}</p>
                      </div>
                      <p className="text-sm font-black text-red-300 shrink-0">-{formatCurrency(egreso.monto || 0)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {(seleccionado.notasApertura || seleccionado.notasCierre) && (
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Notas del equipo</h3>
                </div>
                <div className="rounded-xl bg-white/5 p-3 space-y-3">
                  {seleccionado.notasApertura && <div><p className="text-[10px] text-white/35 uppercase font-bold">Apertura</p><p className="text-sm text-white/70 mt-1">{seleccionado.notasApertura}</p></div>}
                  {seleccionado.notasCierre && <div><p className="text-[10px] text-white/35 uppercase font-bold">Cierre</p><p className="text-sm text-white/70 mt-1">{seleccionado.notasCierre}</p></div>}
                </div>
              </section>
            )}

            <div className="flex items-center gap-2 text-xs text-white/40">
              {seleccionado.estado === "abierto" ? <Clock className="h-4 w-4 text-emerald-400" /> : seleccionado.diferenciaEfectivo < 0 ? <TrendingDown className="h-4 w-4 text-red-400" /> : seleccionado.diferenciaEfectivo > 0 ? <TrendingUp className="h-4 w-4 text-amber-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              <span>{seleccionado.estado === "abierto" ? "El turno sigue abierto; el cuadre se valida al cierre." : seleccionado.diferenciaEfectivo < 0 ? "El efectivo contado fue menor al esperado." : seleccionado.diferenciaEfectivo > 0 ? "El efectivo contado superó lo esperado." : "El cierre coincide con el efectivo esperado."}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
