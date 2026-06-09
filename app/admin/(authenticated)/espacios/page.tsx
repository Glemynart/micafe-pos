"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { suscribirTodosEspacios, type Espacio } from "@/lib/espacios-service"
import { doc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { DynamicIcon } from "@/components/ui/dynamic-icon"

export default function EspaciosPage() {
  const [espacios, setEspacios] = useState<Espacio[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState<string | null>(null)

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
          {espacios.map((e) => (
            <div
              key={e.id}
              className={cn(
                "flex items-center justify-between px-4 py-3 transition-opacity",
                !e.activo && "opacity-50"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: e.color + "20", border: `1px solid ${e.color}30` }}
                >
                  <DynamicIcon name={e.icono} className="h-4.5 w-4.5" style={{ color: e.color }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/80">{e.nombre}</p>
                  <p className="text-[11px] text-white/40">
                    {e.activo ? "Visible en el POS" : "Oculto"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => toggle(e)}
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
            </div>
          ))}
        </div>

        <p className="text-xs text-white/40 text-center pb-2">
          Los espacios desactivados no aparecerán en el selector del POS.
        </p>
      </div>
    </div>
  )
}
