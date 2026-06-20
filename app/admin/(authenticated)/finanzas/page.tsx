"use client"

import { useState, useEffect } from "react"
import { Loader2, TrendingUp, TrendingDown, ArrowRightLeft, Plus, Minus, Wallet, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/demo-data"
import { useAuthContext } from "@/contexts/auth-context"
import { toast } from "sonner"
import {
  suscribirCuentasBancarias,
  suscribirTransacciones,
  registrarTransaccion,
  inicializarCuentasBancarias,
  type CuentaBancaria,
  type TransaccionFinanciera,
} from "@/lib/finanzas-service"

type TxTipo = "ingreso" | "egreso" | "traslado"

const CATEGORIAS_EGRESO = [
  { value: "proveedores", label: "Proveedores / Compras" },
  { value: "nomina", label: "Nómina / Empleados" },
  { value: "servicios", label: "Servicios / Arriendo" },
  { value: "caja-menor", label: "Gasto Operativo" },
  { value: "impuestos", label: "Impuestos" },
  { value: "otros", label: "Otros Gastos" },
]

const CATEGORIAS_INGRESO = [
  { value: "ventas", label: "Ventas Externas" },
  { value: "inversion", label: "Inversión / Préstamo" },
  { value: "reintegro", label: "Reintegro" },
  { value: "otros", label: "Otros Ingresos" },
]

export default function FinanzasPage() {
  const { usuario } = useAuthContext()
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
  const [transacciones, setTransacciones] = useState<TransaccionFinanciera[]>([])
  const [cargando, setCargando] = useState(true)

  // Modal
  const [modal, setModal] = useState<TxTipo | null>(null)
  const [form, setForm] = useState({ cuentaId: "", cuentaDestinoId: "", monto: "", concepto: "", categoria: "", referencia: "" })
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    inicializarCuentasBancarias()
    const unsubC = suscribirCuentasBancarias((data) => { setCuentas(data); setCargando(false) })
    const now = new Date()
    const unsubT = suscribirTransacciones(now.getMonth() + 1, now.getFullYear(), setTransacciones)
    return () => { unsubC(); unsubT() }
  }, [])

  const resetForm = () => setForm({ cuentaId: "", cuentaDestinoId: "", monto: "", concepto: "", categoria: "", referencia: "" })

  const abrirModal = (tipo: TxTipo) => { resetForm(); setModal(tipo) }

  const guardar = async () => {
    if (!usuario || !modal) return
    const monto = parseFloat(form.monto.replace(/[^\d.]/g, ""))
    if (!monto || monto <= 0) { toast.error("Ingresa un monto válido"); return }
    if (!form.cuentaId) { toast.error("Selecciona una cuenta"); return }
    if (modal !== "traslado" && (!form.concepto || !form.categoria)) { toast.error("Completa concepto y categoría"); return }
    if (modal === "traslado" && !form.cuentaDestinoId) { toast.error("Selecciona cuenta destino"); return }
    if (modal === "traslado" && form.cuentaId === form.cuentaDestinoId) { toast.error("Las cuentas deben ser distintas"); return }

    setGuardando(true)
    try {
      const origen = cuentas.find(c => c.id === form.cuentaId)
      const destino = cuentas.find(c => c.id === form.cuentaDestinoId)

      if (modal === "traslado") {
        await registrarTransaccion({ cuentaId: form.cuentaId, cuentaNombre: origen?.nombre ?? "", tipo: "egreso", monto, concepto: `Traslado a ${destino?.nombre} — ${form.concepto || "traslado"}`, categoria: "traslado", usuarioId: usuario.uid, usuarioNombre: usuario.nombre })
        await registrarTransaccion({ cuentaId: form.cuentaDestinoId, cuentaNombre: destino?.nombre ?? "", tipo: "ingreso", monto, concepto: `Traslado desde ${origen?.nombre} — ${form.concepto || "traslado"}`, categoria: "traslado", usuarioId: usuario.uid, usuarioNombre: usuario.nombre })
        toast.success("Traslado registrado")
      } else {
        await registrarTransaccion({ cuentaId: form.cuentaId, cuentaNombre: origen?.nombre ?? "", tipo: modal, monto, concepto: form.concepto, categoria: form.categoria, referencia: form.referencia, usuarioId: usuario.uid, usuarioNombre: usuario.nombre })
        toast.success(modal === "ingreso" ? "Ingreso registrado" : "Gasto registrado")
      }
      setModal(null)
    } catch (e: any) {
      toast.error(e.message || "Error al guardar")
    } finally {
      setGuardando(false)
    }
  }

  const saldoTotal = cuentas.reduce((s, c) => s + (c.saldo || 0), 0)

  if (cargando) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-white/20" />
    </div>
  )

  return (
    <div className="pb-4 space-y-4">
      {/* Header */}
      <div className="pt-2 pb-1">
        <h1 className="text-2xl font-bold text-white">Finanzas</h1>
        <p className="text-white/40 text-sm">Saldos y movimientos del mes</p>
      </div>

      {/* Saldo total */}
      <div className="rounded-2xl bg-gradient-to-br from-[#F9B207]/20 to-[#F9B207]/5 border border-[#F9B207]/20 p-5">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">Saldo Total</p>
        <p className="text-4xl font-black text-white tracking-tight">{formatCurrency(saldoTotal)}</p>
      </div>

      {/* Cuentas */}
      <div className="grid grid-cols-2 gap-3">
        {cuentas.map(cuenta => (
          <div key={cuenta.id} className="rounded-2xl bg-white/5 border border-white/5 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: cuenta.color + "33" }}>
                <Wallet className="h-3.5 w-3.5" style={{ color: cuenta.color }} />
              </div>
              <span className="text-xs font-semibold text-white/50 truncate">{cuenta.nombre}</span>
            </div>
            <p className="text-xl font-black text-white">{formatCurrency(cuenta.saldo)}</p>
            <span className="text-[10px] font-bold uppercase text-white/30">{cuenta.tipo}</span>
          </div>
        ))}
      </div>

      {/* Acciones */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => abrirModal("ingreso")} className="flex flex-col items-center gap-1.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 py-3 px-2 active:scale-95 transition-transform">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Plus className="h-5 w-5 text-emerald-400" />
          </div>
          <span className="text-xs font-bold text-emerald-400">Ingreso</span>
        </button>
        <button onClick={() => abrirModal("egreso")} className="flex flex-col items-center gap-1.5 rounded-2xl bg-red-500/10 border border-red-500/20 py-3 px-2 active:scale-95 transition-transform">
          <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center">
            <Minus className="h-5 w-5 text-red-400" />
          </div>
          <span className="text-xs font-bold text-red-400">Gasto</span>
        </button>
        <button onClick={() => abrirModal("traslado")} className="flex flex-col items-center gap-1.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 py-3 px-2 active:scale-95 transition-transform">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <ArrowRightLeft className="h-5 w-5 text-amber-400" />
          </div>
          <span className="text-xs font-bold text-amber-400">Trasladar</span>
        </button>
      </div>

      {/* Historial */}
      <div>
        <h2 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-3">Movimientos del mes</h2>
        {transacciones.length === 0 ? (
          <div className="rounded-2xl bg-white/5 border border-white/5 py-12 flex flex-col items-center gap-2">
            <Wallet className="h-8 w-8 text-white/10" />
            <p className="text-sm text-white/30">Sin movimientos este mes</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white/5 border border-white/5 divide-y divide-white/5 overflow-hidden">
            {transacciones.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                  tx.tipo === "ingreso" ? "bg-emerald-500/15" : tx.tipo === "egreso" ? "bg-red-500/15" : "bg-amber-500/15"
                )}>
                  {tx.tipo === "ingreso"
                    ? <TrendingUp className="h-4 w-4 text-emerald-400" />
                    : tx.tipo === "egreso"
                      ? <TrendingDown className="h-4 w-4 text-red-400" />
                      : <ArrowRightLeft className="h-4 w-4 text-amber-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{tx.concepto}</p>
                  <p className="text-xs text-white/30">
                    {tx.cuentaNombre} · {tx.fecha?.seconds ? new Date(tx.fecha.seconds * 1000).toLocaleDateString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </p>
                </div>
                <p className={cn(
                  "text-sm font-black shrink-0",
                  tx.tipo === "ingreso" ? "text-emerald-400" : tx.tipo === "egreso" ? "text-red-400" : "text-white/60"
                )}>
                  {tx.tipo === "ingreso" ? "+" : tx.tipo === "egreso" ? "-" : ""}{formatCurrency(tx.monto)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal — bottom sheet en móvil, dialog centrado en desktop */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center" onClick={() => setModal(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full sm:max-w-md sm:rounded-3xl max-w-lg mx-auto bg-[#0f1e35] border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto -mt-2 mb-2 sm:hidden" />
            <h3 className="text-lg font-bold text-white">
              {modal === "ingreso" ? "Registrar Ingreso" : modal === "egreso" ? "Registrar Gasto" : "Trasladar Dinero"}
            </h3>

            {/* Cuenta origen */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white/50 uppercase">{modal === "traslado" ? "Cuenta origen" : "Cuenta"}</label>
              <select value={form.cuentaId} onChange={e => setForm(f => ({ ...f, cuentaId: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#F9B207]/50">
                <option value="">Seleccionar cuenta...</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre} — {formatCurrency(c.saldo)}</option>)}
              </select>
            </div>

            {/* Cuenta destino (solo traslado) */}
            {modal === "traslado" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/50 uppercase">Cuenta destino</label>
                <select value={form.cuentaDestinoId} onChange={e => setForm(f => ({ ...f, cuentaDestinoId: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500/50">
                  <option value="">Seleccionar destino...</option>
                  {cuentas.filter(c => c.id !== form.cuentaId).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )}

            {/* Monto */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white/50 uppercase">Monto</label>
              <input type="number" inputMode="numeric" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="0" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xl font-black text-white focus:outline-none focus:border-[#F9B207]/50 placeholder:text-white/20" />
            </div>

            {/* Concepto */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white/50 uppercase">Concepto</label>
              <input type="text" value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} placeholder={modal === "egreso" ? "Ej: Pago arriendo" : modal === "ingreso" ? "Ej: Inyección capital" : "Descripción del traslado"} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#F9B207]/50 placeholder:text-white/20" />
            </div>

            {/* Categoría (no traslado) */}
            {modal !== "traslado" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-white/50 uppercase">Categoría</label>
                <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#F9B207]/50">
                  <option value="">Seleccionar...</option>
                  {(modal === "egreso" ? CATEGORIAS_EGRESO : CATEGORIAS_INGRESO).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setModal(null)} className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-bold text-white/60 active:bg-white/5">
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando} className={cn(
                "flex-1 py-3 rounded-xl text-sm font-bold text-white active:scale-95 transition-transform disabled:opacity-50",
                modal === "ingreso" ? "bg-emerald-500" : modal === "egreso" ? "bg-red-500" : "bg-amber-500"
              )}>
                {guardando ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
