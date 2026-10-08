"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CalendarClock, Check, RefreshCw, X } from "lucide-react"
import {
  cancelarProgramacionPedidoBodega,
  consultarAgendaPedidosBodega,
  construirCancelacionProgramacionPedidoBodega,
  construirResolucionProgramacionPedidoBodega,
  resolverProgramacionPedidoBodega,
  type Envelope,
} from "@/lib/bodega/agenda-service"
import { formatearFechaBodega, type ProgramacionPedidoBodegaDTO } from "@/lib/bodega/ui-contract"
import { mensajeErrorBodega } from "@/lib/bodega/ui-contract"
import { cn } from "@/lib/utils"

type Decision = "aceptar" | "rechazar"
type AgendaCommand = Envelope<{ programacionId: string; revision: number; decision: Decision }>
type CancelCommand = Envelope<{ programacionId: string; revision: number }>

const moneySafeText = (item: ProgramacionPedidoBodegaDTO) => `${item.stockReservadoUnidadBase} unidades base retenidas`
const stateLabel: Record<ProgramacionPedidoBodegaDTO["estado"], string> = {
  PENDIENTE_REVISION: "Pendiente de revisión", RESERVADA: "Stock reservado", CANCELADA: "Cancelada",
  VENCIDA: "Vencida", CONVERTIDA_A_SOLICITUD: "Pendiente de venta", CUMPLIDA: "Atendida",
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day, 12).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
}

export function BodegaAgendaAdmin() {
  const [programaciones, setProgramaciones] = useState<ProgramacionPedidoBodegaDTO[]>([])
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState("")
  const [error, setError] = useState("")
  const pending = useRef(new Map<string, AgendaCommand | CancelCommand>())

  const cargar = useCallback(async () => {
    setError("")
    try { setProgramaciones(await consultarAgendaPedidosBodega()) }
    catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setCargando(false) }
  }, [])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void cargar() }
    const interval = window.setInterval(refresh, 30_000)
    document.addEventListener("visibilitychange", refresh)
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", refresh) }
  }, [cargar])

  const resolver = async (item: ProgramacionPedidoBodegaDTO, decision: Decision) => {
    const key = `${item.programacionId}:${decision}:${item.revision}`
    if (procesando) return
    const command = pending.current.get(key) as AgendaCommand | undefined
      ?? construirResolucionProgramacionPedidoBodega({ programacionId: item.programacionId, revision: item.revision, decision })
    pending.current.set(key, command)
    setProcesando(item.programacionId); setError("")
    try { await resolverProgramacionPedidoBodega(command); pending.current.delete(key); await cargar() }
    catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setProcesando("") }
  }

  const cancelar = async (item: ProgramacionPedidoBodegaDTO) => {
    const key = `${item.programacionId}:cancelar:${item.revision}`
    if (procesando) return
    const command = pending.current.get(key) as CancelCommand | undefined
      ?? construirCancelacionProgramacionPedidoBodega({ programacionId: item.programacionId, revision: item.revision })
    pending.current.set(key, command)
    setProcesando(item.programacionId); setError("")
    try { await cancelarProgramacionPedidoBodega(command); pending.current.delete(key); await cargar() }
    catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setProcesando("") }
  }

  const sorted = [...programaciones].sort((a, b) => a.fechaLocal.localeCompare(b.fechaLocal) || a.estado.localeCompare(b.estado))
  return <section>
    <p className="text-xs font-bold uppercase tracking-[.22em] text-primary">Pedidos y entregas</p>
    <h1 className="mt-1 text-2xl font-bold">Agenda Bodega</h1>
    <p className="mt-1 mb-5 text-sm text-muted-foreground">Revisa solicitudes futuras. Al aceptar se retiene stock disponible; no se crea venta ni movimiento financiero. La franja es preferida, no una hora garantizada.</p>
    {error && <p role="alert" className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <button disabled={cargando} onClick={() => void cargar()} className="mb-4 flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"><RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} />Actualizar agenda</button>
    {cargando && sorted.length === 0 ? <div className="grid min-h-40 place-items-center"><RefreshCw className="h-6 w-6 animate-spin text-primary" /></div> : <div className="space-y-3">
      {sorted.map(item => <article key={item.programacionId} className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{item.cliente?.nombre || "Cliente no disponible"}</h2><p className="mt-1 text-sm capitalize text-muted-foreground">{dateLabel(item.fechaLocal)}{item.franja ? ` · ${item.franja.desde}–${item.franja.hasta}` : " · Sin franja horaria"}</p></div><span className={cn("shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-semibold", item.estado === "PENDIENTE_REVISION" && "bg-amber-500/10 text-amber-700", item.estado === "RESERVADA" && "bg-emerald-500/10 text-emerald-700")}>{stateLabel[item.estado]}</span></div>
        <p className="mt-2 text-xs text-muted-foreground">{item.cliente?.direccion || "Sin dirección registrada en la ficha del cliente."}</p>
        <div className="my-3 space-y-2">{item.lineas.map((line, index) => <div key={`${line.presentacionId}-${index}`} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{line.cantidad} × {line.presentacionNombre} ({line.factorUnidadBase} {line.unidadBase})</span><span className="shrink-0 text-muted-foreground">{line.cantidadUnidadBase} unid. base</span></div>)}</div>
        {item.estado === "PENDIENTE_REVISION" && <div className="rounded-xl bg-amber-500/5 p-3 text-xs text-muted-foreground">Al aceptar: {item.lineas.reduce((sum, line) => sum + line.cantidadUnidadBase, 0)} unidades base quedarán reservadas hasta el final del día solicitado. La venta y el precio se confirman después, mediante el flujo canónico.</div>}
        {item.estado === "RESERVADA" && <p className="text-xs text-emerald-700">{moneySafeText(item)} · vence {formatearFechaBodega(item.reservaExpiraEn)}.</p>}
        {item.estado === "CONVERTIDA_A_SOLICITUD" && <p className="text-xs text-blue-700">El vendedor creó una solicitud de venta; la aprobación y el cobro siguen separados.</p>}
        {item.estado === "PENDIENTE_REVISION" && <div className="mt-4 flex gap-2"><button disabled={!!procesando} onClick={() => void resolver(item, "aceptar")} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"><Check className="h-4 w-4" />{procesando === item.programacionId ? "Procesando…" : "Aceptar y reservar stock"}</button><button disabled={!!procesando} onClick={() => void resolver(item, "rechazar")} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"><X className="mr-1 inline h-4 w-4" />Rechazar</button></div>}
        {["RESERVADA", "CONVERTIDA_A_SOLICITUD"].includes(item.estado) && <button disabled={!!procesando} onClick={() => void cancelar(item)} className="mt-3 w-full rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground disabled:opacity-50">Cancelar y liberar reserva</button>}
      </article>)}
      {sorted.length === 0 && <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">No hay pedidos agendados.</p>}
    </div>}
  </section>
}
