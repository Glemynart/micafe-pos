"use client"

import { useState, useEffect } from "react"
import { Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { suscribirTodosEspacios, type Espacio } from "@/lib/espacios-service"
import { doc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { DynamicIcon } from "@/components/ui/dynamic-icon"
import { MODULOS } from "@/lib/permisos-service"

const MODULO_LABELS: Record<string, string> = {
  sell: "Ventas",
  kitchen: "Cocina",
  inventory: "Inventario",
  recipes: "Recetas",
  purchases: "Compras",
  reports: "Reportes",
  shifts: "Turnos",
  waste: "Mermas",
  gastos: "Gastos",
  permissions: "Permisos",
  settings: "Configuración",
  cuentas_cobro: "Cuentas por Cobrar",
  clientes: "Clientes",
  consignaciones: "Consignaciones",
  alquiler_dashboard: "Alquiler",
  historial: "Historial",
  reservas: "Reservas Web",
}

export default function EspaciosPage() {
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [togglingModulo, setTogglingModulo] = useState<string | null>(null)

  useEffect(() => {
    const unsub = suscribirTodosEspacios((data) => {
      setEspacios(data)
      setCargando(false)
    })
    return unsub
  }, [])

  const toggle = async (e: Espacio) => {
    setGuardando(e.id)
    try {
      await updateDoc(doc(db, "espacios", e.id), { activo: !e.activo })
      toast.success(e.activo ? `${e.nombre} desactivado` : `${e.nombre} activado`)
    } catch {
      toast.error("Error al actualizar")
    } finally {
      setGuardando(null)
    }
  }

  const toggleExpand = (id: string) => {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleModulo = async (espacioId: string, modulo: string, modulosActuales: string[]) => {
    setTogglingModulo(`${espacioId}_${modulo}`)
    try {
      const nuevos = modulosActuales.includes(modulo)
        ? modulosActuales.filter(m => m !== modulo)
        : [...modulosActuales, modulo]
      await updateDoc(doc(db, "espacios", espacioId), { modulos_permitidos: nuevos })
    } catch {
      toast.error("Error al actualizar módulo")
    } finally {
      setTogglingModulo(null)
    }
  }

  if (cargando) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-white/20" />
    </div>
  )

  const activos = espacios.filter((e) => e.activo).length

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-white/5 bg-white/5">
        <h1 className="text-xl font-bold text-white">Espacios</h1>
        <p className="text-xs text-white/40 mt-0.5">
          {activos} de {espacios.length} espacios activos
        </p>
      </div>

      <div className="px-4 pt-4 space-y-3">
        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
          Áreas del negocio
        </p>

        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
          {espacios.length === 0 && (
            <p className="text-sm text-white/40 text-center py-10">No hay espacios registrados</p>
          )}
          {espacios.map((e) => {
            const modulosEspacio = e.modulos_permitidos || []
            const expandido = expandidos.has(e.id)
            return (
              <div key={e.id}>
                <div
                  className={cn(
                    "flex items-center justify-between px-4 py-3 transition-opacity hover:bg-white/5 cursor-pointer",
                    !e.activo && "opacity-50"
                  )}
                  onClick={() => toggleExpand(e.id)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: e.color + "20", border: `1px solid ${e.color}30` }}
                    >
                      <span style={{ color: e.color }}><DynamicIcon name={e.icono} className="h-4.5 w-4.5" /></span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white/80">{e.nombre}</p>
                      <p className="text-[11px] text-white/40">
                        {e.activo ? "Visible en el POS" : "Oculto"}
                        {modulosEspacio.length > 0 && ` · ${modulosEspacio.length} módulos`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(ev) => { ev.stopPropagation(); toggle(e) }}
                      disabled={guardando === e.id}
                      className={cn(
                        "relative h-6 w-11 rounded-full transition-colors shrink-0 focus:outline-none",
                        e.activo ? "bg-emerald-500" : "bg-white/10"
                      )}
                    >
                      {guardando === e.id ? (
                        <Loader2 className="h-3 w-3 animate-spin text-white absolute inset-0 m-auto" />
                      ) : (
                        <span
                          className={cn(
                            "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all",
                            e.activo ? "left-5" : "left-0.5"
                          )}
                        />
                      )}
                    </button>
                    {expandido ? <ChevronUp className="h-4 w-4 text-white/40 shrink-0" /> : <ChevronDown className="h-4 w-4 text-white/40 shrink-0" />}
                  </div>
                </div>

                {expandido && (
                  <div className="px-4 py-3 bg-white/[0.02] border-t border-white/5">
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">
                      Módulos visibles en este espacio
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {MODULOS.map(mod => {
                        const activo = modulosEspacio.length === 0 || modulosEspacio.includes(mod)
                        const estaToggling = togglingModulo === `${e.id}_${mod}`
                        return (
                          <button
                            key={mod}
                            onClick={() => toggleModulo(e.id, mod, modulosEspacio)}
                            disabled={!!togglingModulo}
                            className={cn(
                              "flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-left",
                              activo
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                : "bg-white/5 text-white/30 border border-transparent hover:bg-white/10"
                            )}
                          >
                            {estaToggling ? (
                              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                            ) : (
                              <span className={cn(
                                "w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center transition-colors",
                                activo ? "bg-emerald-500 border-emerald-500" : "border-white/20"
                              )}>
                                {activo && (
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </span>
                            )}
                            <span className="truncate">{MODULO_LABELS[mod] || mod}</span>
                          </button>
                        )
                      })}
                    </div>
                    {modulosEspacio.length === 0 && (
                      <p className="text-[10px] text-white/20 mt-2 text-center">
                        Sin módulos configurados — se muestran todos los módulos del rol
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-xs text-white/40 text-center pb-2">
          Los espacios desactivados no aparecerán en el selector del POS.
        </p>
      </div>
    </div>
  )
}
