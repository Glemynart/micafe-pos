"use client"

import { useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, RefreshCw, Snowflake } from "lucide-react"
import {
  abrirProductoNevera,
  preflightAperturaNevera,
} from "@/lib/bodega/nevera-service"
import {
  construirComandoAperturaProductoNevera,
  type ComandoAperturaNevera,
  type ProductoPreflightAperturaNevera,
  type ResultadoPreflightAperturaNevera,
} from "@/lib/bodega/nevera-contract"
import { mensajeErrorBodega } from "@/lib/bodega/ui-contract"

const money = (value: number) => new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
}).format(value)

const statusLabel: Record<ProductoPreflightAperturaNevera["estado"], string> = {
  LISTO: "FIFO listo",
  APERTURA_PENDIENTE: "Apertura pendiente",
  CAPAS_DIVERGENTES: "Capas por revisar",
  BLOQUEADO: "Bloqueado",
}

export function NeveraAperturaAdmin() {
  const [resultado, setResultado] = useState<ResultadoPreflightAperturaNevera | null>(null)
  const [confirmaciones, setConfirmaciones] = useState<Record<string, boolean>>({})
  const [procesando, setProcesando] = useState<Record<string, boolean>>({})
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")
  const [mensaje, setMensaje] = useState("")
  const comandos = useRef<Record<string, ComandoAperturaNevera>>({})

  async function ejecutarPreflight() {
    setCargando(true)
    setError("")
    setMensaje("")
    setConfirmaciones({})
    try {
      setResultado(await preflightAperturaNevera())
    } catch (cause) {
      setError(mensajeErrorBodega(cause))
    } finally {
      setCargando(false)
    }
  }

  async function abrirProducto(producto: ProductoPreflightAperturaNevera) {
    if (!resultado?.reconstruible || producto.estado !== "APERTURA_PENDIENTE" || !producto.ledgerHash) return
    const key = `${producto.productoId}:${producto.ledgerHash}`
    const command = comandos.current[key] ?? construirComandoAperturaProductoNevera(producto.productoId, producto.ledgerHash)
    comandos.current[key] = command
    setProcesando(current => ({ ...current, [producto.productoId]: true }))
    setError("")
    setMensaje("")
    try {
      const apertura = await abrirProductoNevera(command)
      delete comandos.current[key]
      await ejecutarPreflight()
      setMensaje(`${producto.nombre ?? producto.productoId}: apertura registrada; cargo interno ${money(apertura.cargoAperturaCOP ?? 0)}.`)
    } catch (cause) {
      setError(mensajeErrorBodega(cause))
    } finally {
      setProcesando(current => ({ ...current, [producto.productoId]: false }))
    }
  }

  const pendientes = resultado?.productos.filter(item => item.estado === "APERTURA_PENDIENTE") ?? []

  return <section className="mb-6 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900 dark:bg-sky-950/20">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200"><Snowflake className="size-5" /></span>
        <div>
          <h2 className="font-semibold">Conciliación de costo FIFO · Nevera</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">El preflight solo lee el kardex. Abrir un producto escribe sus capas FIFO y el cargo interno exacto; ejecuta esa acción únicamente dentro de un corte aprobado.</p>
        </div>
      </div>
      <button type="button" onClick={() => void ejecutarPreflight()} disabled={cargando} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold disabled:opacity-50">
        <RefreshCw className={`size-4 ${cargando ? "animate-spin" : ""}`} />
        {cargando ? "Revisando…" : resultado ? "Actualizar preflight" : "Ejecutar preflight solo lectura"}
      </button>
    </div>

    {error && <p role="alert" className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
    {mensaje && <p role="status" className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{mensaje}</p>}

    {resultado && <div className="mt-4 space-y-3">
      <div className="rounded-xl border border-border bg-background p-3 text-sm">
        <p><strong>{resultado.totalProductos}</strong> productos · <strong>{pendientes.length}</strong> aperturas pendientes · saldo de control actual: <strong>{resultado.saldoControlCOP === null ? "inválido" : money(resultado.saldoControlCOP)}</strong></p>
        {!resultado.reconstruible && <p className="mt-2 flex items-start gap-2 text-amber-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" />Hay diferencias en el kardex o capas. No se habilita ninguna apertura; corrige y vuelve a ejecutar el preflight.</p>}
        {resultado.reconstruible && pendientes.length === 0 && resultado.saldoControlCoincide && <p className="mt-2 flex items-center gap-2 text-emerald-700"><CheckCircle2 className="size-4" />Las capas están listas y el saldo de control coincide.</p>}
        {resultado.reconstruible && pendientes.length > 0 && <p className="mt-2 text-muted-foreground">Abre cada producto por separado después de revisar su cantidad y costo reconstruidos. La huella se vuelve a validar en el servidor.</p>}
      </div>

      <div className="grid gap-2 @4xl:grid-cols-2">
        {resultado.productos.map(producto => {
          const puedeAbrir = resultado.reconstruible && producto.estado === "APERTURA_PENDIENTE" && !!producto.ledgerHash
          return <article key={producto.productoId} className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="truncate font-semibold">{producto.nombre ?? producto.productoId}</p><p className="text-xs text-muted-foreground">Stock {producto.stock} · {producto.movimientos ?? 0} movimientos · {producto.capasEsperadas ?? 0} capas esperadas</p></div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${producto.estado === "LISTO" ? "bg-emerald-100 text-emerald-800" : producto.estado === "APERTURA_PENDIENTE" ? "bg-amber-100 text-amber-900" : "bg-rose-100 text-rose-800"}`}>{statusLabel[producto.estado]}</span>
            </div>
            {producto.valorExistenciaCOP !== undefined && <p className="mt-2 text-sm">Costo de apertura: <strong>{money(producto.valorExistenciaCOP)}</strong></p>}
            {producto.motivo && <p className="mt-2 text-xs text-rose-800">Detalle: {producto.motivo}</p>}
            {puedeAbrir && <div className="mt-3 border-t border-border pt-3">
              <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={confirmaciones[producto.productoId] === true} onChange={event => setConfirmaciones(current => ({ ...current, [producto.productoId]: event.target.checked }))} className="mt-0.5" />Confirmo el stock {producto.stock} y el cargo interno de {money(producto.valorExistenciaCOP ?? 0)} según el kardex de este preflight.</label>
              <button type="button" onClick={() => void abrirProducto(producto)} disabled={!confirmaciones[producto.productoId] || procesando[producto.productoId]} className="mt-3 h-10 w-full rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">{procesando[producto.productoId] ? "Abriendo capas…" : `Abrir FIFO · ${money(producto.valorExistenciaCOP ?? 0)}`}</button>
            </div>}
          </article>
        })}
      </div>
    </div>}
  </section>
}
