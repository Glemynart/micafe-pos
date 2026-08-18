"use client"

import { useState, useEffect, useMemo } from "react"
import { Loader2, TrendingUp, TrendingDown, ArrowRightLeft, Plus, Minus, Wallet, ChevronLeft, ChevronRight, PieChart } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/demo-data"
import { useAuthContext } from "@/contexts/auth-context"
import { toast } from "sonner"
import {
  suscribirCuentasBancarias,
  suscribirTransacciones,
  registrarTransaccion,
  trasladarEntreCuentas,
  inicializarCuentasBancarias,
  type CuentaBancaria,
  type TransaccionFinanciera,
} from "@/lib/finanzas-service"
import { suscribirUsuarios, type Usuario } from "@/lib/permisos-service"
import { crearIndiceNombres, resolverNombreActor } from "@/lib/actor-display"

type TxTipo = "ingreso" | "egreso" | "traslado"
type FiltroMovimiento = "todos" | "ingreso" | "egreso"

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
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [periodo, setPeriodo] = useState(() => {
    const ahora = new Date()
    return { mes: ahora.getMonth() + 1, anio: ahora.getFullYear() }
  })
  const [filtroMovimiento, setFiltroMovimiento] = useState<FiltroMovimiento>("todos")

  // Modal
  const [modal, setModal] = useState<TxTipo | null>(null)
  const [form, setForm] = useState({ cuentaId: "", cuentaDestinoId: "", monto: "", concepto: "", categoria: "", referencia: "" })
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    void inicializarCuentasBancarias()
    const unsubC = suscribirCuentasBancarias((data) => { setCuentas(data); setCargando(false) })
    const unsubU = suscribirUsuarios(setUsuarios)
    return () => { unsubC(); unsubU() }
  }, [])

  useEffect(() => {
    setCargando(true)
    return suscribirTransacciones(periodo.mes, periodo.anio, (data) => {
      setTransacciones(data)
      setCargando(false)
    })
  }, [periodo])

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
        if (!origen?.claveOperativa || !destino?.claveOperativa) {
          toast.error("La cuenta seleccionada no tiene una clave operativa válida")
          return
        }
        await trasladarEntreCuentas({
          cuentaOrigenClaveOperativa: origen.claveOperativa,
          cuentaDestinoClaveOperativa: destino.claveOperativa,
          monto,
          concepto:        form.concepto || "traslado",
          usuarioId:       usuario.uid,
          usuarioNombre:   usuario.nombre,
        })
        toast.success("Traslado registrado")
      } else {
        if (!origen?.claveOperativa) {
          toast.error("La cuenta seleccionada no tiene una clave operativa válida")
          return
        }
        await registrarTransaccion({ cuentaClaveOperativa: origen.claveOperativa, cuentaNombre: origen.nombre ?? "", tipo: modal, monto, concepto: form.concepto, categoria: form.categoria, referencia: form.referencia, usuarioId: usuario.uid, usuarioNombre: usuario.nombre })
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
  const nombres = useMemo(() => crearIndiceNombres(usuarios), [usuarios])
  const ingresos = useMemo(
    () => transacciones.filter((tx) => tx.tipo === "ingreso").reduce((total, tx) => total + (tx.monto || 0), 0),
    [transacciones],
  )
  const gastos = useMemo(
    () => transacciones.filter((tx) => tx.tipo === "egreso").reduce((total, tx) => total + (tx.monto || 0), 0),
    [transacciones],
  )
  const resultadoNeto = ingresos - gastos
  const gastosPorCategoria = useMemo(() => {
    const porCategoria = new Map<string, number>()
    transacciones
      .filter((tx) => tx.tipo === "egreso")
      .forEach((tx) => porCategoria.set(tx.categoria || "sin-categoria", (porCategoria.get(tx.categoria || "sin-categoria") || 0) + (tx.monto || 0)))
    return [...porCategoria.entries()].sort(([, montoA], [, montoB]) => montoB - montoA)
  }, [transacciones])
  const transaccionesVisibles = useMemo(
    () => filtroMovimiento === "todos" ? transacciones : transacciones.filter((tx) => tx.tipo === filtroMovimiento),
    [filtroMovimiento, transacciones],
  )
  const etiquetaCategoria = (categoria: string) => [...CATEGORIAS_EGRESO, ...CATEGORIAS_INGRESO].find((item) => item.value === categoria)?.label || categoria
  const etiquetaPeriodo = new Date(periodo.anio, periodo.mes - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" })
  const esPeriodoActual = (() => {
    const ahora = new Date()
    return ahora.getMonth() + 1 === periodo.mes && ahora.getFullYear() === periodo.anio
  })()
  const cambiarPeriodo = (delta: number) => {
    const siguiente = new Date(periodo.anio, periodo.mes - 1 + delta, 1)
    setPeriodo({ mes: siguiente.getMonth() + 1, anio: siguiente.getFullYear() })
  }

  if (cargando) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
    </div>
  )

  return (
    <div className="pb-4 space-y-4">
      {/* Header */}
      <div className="pt-2 pb-1">
        <h1 className="text-2xl font-bold text-foreground">Finanzas</h1>
        <p className="text-muted-foreground text-sm">Saldos, flujo de caja y movimientos del negocio</p>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-card/50 border border-border px-3 py-2">
        <button onClick={() => cambiarPeriodo(-1)} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground" aria-label="Mes anterior">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/80">Periodo analizado</p>
          <p className="text-sm font-bold text-foreground capitalize">{etiquetaPeriodo}</p>
        </div>
        <button onClick={() => cambiarPeriodo(1)} disabled={esPeriodoActual} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground/80 hover:bg-muted/50 hover:text-foreground disabled:opacity-20 disabled:hover:bg-transparent" aria-label="Mes siguiente">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Saldo total */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 p-5">
        <p className="text-xs font-semibold text-muted-foreground/80 uppercase tracking-wider mb-1">Saldo Total</p>
        <p className="text-4xl font-black text-foreground tracking-tight">{formatCurrency(saldoTotal)}</p>
        <p className="text-xs text-muted-foreground mt-2">Saldo actual de todas las cuentas</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-300/70">Ingresos</p>
          <p className="text-sm font-black text-emerald-300 mt-1">{formatCurrency(ingresos)}</p>
        </div>
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-red-300/70">Gastos</p>
          <p className="text-sm font-black text-red-300 mt-1">{formatCurrency(gastos)}</p>
        </div>
        <div className={cn("rounded-xl border p-3", resultadoNeto >= 0 ? "bg-blue-500/10 border-blue-500/20" : "bg-orange-500/10 border-orange-500/20")}>
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/80">Resultado</p>
          <p className={cn("text-sm font-black mt-1", resultadoNeto >= 0 ? "text-blue-300" : "text-orange-300")}>{formatCurrency(resultadoNeto)}</p>
        </div>
      </div>

      {gastosPorCategoria.length > 0 && (
        <div className="rounded-2xl bg-card/50 border border-border/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <PieChart className="h-4 w-4 text-orange-400" />
            <div>
              <h2 className="text-sm font-bold text-foreground">En qué se está yendo el dinero</h2>
              <p className="text-[11px] text-muted-foreground/80">Gastos agrupados por categoría</p>
            </div>
          </div>
          <div className="space-y-3">
            {gastosPorCategoria.slice(0, 5).map(([categoria, monto]) => {
              const porcentaje = gastos > 0 ? Math.round((monto / gastos) * 100) : 0
              return (
                <div key={categoria}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground truncate">{etiquetaCategoria(categoria)}</span>
                    <span className="text-foreground/80 font-bold shrink-0 ml-2">{formatCurrency(monto)} · {porcentaje}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                    <div className="h-full rounded-full bg-orange-400" style={{ width: `${porcentaje}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Cuentas */}
      <div className="grid grid-cols-2 gap-3">
        {cuentas.map(cuenta => (
          <div key={cuenta.id} className="rounded-2xl bg-card/50 border border-border/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: cuenta.color + "33" }}>
                <Wallet className="h-3.5 w-3.5" style={{ color: cuenta.color }} />
              </div>
              <span className="text-xs font-semibold text-muted-foreground/80 truncate">{cuenta.nombre}</span>
            </div>
            <p className="text-xl font-black text-foreground">{formatCurrency(cuenta.saldo)}</p>
            <span className="text-[10px] font-bold uppercase text-muted-foreground/70">{cuenta.tipo}</span>
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
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-bold text-muted-foreground/80 uppercase tracking-wider">Movimientos</h2>
            <p className="text-[11px] text-muted-foreground/80 mt-1">{transacciones.length} registrados en el periodo</p>
          </div>
          <div className="flex gap-1">
            {([['todos', 'Todos'], ['ingreso', 'Ingresos'], ['egreso', 'Gastos']] as const).map(([value, label]) => (
              <button key={value} onClick={() => setFiltroMovimiento(value)} className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold border", filtroMovimiento === value ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground")}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {transaccionesVisibles.length === 0 ? (
          <div className="rounded-2xl bg-card/50 border border-border/50 py-12 flex flex-col items-center gap-2">
            <Wallet className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground/70">Sin movimientos para este filtro</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-card/50 border border-border/50 divide-y divide-border/50 overflow-hidden">
            {transaccionesVisibles.map(tx => (
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
                  <p className="text-sm font-semibold text-foreground truncate">{tx.concepto}</p>
                  <p className="text-xs text-muted-foreground/70">
                    {tx.cuentaNombre} · {tx.fecha?.seconds ? new Date(tx.fecha.seconds * 1000).toLocaleDateString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </p>
                  <p className="text-[11px] text-foreground/45 mt-0.5">
                    Reportó: {resolverNombreActor(tx.usuarioId, tx.usuarioNombreSnapshot ?? tx.usuarioNombre, nombres)}
                  </p>
                </div>
                <p className={cn(
                  "text-sm font-black shrink-0",
                  tx.tipo === "ingreso" ? "text-emerald-400" : tx.tipo === "egreso" ? "text-red-400" : "text-muted-foreground"
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
          <div className="relative w-full sm:max-w-md sm:rounded-3xl max-w-lg mx-auto bg-card border border-border rounded-t-3xl sm:rounded-3xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-muted rounded-full mx-auto -mt-2 mb-2 sm:hidden" />
            <h3 className="text-lg font-bold text-foreground">
              {modal === "ingreso" ? "Registrar Ingreso" : modal === "egreso" ? "Registrar Gasto" : "Trasladar Dinero"}
            </h3>

            {/* Cuenta origen */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground/80 uppercase">{modal === "traslado" ? "Cuenta origen" : "Cuenta"}</label>
              <select value={form.cuentaId} onChange={e => setForm(f => ({ ...f, cuentaId: e.target.value }))} className="w-full bg-card/50 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50">
                <option value="">Seleccionar cuenta...</option>
                {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre} — {formatCurrency(c.saldo)}</option>)}
              </select>
            </div>

            {/* Cuenta destino (solo traslado) */}
            {modal === "traslado" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground/80 uppercase">Cuenta destino</label>
                <select value={form.cuentaDestinoId} onChange={e => setForm(f => ({ ...f, cuentaDestinoId: e.target.value }))} className="w-full bg-card/50 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-amber-500/50">
                  <option value="">Seleccionar destino...</option>
                  {cuentas.filter(c => c.id !== form.cuentaId).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )}

            {/* Monto */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground/80 uppercase">Monto</label>
              <input type="number" inputMode="numeric" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="0" className="w-full bg-card/50 border border-border rounded-xl px-3 py-2.5 text-xl font-black text-foreground focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/50" />
            </div>

            {/* Concepto */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground/80 uppercase">Concepto</label>
              <input type="text" value={form.concepto} onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))} placeholder={modal === "egreso" ? "Ej: Pago arriendo" : modal === "ingreso" ? "Ej: Inyección capital" : "Descripción del traslado"} className="w-full bg-card/50 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/50" />
            </div>

            {/* Categoría (no traslado) */}
            {modal !== "traslado" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground/80 uppercase">Categoría</label>
                <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className="w-full bg-card/50 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50">
                  <option value="">Seleccionar...</option>
                  {(modal === "egreso" ? CATEGORIAS_EGRESO : CATEGORIAS_INGRESO).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setModal(null)} className="flex-1 py-3 rounded-xl border border-border text-sm font-bold text-muted-foreground active:bg-card/50">
                Cancelar
              </button>
              <button onClick={guardar} disabled={guardando} className={cn(
                "flex-1 py-3 rounded-xl text-sm font-bold text-foreground active:scale-95 transition-transform disabled:opacity-50",
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
