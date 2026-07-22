"use client"

import { useState, useEffect } from "react"
import { Loader2, CalendarDays, Clock, User, Phone, Mail, CreditCard, Ban, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { formatCurrency } from "@/lib/demo-data"
import { suscribirReservasActivas, cancelarReserva, completarReserva, type Reserva } from "@/lib/reservas-service"

export default function ReservasPage() {
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState<string | null>(null)

  useEffect(() => {
    const unsub = suscribirReservasActivas((data) => {
      setReservas(data)
      setCargando(false)
    })
    return unsub
  }, [])

  const handleCompletar = async (id: string) => {
    setProcesando(id)
    try {
      // MODELO B: el Admin no tiene turno de caja, por lo que solo puede completar
      // reservas ya pagadas (no se crea venta). Las pendientes se cobran desde el POS.
      await completarReserva({ reservaId: id })
      toast.success("Reserva completada")
    } catch (err: any) {
      toast.error(err?.message === 'TURNO_REQUERIDO'
        ? "Las reservas pendientes deben cobrarse desde el POS"
        : "Error al completar")
    }
    finally { setProcesando(null) }
  }

  const handleCancelar = async (id: string) => {
    setProcesando(id)
    try {
      await cancelarReserva(id)
      toast.success("Reserva cancelada")
    } catch { toast.error("Error al cancelar") }
    finally { setProcesando(null) }
  }

  const fmtFecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO", {
    weekday: "short", day: "numeric", month: "short"
  })

  const fmtHora = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  if (cargando) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-white/20" />
    </div>
  )

  return (
    <div className="pb-4">
      <div className="px-4 pt-5 pb-4 border-b border-white/5">
        <h1 className="text-xl font-bold text-white">Reservas Web</h1>
        <p className="text-xs text-white/40 mt-0.5">
          {reservas.length} reserva{reservas.length !== 1 ? 's' : ''} activa{reservas.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {reservas.length === 0 ? (
          <div className="text-center py-10">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 text-white/10" />
            <p className="text-sm text-white/30">No hay reservas activas</p>
            <p className="text-xs text-white/15 mt-1">Las reservas hechas desde la web aparecerán aquí</p>
          </div>
        ) : (
          reservas.map(r => (
            <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <div
                className={cn(
                  "h-1.5 w-full",
                  r.estadoPago === "pagado" ? "bg-emerald-500" : "bg-amber-500"
                )}
              />

              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      {r.clienteNombre}
                      <span className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                        r.estadoPago === "pagado"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-amber-500/20 text-amber-300"
                      )}>
                        {r.estadoPago === "pagado" ? "Pagado" : "Pendiente"}
                      </span>
                    </h3>
                    <div className="flex flex-wrap gap-3 mt-1.5">
                      <span className="text-[11px] text-white/40 flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {r.clienteTelefono}
                      </span>
                      {r.clienteEmail && (
                        <span className="text-[11px] text-white/40 flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {r.clienteEmail}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-black text-[#F9B207] tabular-nums">
                    {formatCurrency(r.montoTotal)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-white/30 text-[10px] uppercase tracking-wider">Fecha</p>
                    <p className="text-white/70 font-medium capitalize">{fmtFecha(r.fechaInicio)}</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2">
                    <p className="text-white/30 text-[10px] uppercase tracking-wider">Horario</p>
                    <p className="text-white/70 font-medium">{fmtHora(r.fechaInicio)} – {fmtHora(r.fechaFin)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-white/20 mb-3">
                  <CalendarDays className="h-3 w-3" />
                  <span>{r.mesaId || "Sala"}</span>
                  <span>·</span>
                  <span>Ref: {r.referenciaPago || r.id.slice(0, 8)}</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleCancelar(r.id)}
                    disabled={!!procesando}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    {procesando === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleCompletar(r.id)}
                    disabled={!!procesando || r.estadoPago !== "pagado"}
                    title={r.estadoPago !== "pagado" ? "Las reservas pendientes deben cobrarse desde el POS" : undefined}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {procesando === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    Completar
                  </button>
                </div>
                {r.estadoPago !== "pagado" && (
                  <p className="text-[10px] text-amber-300/60 mt-2 text-center">
                    Reserva pendiente de pago — debe cobrarse y completarse desde el POS (turno de caja).
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
