"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Trash2, Calendar } from "lucide-react"
import { formatCurrency } from "@/lib/demo-data"
import { collection, query, orderBy, getDocs, limit } from "firebase/firestore"
import { db } from "@/lib/firebase"

interface MermaRaw { id: string; insumoNombre: string; cantidad: number; unidadMedida: string; motivo: string; costo: number; notas?: string; registradoPorNombre: string; fecha: { toDate: () => Date } | null }
const reasons: Record<string, string> = { expired: "Vencido", damaged: "Danado", spilled: "Derramado", burned: "Quemado", other: "Otro" }

export default function MermasPage() {
  const [mermas, setMermas] = useState<MermaRaw[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    (async () => {
      try { const s = await getDocs(query(collection(db, "mermas"), orderBy("fecha", "desc"), limit(50))); setMermas(s.docs.map(d => ({ id: d.id, ...d.data() } as MermaRaw))) }
      catch {} finally { setCargando(false) }
    })()
  }, [])

  const total = mermas.reduce((a, m) => a + (m.costo || 0), 0)
  const ff = (f: MermaRaw["fecha"]) => f?.toDate?.().toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) || "-"

  if (cargando) return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>

  return (
    <div className="p-4 space-y-4">
      <div><h1 className="text-xl font-bold text-foreground flex items-center gap-2"><Trash2 className="h-5 w-5 text-primary" />Mermas</h1><p className="text-sm text-muted-foreground">Perdidas y desperdicios</p></div>
      <Card className="bg-card border-border"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total perdido</p><p className="text-2xl font-bold text-destructive">{formatCurrency(total)}</p><p className="text-xs text-muted-foreground mt-1">{mermas.length} mermas</p></CardContent></Card>
      {mermas.length === 0 ? <Card className="bg-card border-border"><CardContent className="py-8 text-center text-muted-foreground">Sin mermas</CardContent></Card> : (
        <div className="space-y-2">{mermas.map(m => (
          <Card key={m.id} className="bg-card border-border"><CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <div><p className="text-sm font-medium text-foreground">{m.insumoNombre}</p><p className="text-xs text-muted-foreground">{m.cantidad} {m.unidadMedida}</p></div>
              <span className="font-bold text-destructive text-sm">{formatCurrency(m.costo)}</span></div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Calendar className="h-3 w-3 text-muted-foreground" /><span className="text-xs text-muted-foreground">{ff(m.fecha)} - {m.registradoPorNombre}</span></div>
              <Badge variant="secondary" className="text-[10px]">{reasons[m.motivo] || m.motivo}</Badge></div>
          </CardContent></Card>
        ))}</div>
      )}
    </div>
  )
}
