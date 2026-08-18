"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Loader2, Truck, Calendar, Package2 } from "lucide-react"
import { formatCurrency } from "@/lib/demo-data"
import { collection, query, orderBy, getDocs, limit, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { getEmpresaId } from "@/lib/tenant"

interface CompraRaw {
  id: string
  proveedor: string
  total: number
  items?: { insumoNombre?: string; itemNombre?: string; cantidad: number; unidadMedida: string; costoTotal: number }[]
  registradoPorNombre: string
  fecha: { toDate: () => Date } | null
}

export default function ComprasPage() {
  const [compras, setCompras] = useState<CompraRaw[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const empresaId = await getEmpresaId()
        const s = await getDocs(query(collection(db, "compras"), where("empresaId", "==", empresaId), orderBy("fecha", "desc"), limit(50)))
        setCompras(s.docs.map(d => ({ id: d.id, ...d.data() } as CompraRaw)))
      } catch {} finally { setCargando(false) }
    })()
  }, [])

  const total = compras.reduce((a, c) => a + (c.total || 0), 0)
  const ff = (f: CompraRaw["fecha"]) => f?.toDate?.().toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) || "–"

  if (cargando) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
    </div>
  )

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-border/50 bg-card/50">
        <h1 className="text-xl font-bold text-foreground">Compras</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Historial de compras a proveedores</p>
      </div>

      {/* Stat banner */}
      <div className="px-4 pt-4">
        <div className="bg-card/50 border border-border rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Total invertido</p>
            <p className="text-xl font-bold text-foreground tabular-nums mt-1">{formatCurrency(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Registros</p>
            <p className="text-xl font-bold text-foreground mt-1">{compras.length}</p>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="px-4 mt-4">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Historial</p>
        {compras.length === 0 ? (
          <div className="bg-card/50 border border-border rounded-xl py-10 text-center text-sm text-muted-foreground">
            No hay compras registradas
          </div>
        ) : (
          <div className="bg-card/50 border border-border rounded-xl overflow-hidden divide-y divide-border/50">
            {compras.map(c => (
              <div key={c.id} className="px-4 py-3 hover:bg-card/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-7 h-7 bg-blue-500/20 border border-blue-500/30 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <Truck className="h-3.5 w-3.5 text-blue-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground/80 truncate">{c.proveedor}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{ff(c.fecha)} · {c.registradoPorNombre}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(c.total)}</p>
                    <span className="text-[10px] text-muted-foreground">{(c.items || []).length} ítem{(c.items || []).length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
