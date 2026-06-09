"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, ClipboardList, Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/demo-data"
import { collection, query, where, orderBy, getDocs, limit } from "firebase/firestore"
import { db } from "@/lib/firebase"

interface CRaw { id: string; clienteNombre: string; notasFiado?: string; totales: { total: number }; items?: { nombre: string; cantidad: number }[]; estado: string; fecha: { toDate: () => Date } | null }

export default function CuentasCobroPage() {
  const [cuentas, setCuentas] = useState<CRaw[]>([])
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState<"pendiente" | "pagada" | "todas">("pendiente")

  useEffect(() => {
    (async () => {
      try { const s = await getDocs(query(collection(db, "ventas"), where("metodoPago", "==", "cuenta_cobro"), orderBy("fecha", "desc"), limit(50))); setCuentas(s.docs.map(d => ({ id: d.id, ...d.data() } as CRaw))) }
      catch {} finally { setCargando(false) }
    })()
  }, [])

  const ff = (f: CRaw["fecha"]) => f?.toDate?.().toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) || "-"
  const filtradas = filtro === "todas" ? cuentas : cuentas.filter(c => c.estado === filtro)
  const totalP = cuentas.filter(c => c.estado === "pendiente").reduce((a, c) => a + (c.totales?.total || 0), 0)

  if (cargando) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-white/20" /></div>

  return (
    <div className="p-4 space-y-4">
      <div><h1 className="text-xl font-bold text-white flex items-center gap-2"><ClipboardList className="h-5 w-5 text-[#F9B207]" />Cuentas de Cobro</h1><p className="text-sm text-white/60">Ventas a credito</p></div>
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-white/5 border-white/10"><CardContent className="p-4"><p className="text-xs text-white/60">Pendientes</p><p className="text-xl font-bold text-white">{cuentas.filter(c => c.estado === "pendiente").length}</p></CardContent></Card>
        <Card className="bg-white/5 border-white/10"><CardContent className="p-4"><p className="text-xs text-white/60">Total pendiente</p><p className="text-xl font-bold text-[#F9B207]">{formatCurrency(totalP)}</p></CardContent></Card>
      </div>
      <div className="flex gap-2">
        {(["pendiente", "pagada", "todas"] as const).map(f => <button key={f} onClick={() => setFiltro(f)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium", filtro === f ? "bg-[#F9B207] text-white" : "bg-white/5 text-white/60")}>{f === "pendiente" ? "Pendientes" : f === "pagada" ? "Pagadas" : "Todas"}</button>)}
      </div>
      {filtradas.length === 0 ? <Card className="bg-white/5 border-white/10"><CardContent className="py-8 text-center text-white/60">Sin cuentas</CardContent></Card> : (
        <div className="space-y-2">{filtradas.map(c => (
          <Card key={c.id} className={cn("bg-white/5 border-white/10", c.estado === "pendiente" && "border-l-2 border-l-[#F9B207]")}><CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="font-medium text-white text-sm">{c.clienteNombre}</p>
              <Badge className={cn(c.estado === "pendiente" ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300")}>{c.estado === "pendiente" ? "Pendiente" : "Pagada"}</Badge></div>
            <p className="text-xs text-white/60 mb-1">{c.items?.map(i => `${i.cantidad}x ${i.nombre}`).join(", ")}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-white/60"><Calendar className="h-3 w-3" />{ff(c.fecha)}</div>
              <span className="font-bold text-[#F9B207] text-sm">{formatCurrency(c.totales?.total || 0)}</span></div>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  )
}
