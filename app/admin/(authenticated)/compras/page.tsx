"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Loader2, Truck, Calendar, Package2 } from "lucide-react"
import { formatCurrency } from "@/lib/demo-data"
import { collection, query, orderBy, getDocs, limit } from "firebase/firestore"
import { db } from "@/lib/firebase"

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
        const s = await getDocs(query(collection(db, "compras"), orderBy("fecha", "desc"), limit(50)))
        setCompras(s.docs.map(d => ({ id: d.id, ...d.data() } as CompraRaw)))
      } catch {} finally { setCargando(false) }
    })()
  }, [])

  const total = compras.reduce((a, c) => a + (c.total || 0), 0)
  const ff = (f: CompraRaw["fecha"]) => f?.toDate?.().toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) || "–"

  if (cargando) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-100 bg-white">
        <h1 className="text-xl font-bold text-slate-900">Compras</h1>
        <p className="text-xs text-slate-400 mt-0.5">Historial de compras a proveedores</p>
      </div>

      {/* Stat banner */}
      <div className="px-4 pt-4">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total invertido</p>
            <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">{formatCurrency(total)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Registros</p>
            <p className="text-xl font-bold text-slate-900 mt-1">{compras.length}</p>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="px-4 mt-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Historial</p>
        {compras.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl py-10 text-center text-sm text-slate-400">
            No hay compras registradas
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            {compras.map(c => (
              <div key={c.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-7 h-7 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <Truck className="h-3.5 w-3.5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{c.proveedor}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{ff(c.fecha)} · {c.registradoPorNombre}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(c.total)}</p>
                    <span className="text-[10px] text-slate-400">{(c.items || []).length} ítem{(c.items || []).length !== 1 ? "s" : ""}</span>
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
