"use client"

import { CalendarClock, Clock3, MapPin, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatearFechaBodega, type ProgramacionPedidoBodegaDTO } from "@/lib/bodega/ui-contract"

const estadoLabel: Record<ProgramacionPedidoBodegaDTO["estado"], string> = {
  PENDIENTE_REVISION: "Pendiente de revisión",
  RESERVADA: "Stock reservado",
  CANCELADA: "Cancelada",
  VENCIDA: "Reserva vencida",
  CONVERTIDA_A_SOLICITUD: "Pendiente de venta",
  CUMPLIDA: "Atendida",
}

function fechaLegible(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day, 12).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
}

export function BodegaAgendaVendedor({
  programaciones, hoy, cargando, cargandoMas, hayMas, procesando, onActualizar, onCargarMas, onCancelar, onConvertir,
}: {
  programaciones: ProgramacionPedidoBodegaDTO[]
  hoy: string
  cargando: boolean
  cargandoMas: boolean
  hayMas: boolean
  procesando: string
  onActualizar(): void
  onCargarMas(): void
  onCancelar(item: ProgramacionPedidoBodegaDTO): void
  onConvertir(item: ProgramacionPedidoBodegaDTO): void
}) {
  const sorted = [...programaciones].sort((a, b) => a.fechaLocal.localeCompare(b.fechaLocal) || a.estado.localeCompare(b.estado))
  const porRevisar = sorted.filter(item => item.estado === "PENDIENTE_REVISION").length
  const reservadas = sorted.filter(item => item.estado === "RESERVADA").length
  return <section className="bodega-seller-view">
    <div className="bodega-seller-heading">
      <div><p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">Pedidos futuros</p><h1 className="mt-1 text-2xl font-bold">Mi agenda</h1><p className="mt-1 text-sm text-slate-400">La fecha y la franja son preferidas. El precio se confirma al atender; solo administración puede reservar existencias.</p></div>
      <button aria-label="Actualizar agenda" disabled={cargando} onClick={onActualizar} className="flex shrink-0 items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50"><RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} />Actualizar</button>
    </div>
    <div className="bodega-seller-summary"><span><strong>{porRevisar}</strong> por revisar</span><span><strong>{reservadas}</strong> reservados</span><span><strong>{sorted.length}</strong> en agenda</span></div>
    {cargando && programaciones.length === 0 ? <div className="grid min-h-40 place-items-center"><RefreshCw className="h-6 w-6 animate-spin text-amber-300" /></div> : <div className="space-y-3">
      {sorted.map(item => {
        const convertir = item.estado === "RESERVADA" && item.fechaLocal === hoy
        const cancelar = item.estado === "PENDIENTE_REVISION"
        return <article key={item.programacionId} className="bodega-seller-panel bodega-agenda-card">
          <div className="bodega-agenda-top"><div className="min-w-0"><p className="bodega-history-eyebrow">Entrega preferida · {fechaLegible(item.fechaLocal)}</p><h2>{item.cliente?.nombre || "Cliente no disponible"}</h2><p className="mt-1 text-sm text-slate-300">{item.franja ? `${item.franja.desde}–${item.franja.hasta}` : "Sin franja horaria"}</p></div><span className={cn("bodega-seller-status", item.estado === "RESERVADA" ? "bg-emerald-400/15 text-emerald-200" : item.estado === "PENDIENTE_REVISION" ? "bg-amber-300/15 text-amber-200" : "bg-white/10 text-slate-300")}>{estadoLabel[item.estado]}</span></div>
          {item.cliente?.direccion ? <p className="mt-2 flex items-start gap-2 text-xs text-slate-400"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />{item.cliente.direccion}</p> : <p className="mt-2 flex items-start gap-2 text-xs text-slate-500"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />El cliente no tiene dirección registrada.</p>}
          <div className="bodega-request-lines">{item.lineas.map((line, index) => <div key={`${line.presentacionId}-${index}`} className="bodega-request-line"><span>{line.cantidad} × {line.presentacionNombre} ({line.factorUnidadBase} {line.unidadBase})</span><span>{line.cantidadUnidadBase} unid. base</span></div>)}</div>
          {item.estado === "PENDIENTE_REVISION" && <p className="text-xs text-amber-200">Esperando aprobación. Aún no hay stock retenido ni venta.</p>}
          {item.estado === "RESERVADA" && <p className="text-xs text-emerald-200">Reservado: {item.stockReservadoUnidadBase} unidades base. No es una venta ni garantiza hora de entrega; vence {formatearFechaBodega(item.reservaExpiraEn)}.</p>}
          {item.estado === "CONVERTIDA_A_SOLICITUD" && <p className="text-xs text-blue-200">La solicitud de venta {item.solicitudId ? `· ${item.solicitudId.slice(-8)}` : ""} requiere aprobación vigente antes de cobrar.</p>}
          {convertir && <button disabled={!!procesando} onClick={() => onConvertir(item)} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-300 font-bold text-slate-950 disabled:opacity-50"><CalendarClock className="h-4 w-4" />{procesando === item.programacionId ? "Creando solicitud…" : "Crear solicitud de venta de hoy"}</button>}
          {cancelar && <button disabled={!!procesando} onClick={() => onCancelar(item)} className="mt-3 h-10 w-full rounded-xl border border-white/10 text-sm text-slate-300 disabled:opacity-50">Cancelar pedido</button>}
          {item.franja && <p className="mt-2 flex items-center gap-2 text-[11px] text-slate-500"><Clock3 className="h-3.5 w-3.5" />Franja solicitada, no una cita garantizada.</p>}
        </article>
      })}
      {sorted.length === 0 && <p className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-slate-400">Todavía no tienes pedidos agendados.</p>}
      {hayMas && <button disabled={cargandoMas || cargando} onClick={onCargarMas} className="w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-slate-200 disabled:opacity-50">{cargandoMas ? "Cargando más pedidos…" : "Cargar más pedidos"}</button>}
    </div>}
  </section>
}
