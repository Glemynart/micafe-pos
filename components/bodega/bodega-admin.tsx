"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowUpRight, Boxes, CalendarDays, CheckCircle2, CircleDollarSign, PackagePlus, Printer, RefreshCw, Settings, Tags, Users, XCircle } from "lucide-react"
import { useConfiguracionEmpresa } from "@/contexts/configuracion-empresa-context"
import { useAuthContext } from "@/contexts/auth-context"
import { actualizarCliente, crearCliente, eliminarCliente, type Cliente } from "@/lib/clientes-service"
import { ajustarStockProductoBodega, crearCategoriaBodega, crearPresentacionBodega, crearProductoBodega, listarCategoriasBodega, listarEspaciosBodega, suscribirClientesBodegaAdmin, suscribirPresentacionesBodegaAdmin, suscribirProductosBodegaAdmin, suscribirVentasBodegaAdmin, actualizarPresentacionBodega, type PresentacionBodegaAdmin, type ProductoBodegaAdmin, type VentaBodegaAdmin } from "@/lib/bodega/admin-service"
import { calcularCambioEfectivoBodega, formatearFechaBodega, formatearReferenciaSolicitud, mensajeErrorBodega } from "@/lib/bodega/ui-contract"
import { construirConfirmacionVentaBodega, type ConfirmacionVentaBodega, type LineaCarritoBodega, type MetodoPagoBodega, type ResultadoVentaBodega, type SolicitudVentaBodegaDTO } from "@/lib/bodega/ui-contract"
import { cancelarSolicitudVentaBodega, consultarSolicitudesVentaBodega, resolverSolicitudVentaBodega } from "@/lib/bodega/solicitudes-service"
import { confirmarVentaBodega } from "@/lib/bodega/vendedor-service"
import { suscribirTurnoActivo, type Turno } from "@/lib/turnos-service"
import { crearDetectorCambioSenalBodega, registrarRecuperacionEnLineaBodega, suscribirSenalBodega } from "@/lib/bodega/live-signals-service"
import { crearRefrescoCoalescido } from "@/lib/bodega/refresh-coalescido"
import { proyectarMargenCompraPorPresentaciones } from "@/lib/bodega/purchase-margin"
import { filtrarProductosCatalogoBodega } from "@/lib/bodega/catalog-filter"
import type { CatalogoId } from "@/lib/bodega/catalog-scope"
import { BodegaEditorDialog, BodegaEmptyState, BodegaSearch } from "@/components/bodega/admin-ui"
import { toast } from "sonner"
import { NeveraRetailView } from "@/components/bodega/nevera-retail-view"
import { NeveraAperturaAdmin } from "@/components/bodega/nevera-apertura-admin"
import { imprimirReciboInternoVentaBodega } from "@/lib/bodega/recibo-interno-print"
import type { ReciboInternoVentaBodega } from "@/lib/bodega/recibo-interno"

const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)
const formatCopInput = (value: number) => value > 0 ? new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value) : ""
const parseCopInput = (value: string) => {
  const digits = value.replace(/\D/g, "")
  const parsed = Number(digits)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}
const cards = [
  { href: "/admin/catalogo", label: "Productos y precios", detail: "Catálogo base y presentaciones", icon: Tags },
  { href: "/admin/clientes", label: "Clientes", detail: "Directorio comercial", icon: Users },
  { href: "/admin/inventario", label: "Inventario", detail: "Stock en unidad base", icon: Boxes },
  { href: "/admin/compras", label: "Compras", detail: "Registrar entradas desde proveedores", icon: PackagePlus },
  { href: "/admin/vender", label: "Registrar venta", detail: "Venta directa de administración", icon: CircleDollarSign },
  { href: "/admin/solicitudes", label: "Solicitudes", detail: "Revisar y aprobar ventas de vendedores", icon: CheckCircle2 },
  { href: "/admin/agenda", label: "Agenda", detail: "Pedidos futuros y stock reservado", icon: CalendarDays },
  { href: "/admin/ventas", label: "Ventas", detail: "Consulta operativa", icon: CircleDollarSign },
  { href: "/admin/permisos", label: "Configuración operativa", detail: "Usuarios y permisos existentes", icon: Settings },
]

export function useBodegaAdminData(catalogo: CatalogoId = "BODEGA") {
  const [productos, setProductos] = useState<ProductoBodegaAdmin[]>([])
  const [presentaciones, setPresentaciones] = useState<PresentacionBodegaAdmin[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [ventas, setVentas] = useState<VentaBodegaAdmin[]>([])
  const [cargando, setCargando] = useState(true)
  const cargados = useRef(new Set<string>())
  useEffect(() => {
    cargados.current.clear()
    setCargando(true)
    const recibido = (nombre: string) => { cargados.current.add(nombre); if (cargados.current.size === 4) setCargando(false) }
    const unsubs = [suscribirProductosBodegaAdmin(catalogo, items => { setProductos(items); recibido("productos") }), suscribirPresentacionesBodegaAdmin(catalogo, items => { setPresentaciones(items); recibido("presentaciones") }), suscribirClientesBodegaAdmin(items => { setClientes(items); recibido("clientes") }), suscribirVentasBodegaAdmin(items => { setVentas(items); recibido("ventas") })]
    return () => unsubs.forEach(unsub => unsub())
  }, [catalogo])
  return { productos, presentaciones, clientes, ventas, cargando }
}

export function BodegaAdminDashboard() {
  const { productos, presentaciones, clientes, ventas, cargando } = useBodegaAdminData()
  if (cargando) return <AdminLoading />
  const total = ventas.reduce((sum, venta) => sum + venta.total, 0)
  return <div className="space-y-8">
    <section className="flex flex-col justify-between gap-5 @3xl:flex-row @3xl:items-end">
      <div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary">Vista general</p><h1 className="mt-2 text-3xl font-semibold tracking-tight @3xl:text-4xl">Tu negocio, de un vistazo</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">Productos, clientes y operaciones. Todo lo que necesitas para llevar el control de tu bodega.</p></div>
      <Link href="/admin/vender" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm"><CircleDollarSign className="size-4" />Registrar venta<ArrowUpRight className="size-4" /></Link>
    </section>
    <section aria-label="Resumen de la bodega" className="grid grid-cols-2 gap-3 @4xl:grid-cols-4">
      <Kpi label="Ventas registradas" value={String(ventas.length)} />
      <Kpi label="Total en ventas" value={money(total)} />
      <Kpi label="Productos activos" value={String(productos.filter(p => p.activo).length)} />
      <Kpi label="Clientes activos" value={String(clientes.filter(c => c.activo).length)} />
    </section>
    {productos.length === 0 && <section className="flex flex-col gap-5 rounded-2xl border border-primary/15 bg-primary/5 p-6 @3xl:flex-row @3xl:items-center @3xl:justify-between"><div><p className="text-xs font-semibold text-primary">PREPARA TU NEGOCIO</p><h2 className="mt-2 text-xl font-semibold tracking-tight">Dale vida a tu catálogo</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Crea productos y presentaciones, revisa sus precios y registra las existencias antes de comenzar a vender.</p></div><Link href="/admin/catalogo" className="admin-action shrink-0">Configurar catálogo<ArrowUpRight className="size-4" /></Link></section>}
    <section><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold tracking-tight">Tu espacio de trabajo</h2><span className="text-xs text-muted-foreground">{presentaciones.filter(p => p.activo).length} presentaciones activas</span></div><div className="grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-3">{cards.map(card => <Link key={card.href} href={card.href} className="group flex items-center gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary"><card.icon className="size-5" /></span><div className="min-w-0 flex-1"><p className="font-semibold tracking-tight">{card.label}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.detail}</p></div><ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" /></Link>)}</div></section>
  </div>
}

function Kpi({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-2xl border border-border/70 bg-card p-4 shadow-xs sm:p-5"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-3 break-words text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</p></div> }

export function BodegaAdminRoute({ children }: { children: React.ReactNode }) {
  const { vertical, estado } = useConfiguracionEmpresa()
  const { usuario } = useAuthContext()
  if (estado === "CARGANDO") return <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">Cargando configuración…</div>
  if (estado !== "LISTA" || vertical === null) return <div className="rounded-2xl border border-border p-8 text-center text-muted-foreground">No fue posible verificar la configuración operativa.</div>
  if (vertical !== "BODEGA_MVP1") return <div className="rounded-2xl border border-border p-8 text-center text-muted-foreground">Esta pantalla solo está disponible para el vertical Bodega.</div>
  if (usuario?.rol !== "admin") return <div className="rounded-2xl border border-border p-8 text-center text-muted-foreground">Acceso reservado al administrador de Bodega.</div>
  return <>{children}</>
}

export function BodegaCatalogoAdmin() {
  const [catalogo, setCatalogo] = useState<CatalogoId>("BODEGA")
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas")
  const { productos, presentaciones, cargando } = useBodegaAdminData(catalogo)
  const [espacios, setEspacios] = useState<Array<{ id: string; nombre: string }>>([])
  const [categorias, setCategorias] = useState<Array<{ id: string; nombre: string; espacioId: string; catalogoId: CatalogoId }>>([])
  const [categoria, setCategoria] = useState({ espacioId: "", nombre: "", icono: "" })
  const [producto, setProducto] = useState({ nombre: "", categoriaId: "", espacioId: "", unidad: "unidad", stock: 0, stockMinimo: 0, costo: 0 })
  const [presentacion, setPresentacion] = useState({ productoId: "", nombre: "", factorUnidadBase: 1, precioTiendaCOP: 0 })
  const [error, setError] = useState(""); const [guardando, setGuardando] = useState(false)
  const [busquedaCatalogo, setBusquedaCatalogo] = useState("")
  const [categoriaAbierta, setCategoriaAbierta] = useState(false)
  const categoriasVisibles = useMemo(() => categorias.filter(item => item.catalogoId === catalogo), [categorias, catalogo])
  const categoriasOrdenadas = useMemo(() => [...categoriasVisibles].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [categoriasVisibles])
  const productosVisibles = filtrarProductosCatalogoBodega(productos, busquedaCatalogo, categoriaFiltro)
  useEffect(() => { let vigente = true; void Promise.all([listarEspaciosBodega(), listarCategoriasBodega(catalogo)]).then(([spaces, categories]) => { if (!vigente) return; setEspacios(spaces); setCategorias(categories); setCategoria(actual => ({ ...actual, espacioId: actual.espacioId || spaces[0]?.id || "" })); setProducto(actual => ({ ...actual, espacioId: actual.espacioId || spaces[0]?.id || "", categoriaId: categories[0]?.id || "" })) }).catch(e => { if (vigente) setError(mensajeErrorBodega(e)) }); return () => { vigente = false } }, [catalogo])
  useEffect(() => { setCategoriaFiltro("todas") }, [catalogo])
  useEffect(() => {
    if (categoriasVisibles.some(item => item.id === producto.categoriaId)) return
    setProducto(actual => ({ ...actual, categoriaId: categoriasVisibles[0]?.id ?? "" }))
  }, [catalogo, categoriasVisibles, producto.categoriaId])
  useEffect(() => {
    if (productos.some(item => item.catalogoId === catalogo && item.id === presentacion.productoId)) return
    setPresentacion(actual => ({ ...actual, productoId: productos.find(item => item.catalogoId === catalogo && item.activo)?.id ?? "" }))
  }, [catalogo, productos, presentacion.productoId])
  const run = async (action: () => Promise<unknown>) => { if (guardando) return; setGuardando(true); setError(""); try { await action() } catch (e) { setError(mensajeErrorBodega(e)) } finally { setGuardando(false) } }
  if (cargando) return <AdminLoading />
  return <AdminSection eyebrow="Catálogo Bodega" title="Catálogo de productos" description="Organiza tus productos, precios y presentaciones para vender con claridad.">
    {error && <ErrorBox>{error}</ErrorBox>}
    <div className="mb-5 max-w-sm"><label className="text-sm font-medium">Catálogo activo<select aria-label="Catálogo activo" value={catalogo} onChange={event => { setCatalogo(event.target.value as CatalogoId) }} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"><option value="BODEGA">Bodega · precios a tienda</option><option value="NEVERA">Nevera · precios consumidor final</option></select></label><p className="mt-2 text-xs text-muted-foreground">Los listados devuelven solo productos, presentaciones y categorías del catálogo elegido. Los registros Bodega antiguos sin discriminador siguen clasificados como Bodega.</p></div>
    <div className="mb-6 flex flex-wrap gap-2">
      <BodegaEditorDialog title="Nueva categoría" description="Organiza tus productos por familia." icon={Tags} disabled={guardando} open={categoriaAbierta} onOpenChange={setCategoriaAbierta}>
<form onSubmit={e => { e.preventDefault(); void run(async () => { const result = await crearCategoriaBodega({ espacioId: categoria.espacioId, catalogoId: catalogo, nombre: categoria.nombre, ...(categoria.icono.trim() ? { icono: categoria.icono } : {}) }); const actualizadas = await listarCategoriasBodega(catalogo); setCategorias(actualizadas); setProducto(actual => ({ ...actual, categoriaId: result.categoriaId })); setCategoria(actual => ({ ...actual, nombre: "", icono: "" })); toast.success("Guardado correctamente") }) }} className="admin-editor-form"><div className="grid gap-4 @md:grid-cols-2"><Input label="Nombre" value={categoria.nombre} onChange={nombre => setCategoria({ ...categoria, nombre })} required /><Input label="Icono (opcional)" value={categoria.icono} onChange={icono => setCategoria({ ...categoria, icono })} /><label className="text-sm">Espacio<select required value={categoria.espacioId} onChange={e => setCategoria({ ...categoria, espacioId: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">Seleccionar</option>{espacios.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label></div>{error && <ErrorBox>{error}</ErrorBox>}<Submit disabled={guardando || espacios.length === 0}>Crear categoría en {catalogo}</Submit>
      </form>
      </BodegaEditorDialog>
      <BodegaEditorDialog primary title="Nuevo producto" description="Registra la unidad base y los datos iniciales del producto." icon={PackagePlus} disabled={guardando}>
<form onSubmit={e => { e.preventDefault(); void run(async () => { const values = catalogo === "NEVERA" ? { ...producto, costo: 0, stock: 0, stockMinimo: 0 } : producto; await crearProductoBodega({ ...values, catalogoId: catalogo }); setProducto({ ...producto, nombre: "", stock: 0, stockMinimo: 0, costo: 0 }); toast.success("Guardado correctamente") }) }} className="admin-editor-form"><div className="grid gap-4 @md:grid-cols-2"><Input label="Nombre" value={producto.nombre} onChange={nombre => setProducto({ ...producto, nombre })} required /><label className="text-sm">Categoría<select required value={producto.categoriaId} onChange={e => setProducto({ ...producto, categoriaId: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">Seleccionar</option>{categoriasVisibles.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><Input label="Unidad base" value={producto.unidad} onChange={unidad => setProducto({ ...producto, unidad })} required /><label className="text-sm">Espacio<select required value={producto.espacioId} onChange={e => setProducto({ ...producto, espacioId: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">Seleccionar</option>{espacios.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>{catalogo === "BODEGA" ? <><NumberInput label="Costo por unidad base" value={producto.costo} onChange={costo => setProducto({ ...producto, costo })} /><NumberInput label="Stock inicial" value={producto.stock} onChange={stock => setProducto({ ...producto, stock })} /><NumberInput label="Stock mínimo" value={producto.stockMinimo} onChange={stockMinimo => setProducto({ ...producto, stockMinimo })} /></> : <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">Nevera inicia sin costo asignado ni existencias. Registra el costo y el stock desde Inventario cuando tengas el conteo físico.</p>}</div>{error && <ErrorBox>{error}</ErrorBox>}<Submit disabled={guardando || espacios.length === 0 || categoriasVisibles.length === 0}>Crear producto en {catalogo}</Submit>
      </form>
      </BodegaEditorDialog>
      <BodegaEditorDialog title="Nueva presentación" description={catalogo === "BODEGA" ? "Define el empaque y el precio a tienda." : "Define la unidad de venta y el precio retail independiente de Bodega."} icon={Tags} disabled={guardando}>
<form onSubmit={e => { e.preventDefault(); void run(async () => { await crearPresentacionBodega({ productoId: presentacion.productoId, nombre: presentacion.nombre, factorUnidadBase: presentacion.factorUnidadBase, precioTiendaCOP: presentacion.precioTiendaCOP }); setPresentacion({ ...presentacion, nombre: "", factorUnidadBase: 1, precioTiendaCOP: 0 }); toast.success("Guardado correctamente") }) }} className="admin-editor-form"><div className="grid gap-4 @md:grid-cols-2"><label className="text-sm">Producto<select required value={presentacion.productoId} onChange={e => setPresentacion({ ...presentacion, productoId: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">Seleccionar</option>{productos.filter(p => p.activo && p.catalogoId === catalogo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label><Input label="Nombre comercial" value={presentacion.nombre} onChange={nombre => setPresentacion({ ...presentacion, nombre })} required /><NumberInput min={1} label="Factor a unidad base" value={presentacion.factorUnidadBase} onChange={factorUnidadBase => setPresentacion({ ...presentacion, factorUnidadBase })} /><NumberInput min={1} label={catalogo === "BODEGA" ? "Precio a tienda COP" : "Precio retail COP"} value={presentacion.precioTiendaCOP} onChange={precioTiendaCOP => setPresentacion({ ...presentacion, precioTiendaCOP })} /></div>{error && <ErrorBox>{error}</ErrorBox>}<Submit disabled={guardando}>Crear presentación</Submit>
      </form>
      </BodegaEditorDialog>
    </div>
    <div className="my-6 flex flex-col gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-semibold tracking-tight">{catalogo === "BODEGA" ? "Productos de Bodega" : "Productos de Nevera"} <span className="ml-2 rounded-lg bg-primary/5 px-2 py-1 text-xs text-primary">{productosVisibles.length}</span></h2><p className="mt-1 text-sm text-muted-foreground">Precios, presentaciones y disponibilidad de este catálogo.</p></div><div className="grid w-full gap-2 sm:max-w-2xl sm:grid-cols-2"><BodegaSearch label="Buscar productos" placeholder="Buscar por nombre..." value={busquedaCatalogo} onChange={setBusquedaCatalogo} /><label className="grid gap-1 text-xs font-medium text-muted-foreground">Filtrar por categoría<select aria-label="Filtrar productos por categoría" value={categoriaFiltro} onChange={event => setCategoriaFiltro(event.target.value)} className="h-11 w-full rounded-xl border border-border/70 bg-background px-3 text-sm font-normal text-foreground"><option value="todas">Todas las categorías</option>{categoriasOrdenadas.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label></div></div>
    {productosVisibles.length === 0 && <BodegaEmptyState icon={PackagePlus} title={productos.length === 0 ? "Catálogo vacío" : "Sin coincidencias"} description={productos.length === 0 ? "Crea una categoría y agrega los productos de este catálogo." : "Prueba otro nombre o elige otra categoría."} />}
    <div className="grid gap-4 @4xl:grid-cols-2">{productosVisibles.map(p => {
      const items = presentaciones.filter(item => item.productoId === p.id)
      return <article key={p.id} className="@container/product min-w-0 rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
        <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary"><Boxes className="size-5" /></span><div className="min-w-0"><h3 className="break-words font-semibold tracking-tight">{p.nombre}</h3><p className="mt-1 text-xs text-muted-foreground">Unidad base: {p.unidad}</p></div></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${p.activo ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{p.activo ? "Activo" : "Inactivo"}</span></div>
        <dl className="my-5 grid grid-cols-3 divide-x divide-border/60 rounded-xl bg-muted/25 px-1 py-3">{[{label:"Stock físico",value:p.stock},{label:"Reservado",value:p.stockReservado},{label:"Disponible",value:Math.max(0,p.stock-p.stockReservado)}].map(metric => <div key={metric.label} className="px-3"><dt className="text-[10px] text-muted-foreground">{metric.label}</dt><dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{metric.value}</dd></div>)}</dl>
        <p className="text-xs text-muted-foreground">Costo base por unidad: <span className="font-medium text-foreground">{p.costoUnidadBaseCOP > 0 ? money(p.costoUnidadBaseCOP) : "Sin registrar"}</span></p>
        <details className="group mt-4 border-t border-border/60 pt-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">Presentaciones y precios<span className="rounded-lg bg-primary/5 px-2 py-1 text-xs text-primary">{items.length} <span className="ml-1 group-open:hidden">+</span></span></summary><div className="mt-4 grid gap-3 @2xl/product:grid-cols-2">{items.map(item => <PresentacionRow key={item.id} item={item} costoUnidadBaseCOP={p.costoUnidadBaseCOP} unidadBase={p.unidad} onSave={(precioTiendaCOP, costoPresentacionCOP, activo) => run(() => actualizarPresentacionBodega({ presentacionId: item.id, precioTiendaCOP, ...(costoPresentacionCOP === null ? {} : { costoPresentacionCOP }), activo }))} />)}{items.length === 0 && <p className="text-sm text-muted-foreground">Crea una presentación para asignar sus precios de venta.</p>}</div></details>
      </article>
    })}</div>
  </AdminSection>
}

function PresentacionRow({ item, costoUnidadBaseCOP, unidadBase, onSave }: {
  item: PresentacionBodegaAdmin
  costoUnidadBaseCOP: number
  unidadBase: string
  onSave(precioTiendaCOP: number, costoPresentacionCOP: number | null, active: boolean): void
}) {
  const [precioTienda, setPrecioTienda] = useState(formatCopInput(item.precioTiendaCOP))
  const [costoPresentacion, setCostoPresentacion] = useState(formatCopInput(item.costoPresentacionCOP ?? 0))
  const costoEditado = parseCopInput(costoPresentacion)
  const [margen] = proyectarMargenCompraPorPresentaciones(costoUnidadBaseCOP, [{
    ...item,
    costoPresentacionCOP: costoEditado || item.costoPresentacionCOP,
  }])
  const precioTiendaEditado = parseCopInput(precioTienda)

  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-sm font-semibold">{item.nombre}</p>
      <p className="text-xs text-muted-foreground">× {item.factorUnidadBase} unidades base ({unidadBase})</p>
      <p className="mt-1 text-xs text-muted-foreground">{item.catalogoId === "BODEGA" ? <>Venta a tienda: {money(item.precioTiendaCOP)} por presentación{item.precioConsumidorFinalCOP !== null && <> · Precio consumidor legado: {money(item.precioConsumidorFinalCOP)}</>}</> : <>Precio retail Nevera: {money(item.precioTiendaCOP)} por presentación</>}</p>
      {item.catalogoId === "NEVERA" ? <p className="mt-2 text-xs text-muted-foreground">El costo se registra por unidad base y las existencias desde Inventario, de forma independiente a Bodega.</p> : margen && margen.costoPresentacionCOP !== null && margen.utilidadBrutaCOP !== null && margen.margenBrutoPorcentaje !== null ? (
        <dl className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-border/60 bg-card p-3"><div><dt className="text-[10px] text-muted-foreground">Costo de compra por presentación</dt><dd className="mt-1 text-sm font-semibold">{money(margen.costoPresentacionCOP)}</dd></div><div><dt className="text-[10px] text-muted-foreground">Utilidad bruta estimada</dt><dd className="mt-1 text-sm font-semibold">{money(margen.utilidadBrutaCOP)}</dd></div><div className="col-span-2 flex items-center justify-between border-t border-border/60 pt-2"><dt className="text-[10px] text-muted-foreground">Margen bruto sobre la venta</dt><dd className="text-sm font-semibold">{margen.margenBrutoPorcentaje.toFixed(1)}%</dd></div></dl>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          {costoUnidadBaseCOP <= 0 && !item.costoPresentacionCOP
            ? "Registra el costo de compra de esta presentación para calcular la utilidad estimada."
            : !item.activo
              ? "La presentación está inactiva; no se calcula utilidad estimada."
              : "Verifica el factor y el precio vigentes de esta presentación para calcular la utilidad estimada."}
        </p>
      )}
      <div className="mt-2 grid gap-2">
        {item.catalogoId === "BODEGA" && <><label className="grid gap-1 text-xs font-medium">Costo de compra por presentación (COP)
          <input aria-label={`Costo de compra por presentación ${item.nombre}`} inputMode="numeric" type="text" value={costoPresentacion} onChange={e => setCostoPresentacion(e.target.value.replace(/\D/g, ""))} onBlur={() => setCostoPresentacion(formatCopInput(parseCopInput(costoPresentacion)))} placeholder="Sin registrar" className="h-9 min-w-0 rounded-lg border border-border bg-background px-2" />
        </label>
        <p className="text-[11px] text-muted-foreground">Valor pagado por este empaque completo (×{item.factorUnidadBase} {unidadBase}); no el costo de una unidad suelta.</p></>}
        <label className="grid gap-1 text-xs font-medium">{item.catalogoId === "BODEGA" ? "Precio de venta a tienda por presentación (COP)" : "Precio retail por presentación (COP)"}
          <input aria-label={`Precio tienda ${item.nombre}`} inputMode="numeric" type="text" value={precioTienda} onChange={e => setPrecioTienda(e.target.value.replace(/\D/g, ""))} onBlur={() => setPrecioTienda(formatCopInput(parseCopInput(precioTienda)))} className="h-9 min-w-0 rounded-lg border border-border bg-background px-2" />
        </label>
        <p className="text-[11px] text-muted-foreground">{item.catalogoId === "BODEGA" ? "El precio consumidor final se administra en el catálogo Nevera; el dato legado se conserva sin editar." : "El costo y las existencias se registran directamente desde Inventario, sin modificar Bodega."}</p>
        <button disabled={precioTiendaEditado <= 0} onClick={() => onSave(precioTiendaEditado, item.catalogoId === "BODEGA" ? (costoEditado || item.costoPresentacionCOP) : null, item.activo)} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{item.catalogoId === "BODEGA" ? "Guardar costo y precio" : "Guardar precio retail"}</button>
      </div>
    </div>
  )
}

export function BodegaClientesAdmin() {
  const { clientes, cargando } = useBodegaAdminData()
  const [form, setForm] = useState({ nombre: "", cedula: "", telefono: "", tipoDocumento: "NIT" })
  const [error, setError] = useState("")
  const [busqueda, setBusqueda] = useState("")
  const [guardando, setGuardando] = useState(false)
  const guardiaCreacion = useRef(false)
  const visibles = clientes.filter(cliente => `${cliente.nombre} ${cliente.cedula} ${cliente.telefono}`.toLocaleLowerCase("es").includes(busqueda.toLocaleLowerCase("es")))
  if (cargando) return <AdminLoading />
  return <AdminSection eyebrow="Relaciones comerciales" title="Clientes" description="La información de tus clientes, organizada y siempre a mano.">
    {error && <ErrorBox>{error}</ErrorBox>}
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <BodegaSearch label="Buscar clientes" placeholder="Buscar nombre, documento o teléfono…" value={busqueda} onChange={setBusqueda} />
      <BodegaEditorDialog primary title="Nuevo cliente" description="Registra sus datos básicos. Podrás completar la información de contacto después." icon={Users} disabled={guardando}>
        <form onSubmit={async event => {
          event.preventDefault()
          if (guardiaCreacion.current) return
          guardiaCreacion.current = true; setGuardando(true); setError("")
          try { await crearCliente(form); setForm({ ...form, nombre: "", cedula: "", telefono: "" }); toast.success("Cliente creado") }
          catch (cause) { setError(mensajeErrorBodega(cause)) }
          finally { guardiaCreacion.current = false; setGuardando(false) }
        }} className="admin-editor-form">
          <div className="grid gap-4 @md:grid-cols-2"><Input label="Nombre del cliente" value={form.nombre} onChange={nombre => setForm({ ...form, nombre })} required /><Input label="Documento" value={form.cedula} onChange={cedula => setForm({ ...form, cedula })} required /><Input label="Teléfono" value={form.telefono} onChange={telefono => setForm({ ...form, telefono })} required /></div>
          {error && <ErrorBox>{error}</ErrorBox>}
          <Submit disabled={guardando}>{guardando ? "Guardando…" : "Crear cliente"}</Submit>
        </form>
      </BodegaEditorDialog>
    </div>
    <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><Users className="size-4" />{clientes.length} {clientes.length === 1 ? "cliente en tu directorio" : "clientes en tu directorio"}</div>
    {clientes.length === 0 ? <BodegaEmptyState icon={Users} title="Cada cliente cuenta" description="Agrega tu primer cliente para empezar a organizar sus pedidos y ventas." /> : visibles.length === 0 ? <BodegaEmptyState icon={Users} title="Sin coincidencias" description="Busca con otro nombre, documento o teléfono." /> : <div className="grid gap-3 @4xl:grid-cols-2">{visibles.map(cliente => <ClienteAdminRow key={cliente.id} cliente={cliente} onError={setError} />)}</div>}
  </AdminSection>
}

function ClienteAdminRow({ cliente, onError }: { cliente: Cliente; onError(message: string): void }) {
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({ nombre: cliente.nombre, cedula: cliente.cedula, telefono: cliente.telefono, tipoDocumento: cliente.tipoDocumento ?? "NIT", contacto: cliente.contacto ?? "", direccion: cliente.direccion ?? "", barrioZona: cliente.barrioZona ?? "" })
  const guardar = async () => { try { await actualizarCliente(cliente.id, form); setEditando(false) } catch (error) { onError(mensajeErrorBodega(error)) } }
  if (editando) return <article className="@container rounded-2xl border border-primary/20 bg-card p-5 shadow-xs"><div className="grid gap-4 @md:grid-cols-2 @2xl:grid-cols-3"><Input label="Nombre" value={form.nombre} onChange={nombre => setForm({ ...form, nombre })} required /><Input label="Documento" value={form.cedula} onChange={cedula => setForm({ ...form, cedula })} required /><Input label="Teléfono" value={form.telefono} onChange={telefono => setForm({ ...form, telefono })} required /><Input label="Contacto" value={form.contacto} onChange={contacto => setForm({ ...form, contacto })} /><Input label="Dirección" value={form.direccion} onChange={direccion => setForm({ ...form, direccion })} /><Input label="Barrio o zona" value={form.barrioZona} onChange={barrioZona => setForm({ ...form, barrioZona })} /></div><div className="mt-3 flex gap-3"><button onClick={() => void guardar()} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Guardar cambios</button><button onClick={() => setEditando(false)} className="text-xs text-muted-foreground">Cancelar</button></div></article>
  return <article className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border/70 bg-card p-5 shadow-xs @xl:flex-row @xl:items-center">
    <div className="flex min-w-0 flex-1 items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/5 text-sm font-semibold text-primary">{cliente.nombre.slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className="break-words font-semibold tracking-tight">{cliente.nombre}</p><p className="mt-1 break-words text-xs text-muted-foreground">{cliente.cedula} · {cliente.telefono}</p><span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${cliente.activo ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>{cliente.activo ? "Activo" : "Inactivo"}</span></div></div>
    <div className="flex shrink-0 gap-2"><button type="button" onClick={() => setEditando(true)} className="admin-action">Editar</button>{cliente.activo && <button type="button" onClick={() => void eliminarCliente(cliente.id).catch(error => onError(mensajeErrorBodega(error)))} className="min-h-11 rounded-xl px-3 text-xs font-medium text-destructive hover:bg-destructive/5">Desactivar</button>}</div>
  </article>
}

export function BodegaInventarioAdmin() {
  const [busqueda, setBusqueda] = useState("")
  const [catalogo, setCatalogo] = useState<CatalogoId>("BODEGA")
  const { productos, cargando } = useBodegaAdminData(catalogo)
  const [ediciones, setEdiciones] = useState<Record<string, number>>({})
  const [costos, setCostos] = useState<Record<string, number>>({})
  const [motivosAjuste, setMotivosAjuste] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState<Record<string, boolean>>({})
  const [error, setError] = useState("")
  if (cargando) return <AdminLoading />
  const visibles = productos.filter(p => p.nombre.toLocaleLowerCase("es").includes(busqueda.toLocaleLowerCase("es")))
  return <AdminSection eyebrow="Inventario" title={catalogo === "BODEGA" ? "Existencias en unidad base" : "Existencias de Nevera"} description={catalogo === "BODEGA" ? "Las ventas y los ajustes respetan las unidades reservadas por pedidos agendados." : "Registra el inventario propio de Nevera. La carga no descuenta existencias de Bodega."}>
    {error && <ErrorBox>{error}</ErrorBox>}
    {catalogo === "NEVERA" && <NeveraAperturaAdmin />}
    <div className="mb-6 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">Catálogo de inventario
        <select aria-label="Catálogo de inventario" value={catalogo} onChange={event => { setCatalogo(event.target.value as CatalogoId); setEdiciones({}); setCostos({}) }} className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-normal text-foreground">
          <option value="BODEGA">Bodega</option><option value="NEVERA">Nevera</option>
        </select>
      </label>
      <BodegaSearch label="Buscar inventario" placeholder="Buscar un producto..." value={busqueda} onChange={setBusqueda} />
    </div>
    <p className="mb-4 text-sm text-muted-foreground">{productos.length} productos en este catálogo.</p>
    {productos.length === 0 && <BodegaEmptyState icon={Boxes} title="Tu inventario está por comenzar" description="Primero prepara el catálogo. Luego registra aquí las existencias reales de cada producto." />}
    <div className="grid gap-4 @4xl:grid-cols-2">{visibles.map(p => {
      const stockObjetivo = ediciones[p.id] ?? p.stock
      const costoObjetivo = costos[p.id] ?? p.costoUnidadBaseCOP
      const guardandoProducto = guardando[p.id] === true
      const motivoRequerido = catalogo === "NEVERA" && stockObjetivo < p.stock
      const motivo = motivosAjuste[p.id] ?? ""
      const costoInvalido = catalogo === "NEVERA" && stockObjetivo > 0 && (!Number.isSafeInteger(costoObjetivo) || costoObjetivo <= 0)
      const costoSinEntrada = catalogo === "NEVERA" && costoObjetivo !== p.costoUnidadBaseCOP && stockObjetivo <= p.stock
      const productoInactivo = catalogo === "NEVERA" && !p.activo
      return <article key={p.id} className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{p.nombre}</p><p className="text-xs text-muted-foreground">Unidad base: {p.unidad} · mínimo {p.stockMinimo} · reservado {p.stockReservado} · disponible {Math.max(0, p.stock - p.stockReservado)}</p></div><strong className="text-xl">{p.stock}</strong></div>
        {catalogo === "NEVERA" && <label className="mt-3 grid gap-1 text-xs font-medium">Costo de compra por unidad base (COP)
          <input aria-label={`Costo de compra ${p.nombre}`} type="number" inputMode="numeric" min={0} step={1} value={costoObjetivo} onChange={event => setCostos({ ...costos, [p.id]: Number(event.target.value) })} className="h-10 min-w-0 rounded-xl border border-border bg-background px-3" />
        </label>}
        <div className="mt-3 flex gap-2"><input aria-label={`Nuevo stock ${p.nombre}`} type="number" min={p.stockReservado} step={1} value={stockObjetivo} onChange={event => setEdiciones({ ...ediciones, [p.id]: Number(event.target.value) })} className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3" /><button disabled={guardandoProducto || costoInvalido || costoSinEntrada || productoInactivo || (motivoRequerido && motivo.trim().length < 3)} onClick={() => {
          setError(""); setGuardando({ ...guardando, [p.id]: true })
          void ajustarStockProductoBodega(p.id, stockObjetivo, catalogo, catalogo === "NEVERA" ? costoObjetivo : undefined, motivoRequerido ? motivo : undefined)
            .catch(err => setError(mensajeErrorBodega(err)))
            .finally(() => setGuardando(current => ({ ...current, [p.id]: false })))
        }} className="rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{guardandoProducto ? "Guardando…" : catalogo === "NEVERA" ? "Guardar stock y costo" : "Ajustar"}</button></div>
        {motivoRequerido && <label className="mt-3 grid gap-1 text-xs font-medium">Motivo de salida requerido
          <input aria-label={`Motivo de ajuste de salida ${p.nombre}`} value={motivo} onChange={event => setMotivosAjuste(current => ({ ...current, [p.id]: event.target.value }))} placeholder="Merma, corrección de conteo…" maxLength={240} className="h-10 rounded-xl border border-border bg-background px-3 text-sm" />
        </label>}
        {costoSinEntrada && <p className="mt-2 text-xs text-destructive">Para cambiar el costo, aumenta el stock en esta misma entrada.</p>}
        {productoInactivo && <p className="mt-2 text-xs text-muted-foreground">Activa el producto antes de ajustar su inventario.</p>}
        {catalogo === "NEVERA" && <p className="mt-2 text-[11px] text-muted-foreground">La cantidad se registra directamente en Nevera con movimiento de inventario. No es una compra ni modifica Bodega.</p>}
      </article>
    })}</div>
  </AdminSection>
}

export function BodegaVentasAdmin() {
  const { ventas, cargando } = useBodegaAdminData(); const ordenadas = useMemo(() => [...ventas].reverse(), [ventas])
  const [errorImpresion, setErrorImpresion] = useState("")
  const reimprimir = async (recibo: ReciboInternoVentaBodega, estado: string) => {
    const result = await imprimirReciboInternoVentaBodega(recibo, estado)
    setErrorImpresion(result.success ? "" : "No se pudo abrir la impresión del recibo. Permite ventanas emergentes e inténtalo de nuevo.")
  }
  if (cargando) return <AdminLoading />
  return <AdminSection eyebrow="Ventas" title="Consulta operativa" description="Vista administrativa tenant-aware. El efectivo sin turno se revisa por venta y fecha; no forma parte del arqueo de turnos.">{errorImpresion && <ErrorBox>{errorImpresion}</ErrorBox>}<div className="space-y-3">{ordenadas.map(v => <article key={v.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"><div><p className="font-semibold">{v.clienteNombreSnapshot || "Cliente"}</p><p className="text-xs text-muted-foreground">{v.reciboInterno?.folioInterno ?? v.id} · {v.metodoPago} · vendedor {v.cajeroId}</p><p className="mt-1 text-xs text-muted-foreground">{formatearFechaBodega(v.fecha)}{v.metodoPago === "efectivo" && v.turnoId === null ? " · efectivo sin turno" : v.turnoId ? ` · turno ${v.turnoId}` : ""}</p>{v.estado === "pendiente" && <p className="mt-1 text-xs font-semibold text-amber-800 dark:text-amber-200">Saldo por cobrar {money(v.saldoPendienteCOP ?? 0)}</p>}{v.metodoPago === "efectivo" && v.montoRecibidoCOP !== null && <p className="mt-1 text-xs text-muted-foreground">Recibido {money(v.montoRecibidoCOP)} · cambio {money(v.cambioCOP ?? 0)}</p>}</div><div className="flex items-center gap-3"><div className="shrink-0 text-right"><p className="font-bold">{money(v.total)}</p><p className="text-xs text-emerald-600">{v.estado}</p></div>{v.reciboInterno && <button type="button" onClick={() => void reimprimir(v.reciboInterno!, v.estado)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold"><Printer className="h-4 w-4" />Reimprimir</button>}</div></article>)}{ventas.length === 0 && <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">No hay ventas Bodega registradas.</p>}</div></AdminSection>
}

export function BodegaSolicitudesAdmin() {
  const { empresaId } = useConfiguracionEmpresa()
  const suscripcionSenal = useRef<ReturnType<typeof suscribirSenalBodega> | null>(null)
  const [solicitudes, setSolicitudes] = useState<SolicitudVentaBodegaDTO[]>([])
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState("")
  const [error, setError] = useState("")
  const [senalDesconectada, setSenalDesconectada] = useState(false)
  const cargar = useCallback(async () => {
    setError("")
    try { setSolicitudes(await consultarSolicitudesVentaBodega()) }
    catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setCargando(false) }
  }, [])
  const cargarCoalescido = useMemo(() => crearRefrescoCoalescido(cargar), [cargar])
  const actualizar = useCallback(() => {
    suscripcionSenal.current?.reconectar()
    return cargarCoalescido()
  }, [cargarCoalescido])
  useEffect(() => { void cargarCoalescido() }, [cargarCoalescido])
  useEffect(() => {
    if (!empresaId) return
    const detectarCambio = crearDetectorCambioSenalBodega()
    const suscripcion = suscribirSenalBodega(empresaId, "solicitudes_admin", undefined, state => {
      setSenalDesconectada(!state.conectada)
      if (detectarCambio(state)) void cargarCoalescido()
    })
    suscripcionSenal.current = suscripcion
    const actualizarSiVisible = () => { if (document.visibilityState === "visible") void actualizar() }
    document.addEventListener("visibilitychange", actualizarSiVisible)
    const limpiarRecuperacionEnLinea = registrarRecuperacionEnLineaBodega(window, () => suscripcion.reconectar(), () => { void actualizar() })
    return () => {
      if (suscripcionSenal.current === suscripcion) suscripcionSenal.current = null
      suscripcion.cerrar()
      document.removeEventListener("visibilitychange", actualizarSiVisible)
      limpiarRecuperacionEnLinea()
    }
  }, [empresaId, cargarCoalescido, actualizar])

  const resolver = async (solicitud: SolicitudVentaBodegaDTO, decision: "aprobar" | "rechazar") => {
    if (procesando) return
    setProcesando(solicitud.solicitudId); setError("")
    try {
      await resolverSolicitudVentaBodega({ solicitudId: solicitud.solicitudId, revision: solicitud.revision, decision })
      await actualizar()
    } catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setProcesando("") }
  }

  if (cargando) return <AdminLoading />
  return <AdminSection eyebrow="Aprobación previa" title="Solicitudes de venta" description="Revisa el cliente, las presentaciones y el total canónico antes de autorizar al vendedor. La aprobación dura 24 horas y no reserva inventario.">
    {error && <ErrorBox>{error}</ErrorBox>}
    {senalDesconectada && <p role="status" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">La sincronización está desconectada; la bandeja puede estar desactualizada. Usa Actualizar o vuelve a conectar para validar el estado vigente.</p>}
    <button onClick={() => void actualizar()} className="mb-4 rounded-xl border border-border px-4 py-2 text-sm font-semibold">Actualizar</button>
    <div className="space-y-3">{solicitudes.map(solicitud => <article key={solicitud.solicitudId} className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{solicitud.cliente?.nombre || "Cliente no disponible"}</h2><p className="mt-1 text-xs text-muted-foreground">Solicitud · {formatearReferenciaSolicitud(solicitud.solicitudId)} · vendedor</p></div><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs font-semibold">{solicitud.estado}</span></div>
      <div className="my-3 space-y-2">{solicitud.lineas.map((linea, index) => <div key={`${linea.presentacionId}-${index}`} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-words">{linea.cantidad} × {linea.presentacionNombre} ({linea.factorUnidadBase} {linea.unidadBase})</span><span className="shrink-0">{money(linea.subtotalCOP)}</span></div>)}</div>
      <div className="flex items-center justify-between border-t border-border pt-3"><span className="text-sm text-muted-foreground">Total validado por servidor</span><strong>{money(solicitud.totalCOP)}</strong></div>
      {solicitud.estado === "APROBADA" && solicitud.aprobacion && <p className="mt-2 text-xs text-muted-foreground">Aprobada por administración; vence {formatearFechaBodega(solicitud.aprobacion.expiraEn)}.</p>}
      {solicitud.estado === "PENDIENTE_APROBACION" && <div className="mt-4 flex gap-2"><button disabled={!!procesando} onClick={() => void resolver(solicitud, "aprobar")} className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{procesando === solicitud.solicitudId ? "Procesando…" : "Aprobar"}</button><button disabled={!!procesando} onClick={() => void resolver(solicitud, "rechazar")} className="rounded-xl border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50">Rechazar</button></div>}
    </article>)}{solicitudes.length === 0 && <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">No hay solicitudes pendientes de revisar.</p>}</div>
  </AdminSection>
}

export function BodegaVentaDirectaAdmin() {
  const [modoVenta, setModoVenta] = useState<CatalogoId>("BODEGA")
  const { productos, presentaciones, clientes, cargando } = useBodegaAdminData(modoVenta)
  const { usuario } = useAuthContext()
  const [turno, setTurno] = useState<Turno | null>(null)
  const [clienteId, setClienteId] = useState("")
  const [presentacionId, setPresentacionId] = useState("")
  const [carrito, setCarrito] = useState<LineaCarritoBodega[]>([])
  const [metodoPago, setMetodoPago] = useState<MetodoPagoBodega>("transferencia")
  const [montoRecibidoCOP, setMontoRecibidoCOP] = useState<number | undefined>()
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState("")
  const [venta, setVenta] = useState<ResultadoVentaBodega | null>(null)
  const comandoPendiente = useRef<ConfirmacionVentaBodega | null>(null)
  const [tieneComandoPendiente, setTieneComandoPendiente] = useState(false)
  useEffect(() => usuario?.uid ? suscribirTurnoActivo(usuario.uid, setTurno) : undefined, [usuario?.uid])
  const presentacionesActivas = useMemo(() => presentaciones.filter(item => item.activo && productos.some(producto => producto.id === item.productoId && producto.activo)), [presentaciones, productos])
  const presentacionesAgrupadas = useMemo(() => {
    const grupos = new Map<string, { productoId: string; nombreProducto: string; presentaciones: PresentacionBodegaAdmin[] }>()
    for (const presentacion of presentacionesActivas) {
      const producto = productos.find(item => item.id === presentacion.productoId)
      if (!producto) continue
      const grupo = grupos.get(producto.id) ?? { productoId: producto.id, nombreProducto: producto.nombre, presentaciones: [] }
      grupo.presentaciones.push(presentacion)
      grupos.set(producto.id, grupo)
    }
    return [...grupos.values()]
      .map(grupo => ({ ...grupo, presentaciones: [...grupo.presentaciones].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) }))
      .sort((a, b) => a.nombreProducto.localeCompare(b.nombreProducto, "es"))
  }, [presentacionesActivas, productos])
  const lineasDetalle = carrito.map(linea => {
    const presentacion = presentacionesActivas.find(item => item.id === linea.presentacionId)
    const producto = productos.find(item => item.id === linea.productoId)
    return presentacion && producto ? { ...linea, nombreProducto: producto.nombre, presentacion: presentacion.nombre, precioCOP: presentacion.precioCOP } : null
  }).filter((linea): linea is NonNullable<typeof linea> => linea !== null)
  const estimado = lineasDetalle.reduce((total, linea) => total + linea.precioCOP * linea.cantidad, 0)
  const cambioEstimado = calcularCambioEfectivoBodega(estimado, montoRecibidoCOP ?? Number.NaN)

  const agregar = () => {
    const presentation = presentacionesActivas.find(item => item.id === presentacionId)
    if (!presentation) return
    setCarrito(current => {
      const found = current.find(line => line.presentacionId === presentation.id)
      return found ? current.map(line => line.presentacionId === presentation.id ? { ...line, cantidad: line.cantidad + 1 } : line)
        : [...current, { productoId: presentation.productoId, presentacionId: presentation.id, cantidad: 1 }]
    })
  }

  const registrar = async () => {
    if (guardando) return
    const comandoEnCurso = comandoPendiente.current
    if (!comandoEnCurso && (!clienteId || carrito.length === 0)) { setError("Selecciona un cliente y agrega al menos una presentación."); return }
    if (!comandoEnCurso && metodoPago === "efectivo" && cambioEstimado === null) { setError("Ingresa el efectivo recibido como un valor entero igual o mayor al total."); return }
    setGuardando(true); setError("")
    try {
      const command = comandoPendiente.current ?? construirConfirmacionVentaBodega({ clienteId, lineas: carrito, metodoPago, ...(metodoPago === "efectivo" ? { montoRecibidoCOP } : {}) })
      comandoPendiente.current = command; setTieneComandoPendiente(true)
      const result = await confirmarVentaBodega(command)
      setVenta(result); setCarrito([]); setMontoRecibidoCOP(undefined); comandoPendiente.current = null; setTieneComandoPendiente(false)
    } catch (cause) { setError(mensajeErrorBodega(cause)) }
    finally { setGuardando(false) }
  }

  if (cargando) return <AdminLoading />
  const selectorCatalogo = <div role="group" aria-label="Catálogo para vender" className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-muted/50 p-1"><button type="button" aria-pressed={modoVenta === "BODEGA"} onClick={() => setModoVenta("BODEGA")} className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${modoVenta === "BODEGA" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Bodega · clientes</button><button type="button" aria-pressed={modoVenta === "NEVERA"} onClick={() => setModoVenta("NEVERA")} className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${modoVenta === "NEVERA" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>Nevera · retail</button></div>
  if (modoVenta === "NEVERA") return <AdminSection eyebrow="Venta administrativa directa" title="Venta de Nevera" description="Venta retail al consumidor final, separada de las ventas y la cartera de clientes Bodega.">{selectorCatalogo}<NeveraRetailView /></AdminSection>
  return <AdminSection eyebrow="Venta administrativa directa" title="Registrar venta" description="La administradora puede vender directamente por el comando canónico. No crea ni aprueba una solicitud propia.">
    {selectorCatalogo}
    {error && <ErrorBox>{error}</ErrorBox>}
    {tieneComandoPendiente && <p role="status" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800">El resultado del intento anterior no se pudo confirmar. Reintenta la misma venta; sus datos quedan bloqueados para evitar duplicados o cambios accidentales.</p>}
    {venta && "ventaId" in venta && <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700"><p className="min-w-0 flex-1">Venta registrada: recibo {venta.reciboInterno.folioInterno} · {money(venta.total)}.{venta.montoRecibidoCOP !== undefined && <> Recibido {money(venta.montoRecibidoCOP)}; cambio {money(venta.cambioCOP ?? 0)}.{venta.turnoId ? ` Turno ${venta.turnoId}.` : " Efectivo sin turno; revisar por venta y fecha."}</>}</p><button type="button" onClick={() => void imprimirReciboInternoVentaBodega(venta.reciboInterno, venta.estado).then(result => { if (!result.success) setError("No se pudo abrir la impresión del recibo. Permite ventanas emergentes e inténtalo de nuevo.") })} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-700/30 bg-background px-3 text-sm font-semibold text-foreground"><Printer className="h-4 w-4" />Imprimir recibo</button></div>}
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <label className="block text-sm">Cliente<select aria-label="Cliente de venta" disabled={tieneComandoPendiente} value={clienteId} onChange={event => setClienteId(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">Seleccionar cliente</option>{clientes.filter(cliente => cliente.activo).map(cliente => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}</select></label>
      <div className="flex gap-2"><select aria-label="Presentación de venta" disabled={tieneComandoPendiente} value={presentacionId} onChange={event => setPresentacionId(event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3"><option value="">Seleccionar producto y presentación</option>{presentacionesAgrupadas.map(grupo => <optgroup key={grupo.productoId} label={grupo.nombreProducto}>{grupo.presentaciones.map(item => <option key={item.id} value={item.id}>{item.nombre} · ×{item.factorUnidadBase} · {money(item.precioCOP)}</option>)}</optgroup>)}</select><button onClick={agregar} disabled={tieneComandoPendiente || !presentacionId} className="rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">Agregar</button></div>
      <div className="space-y-2">{lineasDetalle.map(linea => <div key={linea.presentacionId} className="flex items-center justify-between rounded-xl bg-muted/40 p-3"><div><p className="text-sm font-semibold">{linea.nombreProducto}</p><p className="text-xs text-muted-foreground">{linea.cantidad} × {linea.presentacion}</p></div><div className="flex items-center gap-3"><strong>{money(linea.precioCOP * linea.cantidad)}</strong><button aria-label={`Quitar ${linea.presentacion}`} disabled={tieneComandoPendiente} onClick={() => setCarrito(current => current.filter(item => item.presentacionId !== linea.presentacionId))} className="text-sm text-destructive disabled:opacity-50">Quitar</button></div></div>)}</div>
      <div className="flex justify-between border-t border-border pt-3"><span className="text-sm text-muted-foreground">Total estimado; servidor vuelve a resolver precio</span><strong>{money(estimado)}</strong></div>
      <div className="grid grid-cols-2 gap-2">{(["efectivo", "transferencia"] as const).map(method => <button key={method} disabled={tieneComandoPendiente} onClick={() => setMetodoPago(method)} className={`rounded-xl border px-3 py-3 text-sm font-semibold capitalize ${metodoPago === method ? "border-primary bg-primary/10" : "border-border"}`}>{method}</button>)}</div>
      {metodoPago === "efectivo" && <div className="rounded-xl border border-border p-3"><label className="text-sm">Efectivo recibido<input aria-label="Efectivo recibido" type="number" min={estimado} step={1} disabled={tieneComandoPendiente} value={montoRecibidoCOP ?? ""} onChange={event => setMontoRecibidoCOP(event.target.value === "" ? undefined : Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3" /></label>{cambioEstimado !== null ? <p className="mt-2 text-xs text-muted-foreground">Cambio estimado: {money(cambioEstimado)}</p> : <p className="mt-2 text-xs text-muted-foreground">Debe ser un entero igual o mayor a {money(estimado)}.</p>}<p className="mt-2 text-xs text-muted-foreground">{turno ? "Se vinculará a tu turno abierto." : "Sin turno también puedes vender; administración revisará por venta y fecha."}</p></div>}
      <button disabled={guardando || carrito.length === 0 || !clienteId || (metodoPago === "efectivo" && cambioEstimado === null)} onClick={() => void registrar()} className="h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50">{guardando ? "Registrando…" : tieneComandoPendiente ? "Reintentar la misma venta" : "Confirmar venta directa"}</button>
    </div>
  </AdminSection>
}

function AdminSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) { return <section className="min-w-0"><div className="mb-7 max-w-3xl"><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-primary">{eyebrow}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1><p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p></div>{children}</section> }
function AdminLoading() { return <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Cargando Bodega…</div> }
function ErrorBox({ children }: { children: React.ReactNode }) { return <p role="alert" className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{children}</p> }
function Input({ label, value, onChange, required }: { label: string; value: string; onChange(value: string): void; required?: boolean }) { return <label className="block min-w-0 text-sm font-medium">{label}<input required={required} value={value} onChange={e => onChange(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3" /></label> }
function NumberInput({ label, value, onChange, min = 0 }: { label: string; value: number; onChange(value: number): void; min?: number }) { return <label className="block min-w-0 text-sm font-medium">{label}<input required type="number" min={min} value={value} onChange={e => onChange(Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3" /></label> }
function Submit({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) { return <button type="submit" disabled={disabled} className="mt-4 min-h-11 self-end rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50">{children}</button> }
