"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Calendar, ReceiptText, TrendingDown } from "lucide-react"
import { formatCurrency } from "@/lib/demo-data"
import { suscribirTransacciones, type TransaccionFinanciera } from "@/lib/finanzas-service"
import { suscribirUsuarios, type Usuario } from "@/lib/permisos-service"
import { crearIndiceNombres, resolverNombreActor } from "@/lib/actor-display"

export default function GastosPage() {
  const [transacciones, setTransacciones] = useState<TransaccionFinanciera[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  useEffect(() => {
    const ahora = new Date()
    return suscribirTransacciones(ahora.getMonth() + 1, ahora.getFullYear(), setTransacciones)
  }, [])

  useEffect(() => suscribirUsuarios(setUsuarios), [])

  const nombres = useMemo(() => crearIndiceNombres(usuarios), [usuarios])
  const gastos = useMemo(
    () => transacciones.filter((transaccion) => transaccion.tipo === "egreso"),
    [transacciones],
  )
  const total = gastos.reduce((suma, gasto) => suma + (gasto.monto || 0), 0)

  const fecha = (valor: TransaccionFinanciera["fecha"]) => {
    if (!valor?.seconds) return "Fecha no disponible"
    return new Date(valor.seconds * 1000).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="pb-4 space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <Link href="/admin" className="flex h-9 w-9 items-center justify-center rounded-xl bg-card/50 text-muted-foreground hover:bg-muted/50 hover:text-foreground" aria-label="Volver a Inicio">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><TrendingDown className="h-5 w-5 text-orange-400" />Gastos</h1>
          <p className="text-muted-foreground text-sm">Salidas registradas durante el mes actual</p>
        </div>
      </div>

      <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-5">
        <p className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider mb-1">Total de gastos</p>
        <p className="text-4xl font-black text-foreground tracking-tight">{formatCurrency(total)}</p>
        <p className="text-xs text-muted-foreground mt-2">{gastos.length} movimientos · solo lectura</p>
      </div>

      <div className="rounded-2xl bg-card/50 border border-border/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Historial</h2>
          <Link href="/admin/finanzas" className="text-xs font-bold text-primary">Registrar gasto</Link>
        </div>
        {gastos.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-muted-foreground/70">
            <ReceiptText className="h-8 w-8 opacity-50" />
            <p className="text-sm">No hay gastos registrados este mes</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {gastos.map((gasto) => (
              <div key={gasto.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{gasto.concepto || gasto.categoria || "Gasto"}</p>
                    <p className="text-xs text-muted-foreground/80 mt-1">{gasto.cuentaNombre} · {gasto.categoria || "Sin categoría"}</p>
                  </div>
                  <p className="text-sm font-black text-red-400 shrink-0">-{formatCurrency(gasto.monto)}</p>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>{fecha(gasto.fecha)}</span>
                  <span>·</span>
                  <span>Reportó: {resolverNombreActor(gasto.usuarioId, gasto.usuarioNombreSnapshot ?? gasto.usuarioNombre, nombres)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
