"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuthContext } from "@/contexts/auth-context"
import { Loader2, ShoppingCart, Trash2, Clock, ClipboardList, TrendingUp, TrendingDown, AlertCircle, CalendarDays, Sparkles } from "lucide-react"
import { formatCurrency } from "@/lib/demo-data"
import { collection, query, orderBy, getDocs, limit, where } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { getEmpresaId } from "@/lib/tenant"
import Link from "next/link"
import { suscribirEventos, type Evento, CATEGORIAS_EVENTOS } from "@/lib/eventos-service"
import { suscribirTransacciones, type TransaccionFinanciera } from "@/lib/finanzas-service"
import { suscribirUsuarios, type Usuario } from "@/lib/permisos-service"
import { crearIndiceNombres, resolverNombreActor } from "@/lib/actor-display"

interface CompraRaw { id: string; total?: number }
interface MermaRaw { id: string; costo?: number }
interface TurnoRaw { id: string; cajeroId?: string; estado?: string; cajeroNombre?: string; totalEsperadoEfectivo?: number; fechaApertura?: { toDate: () => Date } }
interface CuentaRaw { id: string; estado?: string; totales?: { total: number }; clienteNombre?: string; fecha?: { toDate: () => Date } }

export default function DashboardPage() {
  const { usuario } = useAuthContext()
  const [compras, setCompras] = useState<CompraRaw[]>([])
  const [mermas, setMermas] = useState<MermaRaw[]>([])
  const [turnos, setTurnos] = useState<TurnoRaw[]>([])
  const [cuentas, setCuentas] = useState<CuentaRaw[]>([])
  const [transacciones, setTransacciones] = useState<TransaccionFinanciera[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [cargando, setCargando] = useState(true)
  const [cargandoEventos, setCargandoEventos] = useState(true)

  const isMarketing = usuario?.rol === "marketing"

  useEffect(() => {
    (async () => {
      try {
        const empresaId = await getEmpresaId()
        const [cSnap, mSnap, tSnap, ctSnap] = await Promise.all([
          getDocs(query(collection(db, "compras"), where("empresaId", "==", empresaId), orderBy("fecha", "desc"), limit(20))),
          getDocs(query(collection(db, "mermas"), where("empresaId", "==", empresaId), orderBy("fecha", "desc"), limit(20))),
          getDocs(query(collection(db, "turnos"), where("empresaId", "==", empresaId), orderBy("fechaApertura", "desc"), limit(10))),
          getDocs(query(collection(db, "ventas"), where("empresaId", "==", empresaId), where("metodoPago", "==", "cuenta_cobro"), where("estado", "==", "pendiente"), limit(20))),
        ])
        setCompras(cSnap.docs.map(d => ({ id: d.id, ...d.data() } as CompraRaw)))
        setMermas(mSnap.docs.map(d => ({ id: d.id, ...d.data() } as MermaRaw)))
        setTurnos(tSnap.docs.map(d => ({ id: d.id, ...d.data() } as TurnoRaw)))
        setCuentas(ctSnap.docs.map(d => ({ id: d.id, ...d.data() } as CuentaRaw)))
      } catch {} finally { setCargando(false) }
    })()
  }, [])

  useEffect(() => {
    const ahora = new Date()
    const unsubTransacciones = suscribirTransacciones(ahora.getMonth() + 1, ahora.getFullYear(), setTransacciones)
    const unsubUsuarios = suscribirUsuarios(setUsuarios)
    return () => { unsubTransacciones(); unsubUsuarios() }
  }, [])

  useEffect(() => {
    const unsub = suscribirEventos(true, (data) => {
      setEventos(data.filter(e => e.fecha >= new Date().toISOString().split("T")[0]))
      setCargandoEventos(false)
    }, () => setCargandoEventos(false))
    return unsub
  }, [])

  const tCompras = compras.reduce((a, c) => a + (c.total || 0), 0)
  const tMermas = mermas.reduce((a, m) => a + (m.costo || 0), 0)
  const tActivos = turnos.filter(t => t.estado === "abierto").length
  const cPend = cuentas.length
  const tCuentas = cuentas.reduce((a, c) => a + (c.totales?.total || 0), 0)
  const tGastos = transacciones.filter((tx) => tx.tipo === "egreso").reduce((a, tx) => a + (tx.monto || 0), 0)
  const tIngresos = transacciones.filter((tx) => tx.tipo === "ingreso").reduce((a, tx) => a + (tx.monto || 0), 0)
  const nombres = useMemo(() => crearIndiceNombres(usuarios), [usuarios])
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? "Buenos dias" : hour < 18 ? "Buenas tardes" : "Buenas noches"

  const catColors: Record<string, string> = {
    "Musica en vivo": "bg-purple-500/20 text-purple-300",
    "Taller": "bg-emerald-500/20 text-emerald-300",
    "Conferencia": "bg-blue-500/20 text-blue-300",
    "Networking": "bg-amber-500/20 text-amber-300",
    "Arte y Cultura": "bg-rose-500/20 text-rose-300",
    "Gastronomia": "bg-orange-500/20 text-orange-300",
    "Otro": "bg-muted/50 text-muted-foreground/80",
  }

  if (cargando) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
    </div>
  )

  const Saludo = () => (
    <div className="px-4 pt-5 pb-4 border-b border-border/50">
      <p className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-widest">{greeting}</p>
      <h1 className="text-xl font-bold text-foreground mt-0.5">{usuario?.nombre || "Administrador"}</h1>
      <p className="text-xs text-muted-foreground/70 mt-1">{now.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</p>
    </div>
  )

  if (isMarketing) {
    return (
      <div className="pb-4">
        <Saludo />
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Eventos pendientes</p>
          </div>
          {cargandoEventos ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" /></div>
          ) : eventos.length === 0 ? (
            <div className="bg-card/50 border border-border rounded-xl p-6 text-center">
              <CalendarDays className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No hay eventos programados</p>
              <Link href="/admin/eventos" className="text-xs font-bold text-primary mt-2 inline-block">Crear evento →</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {eventos.slice(0, 6).map((e) => (
                <div key={e.id} className="bg-card/50 border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${catColors[e.categoria] || catColors["Otro"]}`}>
                      {e.categoria}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground">{e.titulo}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(e.fecha + "T" + e.hora).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "short" })}
                    {" · "}{e.hora}
                  </p>
                  {e.descripcion && <p className="text-xs text-muted-foreground/80 mt-1.5 line-clamp-2">{e.descripcion}</p>}
                </div>
              ))}
            </div>
          )}
          <Link href="/admin/eventos" className="flex items-center justify-center gap-1 mt-4 text-xs font-bold text-primary">
            Gestionar eventos <CalendarDays className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-4">
      <Saludo />

      <div className="px-4 pt-4">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Resumen general</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Compras", value: formatCurrency(tCompras), icon: ShoppingCart, accent: "text-blue-400", dot: "bg-blue-400", href: "/admin/compras" },
            { label: "Mermas", value: formatCurrency(tMermas), icon: Trash2, accent: "text-red-400", dot: "bg-red-400", href: "/admin/mermas" },
            { label: "Turnos activos", value: `${tActivos}`, icon: Clock, accent: "text-emerald-400", dot: "bg-emerald-400", href: "/admin/turnos" },
            { label: "Por cobrar", value: formatCurrency(tCuentas), icon: ClipboardList, accent: "text-amber-400", dot: "bg-amber-400", href: "/admin/cuentas-cobro" },
            { label: "Gastos del mes", value: formatCurrency(tGastos), icon: TrendingDown, accent: "text-orange-400", dot: "bg-orange-400", href: "/admin/gastos" },
          ].map((kpi) => {
            const Icon = kpi.icon
            return (
              <Link key={kpi.label} href={kpi.href}
                className="bg-card/50 border border-border rounded-xl p-4 hover:border-border hover:bg-muted/50 transition-colors active:scale-[0.98]"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{kpi.label}</span>
                  <Icon className={`h-4 w-4 ${kpi.accent}`} />
                </div>
                <p className="text-lg font-bold text-foreground tabular-nums">{kpi.value}</p>
                <div className={`mt-2 h-0.5 w-8 ${kpi.dot} rounded-full opacity-60`} />
              </Link>
            )
          })}
        </div>
      </div>

      {cPend > 0 && (
        <div className="px-4 mt-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-300">{cPend} cuentas pendientes de cobro</p>
              <p className="text-xs text-amber-400/70 mt-0.5">Total: {formatCurrency(tCuentas)}</p>
            </div>
            <Link href="/admin/cuentas-cobro" className="text-xs font-bold text-amber-400 shrink-0">Ver</Link>
          </div>
        </div>
      )}

      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Ultimos turnos</p>
          <Link href="/admin/turnos" className="text-[10px] font-bold text-primary uppercase tracking-wider">Ver todos</Link>
        </div>
        <div className="bg-card/50 border border-border rounded-xl overflow-hidden divide-y divide-border/50">
          {turnos.length === 0 ? (
            <p className="text-sm text-muted-foreground/70 text-center py-8">No hay turnos registrados</p>
          ) : (
            turnos.slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground/80">{resolverNombreActor(t.cajeroId, t.cajeroNombre, nombres)}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    {t.fechaApertura?.toDate?.().toLocaleDateString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="text-right">
                  {t.estado === "abierto" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-2 py-0.5">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />ABIERTO
                    </span>
                  ) : (
                    <span className="text-sm font-semibold text-muted-foreground tabular-nums">{formatCurrency(t.totalEsperadoEfectivo || 0)}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="px-4 mt-5">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Actividad reciente</p>
        <div className="bg-card/50 border border-border rounded-xl overflow-hidden divide-y divide-border/50">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-blue-500/15 rounded-lg flex items-center justify-center"><ShoppingCart className="h-3.5 w-3.5 text-blue-400" /></div>
              <span className="text-sm text-foreground/70">Ultimas compras</span>
            </div>
            <span className="text-sm font-semibold text-muted-foreground/80">{compras.length} registros</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-red-500/15 rounded-lg flex items-center justify-center"><Trash2 className="h-3.5 w-3.5 text-red-400" /></div>
              <span className="text-sm text-foreground/70">Mermas registradas</span>
            </div>
            <span className="text-sm font-semibold text-muted-foreground/80">{mermas.length} registros</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-emerald-500/15 rounded-lg flex items-center justify-center"><TrendingUp className="h-3.5 w-3.5 text-emerald-400" /></div>
              <span className="text-sm text-foreground/70">Todos los turnos</span>
            </div>
            <span className="text-sm font-semibold text-muted-foreground/80">{turnos.length} registros</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 bg-emerald-500/15 rounded-lg flex items-center justify-center"><TrendingUp className="h-3.5 w-3.5 text-emerald-400" /></div>
              <span className="text-sm text-foreground/70">Ingresos del mes</span>
            </div>
            <span className="text-sm font-semibold text-muted-foreground/80">{formatCurrency(tIngresos)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
