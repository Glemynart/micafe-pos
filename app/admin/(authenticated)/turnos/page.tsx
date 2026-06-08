"use client"

import { useState, useEffect } from "react"
import { Loader2, Clock, CheckCircle2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/demo-data"
import { suscribirHistorialTurnos, type Turno } from "@/lib/turnos-service"

export default function TurnosPage() {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => { const u = suscribirHistorialTurnos(d => { setTurnos(d); setCargando(false) }); return u }, [])

  if (cargando) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )

  const abiertos = turnos.filter(t => t.estado === "abierto")
  const cerrados = turnos.filter(t => t.estado !== "abierto")

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-100 bg-white">
        <h1 className="text-xl font-bold text-slate-900">Turnos</h1>
        <p className="text-xs text-slate-400 mt-0.5">Historial y cuadre de caja</p>
      </div>

      {turnos.length === 0 ? (
        <div className="px-4 pt-8 text-center text-sm text-slate-400">No hay turnos registrados</div>
      ) : (
        <div className="px-4 pt-4 space-y-4">

          {/* Turnos abiertos */}
          {abiertos.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">En curso</p>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {abiertos.map(t => (
                  <div key={t.id} className="px-4 py-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{t.cajeroNombre}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {t.fechaApertura?.toDate?.().toLocaleDateString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        ABIERTO
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Base apertura", value: formatCurrency(t.baseApertura) },
                        { label: "Esperado", value: formatCurrency(t.totalEsperadoEfectivo || 0) },
                        { label: "Efectivo", value: formatCurrency(t.ventasEfectivo || 0) },
                        { label: "Diferencia", value: formatCurrency(t.diferenciaEfectivo || 0), alert: (t.diferenciaEfectivo || 0) !== 0 },
                      ].map(item => (
                        <div key={item.label} className={cn("p-2.5 rounded-lg", item.alert ? "bg-red-50 border border-red-100" : "bg-slate-50")}>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{item.label}</p>
                          <p className={cn("text-sm font-bold mt-0.5 tabular-nums", item.alert ? "text-red-600" : "text-slate-800")}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Turnos cerrados */}
          {cerrados.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Historial</p>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {cerrados.map(t => (
                  <div key={t.id} className="px-4 py-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{t.cajeroNombre}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {t.fechaApertura?.toDate?.().toLocaleDateString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">
                        <XCircle className="h-3 w-3" />
                        CERRADO
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { label: "Base", value: formatCurrency(t.baseApertura) },
                        { label: "Esperado", value: formatCurrency(t.totalEsperadoEfectivo || 0) },
                        { label: "Efectivo", value: formatCurrency(t.ventasEfectivo || 0) },
                        { label: "Dif", value: formatCurrency(t.diferenciaEfectivo || 0), alert: (t.diferenciaEfectivo || 0) !== 0 },
                      ].map(item => (
                        <div key={item.label} className={cn("p-2 rounded-lg text-center", item.alert ? "bg-red-50" : "bg-slate-50")}>
                          <p className="text-[9px] text-slate-400 uppercase tracking-wide font-bold">{item.label}</p>
                          <p className={cn("text-[11px] font-bold mt-0.5 tabular-nums", item.alert ? "text-red-600" : "text-slate-700")}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
