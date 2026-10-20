"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Boxes, CalendarDays, CheckCircle2, CircleDollarSign, PackagePlus, RefreshCw, Search, Settings, Tags, Users, XCircle } from "lucide-react"
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
import { filtrarPorTextoBodega } from "@/lib/bodega/ui-filter"
import { BodegaEmptyState, BodegaSearch } from "@/components/bodega/bodega-primitives"

const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)
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

export function useBodegaAdminData() {
  const [productos, setProductos] = useState<ProductoBodegaAdmin[]>([])
  const [presentaciones, setPresentaciones] = useState<PresentacionBodegaAdmin[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [ventas, setVentas] = useState<VentaBodegaAdmin[]>([])
  const [cargando, setCargando] = useState(true)
  const cargados = useRef(new Set<string>())
  useEffect(() => {
    const recibido = (nombre: string) => { cargados.current.add(nombre); if (cargados.current.size === 4) setCargando(false) }
    const unsubs = [suscribirProductosBodegaAdmin(items => { setProductos(items); recibido("productos") }), suscribirPresentacionesBodegaAdmin(items => { setPresentaciones(items); recibido("presentaciones") }), suscribirClientesBodegaAdmin(items => { setClientes(items); recibido("clientes") }), suscribirVentasBodegaAdmin(items => { setVentas(items); recibido("ventas") })]
    return () => unsubs.forEach(unsub => unsub())
  }, [])
  return { productos, presentaciones, clientes, ventas, cargando }
}

export function BodegaAdminDashboard() {
  const { productos, presentaciones, clientes, ventas, cargando } = useBodegaAdminData()
  if (cargando) return <AdminLoading />
  const total = ventas.reduce((sum, venta) => sum + venta.total, 0)
  return <div className="bodega-admin-page space-y-6">
    <section className="bodega-hero">
      <div className="bodega-hero-copy"><p className="bodega-overline">Operación Bodega</p><h1>Todo en su lugar.</h1><p>Catálogo, existencias, clientes y ventas: una vista clara para cada decisión del día.</p></div>
      <div className="bodega-hero-mark" aria-hidden="true"><Boxes className="h-16 w-16" /></div>
    </section>
    <section aria-label="Resumen de la operación" className="bodega-kpi-grid"><Kpi label="Ventas registradas" value={String(ventas.length)} /><Kpi label="Total registrado" value={money(total)} /><Kpi label="Productos activos" value={String(productos.filter(p => p.activo).length)} /><Kpi label="Clientes activos" value={String(clientes.filter(c => c.activo).length)} /></section>
    <section><div className="mb-4"><p className="bodega-overline">Accesos rápidos</p><h2 className="bodega-section-title">Tu centro de trabajo</h2></div><div className="bodega-shortcut-grid">{cards.map(card => <Link key={card.href} href={card.href} className="bodega-shortcut"><span className="bodega-shortcut-icon"><card.icon className="h-5 w-5" /></span><span><strong>{card.label}</strong><small>{card.detail}</small></span><span aria-hidden="true" className="bodega-shortcut-arrow">↗</span></Link>)}</div></section>
    <p className="text-sm text-muted-foreground">{presentaciones.filter(p => p.activo).length} presentaciones comerciales activas.</p>
  </div>
}

function Kpi({ label, value }: { label: string; value: string }) { return <div className="bodega-kpi"><p>{label}</p><strong>{value}</strong></div> }

export function BodegaAdminRoute({ children }: { children: React.ReactNode }) {
  const { vertical, estado } = useConfiguracionEmpresa()
  const { usuario } = useAuthContext()
  if (estado === "CARGANDO") return <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">Cargando configuración…</div>
  if (estado !== "LISTA" || vertical === null) return <div className="rounded-2xl border border-border p-8 text-center text-muted-foreground">No fue posible verificar la configuración operativa.</div>
  if (vertical !== "BODEGA_MVP1") return <div className="rounded-2xl border border-border p-8 text-center text-muted-foreground">Esta pantalla solo está disponible para el vertical Bodega.</div>
  if (usuario?.rol !== "admin") return <div className="rounded-2xl border border-border p-8 text-center text-muted-foreground">Acceso reservado al administrador de Bodega.</div>
  return <div className="bodega-admin-page">{children}</div>
}

export function BodegaCatalogoAdmin() {
  const { productos, presentaciones, cargando } = useBodegaAdminData()
  const [espacios, setEspacios] = useState<Array<{ id: string; nombre: string }>>([])
  const [categorias, setCategorias] = useState<Array<{ id: string; nombre: string }>>([])
  const [categoria, setCategoria] = useState({ espacioId: "", nombre: "", icono: "" })
  const [producto, setProducto] = useState({ nombre: "", categoriaId: "", espacioId: "", unidad: "unidad", stock: 0, stockMinimo: 0, costo: 0 })
  const [presentacion, setPresentacion] = useState({ productoId: "", nombre: "", factorUnidadBase: 1, precioCOP: 0 })
  const [error, setError] = useState(""); const [guardando, setGuardando] = useState(false)
  const [busqueda, setBusqueda] = useState("")
  const productosVisibles = filtrarPorTextoBodega(productos, busqueda, item => [item.nombre, item.unidad])
  useEffect(() => { void Promise.all([listarEspaciosBodega(), listarCategoriasBodega()]).then(([spaces, categories]) => { setEspacios(spaces); setCategorias(categories); setCategoria(actual => ({ ...actual, espacioId: actual.espacioId || spaces[0]?.id || "" })); setProducto(actual => ({ ...actual, espacioId: actual.espacioId || spaces[0]?.id || "", categoriaId: actual.categoriaId || categories[0]?.id || "" })) }).catch(e => setError(mensajeErrorBodega(e))) }, [])
  const run = async (action: () => Promise<unknown>) => { if (guardando) return; setGuardando(true); setError(""); try { await action() } catch (e) { setError(mensajeErrorBodega(e)) } finally { setGuardando(false) } }
  if (cargando) return <AdminLoading />
  return <AdminSection eyebrow="Catálogo Bodega" title="Catálogo y precios" description="Organiza productos base y presentaciones comerciales. El stock y las reservas se consultan por separado.">
    {error && <ErrorBox>{error}</ErrorBox>}
    <div className="bodega-panel"><div className="bodega-panel-heading"><div><p className="bodega-overline">Productos</p><h2>{productosVisibles.length} en catálogo</h2></div><span className="bodega-panel-note">{presentaciones.filter(item => item.activo).length} presentaciones activas</span></div>
      <BodegaSearch value={busqueda} onChange={setBusqueda} placeholder="Buscar producto o unidad base" />
      <div className="bodega-catalog-list">{productosVisibles.map(p => <article key={p.id} className="bodega-product-card"><div className="bodega-product-heading"><div><h3>{p.nombre}</h3><p>Físico {p.stock} {p.unidad} · reservado {p.stockReservado} · disponible {Math.max(0, p.stock - p.stockReservado)}</p></div><span className={p.activo ? "bodega-status bodega-status-ok" : "bodega-status bodega-status-muted"}>{p.activo ? "Activo" : "Inactivo"}</span></div><div className="bodega-presentations">{presentaciones.filter(x => x.productoId === p.id).map(x => <PresentacionRow key={x.id} item={x} onSave={(precioCOP, activo) => run(() => actualizarPresentacionBodega({ presentacionId: x.id, precioCOP, activo }))} />)}{presentaciones.every(x => x.productoId !== p.id) && <p className="bodega-panel-note">Todavía no tiene presentaciones comerciales.</p>}</div></article>)}{productosVisibles.length === 0 && <BodegaEmptyState title={productos.length ? "Sin coincidencias" : "El catálogo está vacío"} detail={productos.length ? "Prueba otra búsqueda." : "Crea una categoría y después tu primer producto."} />}</div>
    </div>
    <div className="bodega-create-heading"><p className="bodega-overline">Configuración del catálogo</p><h2 className="bodega-section-title">Agregar al catálogo</h2><p>Primero crea la categoría, luego el producto base y finalmente su presentación con precio de venta.</p></div>
    <div className="bodega-create-grid">
      <form onSubmit={e => { e.preventDefault(); void run(async () => { const result = await crearCategoriaBodega({ espacioId: categoria.espacioId, nombre: categoria.nombre, ...(categoria.icono.trim() ? { icono: categoria.icono } : {}) }); const actualizadas = await listarCategoriasBodega(); setCategorias(actualizadas); setProducto(actual => ({ ...actual, categoriaId: actual.categoriaId || result.categoriaId })); setCategoria(actual => ({ ...actual, nombre: "", icono: "" })) }) }} className="bodega-panel bodega-create-card"><div className="bodega-step">01</div><h2><Tags className="h-5 w-5" /> Categoría</h2><div className="grid gap-3"><Input label="Nombre" value={categoria.nombre} onChange={nombre => setCategoria({ ...categoria, nombre })} required /><Input label="Icono (opcional)" value={categoria.icono} onChange={icono => setCategoria({ ...categoria, icono })} /><label>Espacio<select required value={categoria.espacioId} onChange={e => setCategoria({ ...categoria, espacioId: e.target.value })}><option value="">Seleccionar</option>{espacios.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label></div><Submit disabled={guardando || espacios.length === 0}>Crear categoría</Submit></form>
      <form onSubmit={e => { e.preventDefault(); void run(async () => { await crearProductoBodega(producto); setProducto({ ...producto, nombre: "", stock: 0, stockMinimo: 0, costo: 0 }) }) }} className="bodega-panel bodega-create-card"><div className="bodega-step">02</div><h2><PackagePlus className="h-5 w-5" /> Producto base</h2><div className="grid gap-3"><Input label="Nombre" value={producto.nombre} onChange={nombre => setProducto({ ...producto, nombre })} required /><label>Categoría<select required value={producto.categoriaId} onChange={e => setProducto({ ...producto, categoriaId: e.target.value })}><option value="">Seleccionar</option>{categorias.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><Input label="Unidad base" value={producto.unidad} onChange={unidad => setProducto({ ...producto, unidad })} required /><label>Espacio<select required value={producto.espacioId} onChange={e => setProducto({ ...producto, espacioId: e.target.value })}><option value="">Seleccionar</option>{espacios.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><NumberInput label="Costo por unidad base" value={producto.costo} onChange={costo => setProducto({ ...producto, costo })} /><NumberInput label="Stock inicial" value={producto.stock} onChange={stock => setProducto({ ...producto, stock })} /><NumberInput label="Stock mínimo" value={producto.stockMinimo} onChange={stockMinimo => setProducto({ ...producto, stockMinimo })} /></div><Submit disabled={guardando || espacios.length === 0 || categorias.length === 0}>Crear producto</Submit></form>
      <form onSubmit={e => { e.preventDefault(); void run(async () => { await crearPresentacionBodega(presentacion); setPresentacion({ ...presentacion, nombre: "", factorUnidadBase: 1, precioCOP: 0 }) }) }} className="bodega-panel bodega-create-card"><div className="bodega-step">03</div><h2><Tags className="h-5 w-5" /> Presentación</h2><div className="grid gap-3"><label>Producto<select required value={presentacion.productoId} onChange={e => setPresentacion({ ...presentacion, productoId: e.target.value })}><option value="">Seleccionar</option>{productos.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label><Input label="Nombre comercial" value={presentacion.nombre} onChange={nombre => setPresentacion({ ...presentacion, nombre })} required /><NumberInput min={1} label="Factor a unidad base" value={presentacion.factorUnidadBase} onChange={factorUnidadBase => setPresentacion({ ...presentacion, factorUnidadBase })} /><NumberInput min={1} label="Precio de venta COP" value={presentacion.precioCOP} onChange={precioCOP => setPresentacion({ ...presentacion, precioCOP })} /></div><Submit disabled={guardando}>Crear presentación</Submit></form>
    </div>
  </AdminSection>
}

function PresentacionRow({ item, onSave }: { item: PresentacionBodegaAdmin; onSave(price: number, active: boolean): void }) {
  const [precio, setPrecio] = useState(item.precioCOP)
  useEffect(() => setPrecio(item.precioCOP), [item.precioCOP])
  return <div className="bodega-presentation-row"><div><strong>{item.nombre}</strong><p>× {item.factorUnidadBase} unidades base · {item.activo ? "Activa" : "Inactiva"}</p></div><div className="bodega-price-edit"><label>Precio de venta<input aria-label={`Precio de venta de ${item.nombre}`} type="number" min={1} step={1} value={precio} onChange={e => setPrecio(Number(e.target.value))} /></label><button type="button" disabled={!Number.isInteger(precio) || precio < 1 || precio === item.precioCOP} onClick={() => onSave(precio, item.activo)}>Guardar</button></div></div>
}

export function BodegaClientesAdmin() {
  const { clientes, cargando } = useBodegaAdminData(); const [form, setForm] = useState({ nombre: "", cedula: "", telefono: "", tipoDocumento: "NIT" }); const [error, setError] = useState("")
  const [busqueda, setBusqueda] = useState("")
  const [creando, setCreando] = useState(false)
  const visibles = filtrarPorTextoBodega(clientes, busqueda, cliente => [cliente.nombre, cliente.cedula, cliente.telefono])
  if (cargando) return <AdminLoading />
  return <AdminSection eyebrow="Relaciones comerciales" title="Clientes" description="Encuentra y actualiza los clientes de tu bodega. El vendedor puede crear clientes y consultar los activos.">
    {error && <ErrorBox>{error}</ErrorBox>}
    <div className="bodega-workspace-grid">
      <div className="bodega-panel bodega-panel-main">
        <div className="bodega-panel-heading"><div><p className="bodega-overline">Directorio</p><h2>{visibles.length} clientes</h2></div></div>
        <BodegaSearch value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre, documento o teléfono" />
        <div className="bodega-list mt-4">{visibles.map(c => <ClienteAdminRow key={c.id} cliente={c} onError={setError} />)}{visibles.length === 0 && <BodegaEmptyState title={clientes.length ? "Sin coincidencias" : "Aún no hay clientes"} detail={clientes.length ? "Prueba con otro nombre o documento." : "Crea el primero desde el formulario."} />}</div>
      </div>
      <form onSubmit={async e => { e.preventDefault(); if (creando) return; setCreando(true); setError(""); try { await crearCliente(form); setForm({ ...form, nombre: "", cedula: "", telefono: "" }) } catch (err) { setError(mensajeErrorBodega(err)) } finally { setCreando(false) } }} className="bodega-panel bodega-panel-form">
        <div className="bodega-panel-heading"><div><p className="bodega-overline">Nuevo registro</p><h2>Crear cliente</h2></div></div>
        <div className="grid gap-3"><Input label="Nombre" value={form.nombre} onChange={nombre => setForm({ ...form, nombre })} required /><Input label="Documento" value={form.cedula} onChange={cedula => setForm({ ...form, cedula })} required /><Input label="Teléfono" value={form.telefono} onChange={telefono => setForm({ ...form, telefono })} required /></div>
        <Submit disabled={creando}>{creando ? "Guardando…" : "Crear cliente"}</Submit>
      </form>
    </div>
  </AdminSection>
}

function ClienteAdminRow({ cliente, onError }: { cliente: Cliente; onError(message: string): void }) {
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({ nombre: cliente.nombre, cedula: cliente.cedula, telefono: cliente.telefono, tipoDocumento: cliente.tipoDocumento ?? "NIT", contacto: cliente.contacto ?? "", direccion: cliente.direccion ?? "", barrioZona: cliente.barrioZona ?? "" })
  const guardar = async () => { try { await actualizarCliente(cliente.id, form); setEditando(false) } catch (error) { onError(mensajeErrorBodega(error)) } }
  if (editando) return <article className="rounded-xl border border-border bg-card p-4"><div className="grid gap-3 sm:grid-cols-3"><Input label={`Nombre ${cliente.id}`} value={form.nombre} onChange={nombre => setForm({ ...form, nombre })} required /><Input label={`Documento ${cliente.id}`} value={form.cedula} onChange={cedula => setForm({ ...form, cedula })} required /><Input label={`Teléfono ${cliente.id}`} value={form.telefono} onChange={telefono => setForm({ ...form, telefono })} required /><Input label={`Contacto ${cliente.id}`} value={form.contacto} onChange={contacto => setForm({ ...form, contacto })} /><Input label={`Dirección ${cliente.id}`} value={form.direccion} onChange={direccion => setForm({ ...form, direccion })} /><Input label={`Barrio o zona ${cliente.id}`} value={form.barrioZona} onChange={barrioZona => setForm({ ...form, barrioZona })} /></div><div className="mt-3 flex gap-3"><button onClick={() => void guardar()} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Guardar cambios</button><button onClick={() => setEditando(false)} className="text-xs text-muted-foreground">Cancelar</button></div></article>
  return <article className="flex items-center justify-between rounded-xl border border-border bg-card p-4"><div><p className="font-semibold">{cliente.nombre}</p><p className="text-xs text-muted-foreground">{cliente.cedula} · {cliente.telefono}</p></div><div className="flex gap-3"><button onClick={() => setEditando(true)} className="text-xs font-semibold text-primary">Editar</button>{cliente.activo && <button onClick={() => void eliminarCliente(cliente.id).catch(error => onError(mensajeErrorBodega(error)))} className="text-xs font-semibold text-destructive">Desactivar</button>}</div></article>
}

export function BodegaInventarioAdmin() {
  const { productos, cargando } = useBodegaAdminData(); const [ediciones, setEdiciones] = useState<Record<string, number>>({}); const [error, setError] = useState("")
  const [busqueda, setBusqueda] = useState("")
  const [soloBajoMinimo, setSoloBajoMinimo] = useState(false)
  const visibles = filtrarPorTextoBodega(productos.filter(p => !soloBajoMinimo || Math.max(0, p.stock - p.stockReservado) <= p.stockMinimo), busqueda, p => [p.nombre, p.unidad])
  const bajoMinimo = productos.filter(p => Math.max(0, p.stock - p.stockReservado) <= p.stockMinimo).length
  if (cargando) return <AdminLoading />
  return <AdminSection eyebrow="Inventario" title="Stock bajo control" description="Consulta existencias en unidad base. Las reservas de pedidos se muestran aparte y se respetan al ajustar.">
    {error && <ErrorBox>{error}</ErrorBox>}
    <div className="bodega-panel"><div className="bodega-panel-heading"><div><p className="bodega-overline">Existencias</p><h2>{productos.length} productos · {bajoMinimo} en mínimo</h2></div></div>
      <div className="bodega-toolbar"><BodegaSearch value={busqueda} onChange={setBusqueda} placeholder="Buscar producto en stock" /><button type="button" aria-pressed={soloBajoMinimo} onClick={() => setSoloBajoMinimo(!soloBajoMinimo)} className="bodega-filter-button">{soloBajoMinimo ? "Mostrar todos" : `Ver en mínimo (${bajoMinimo})`}</button></div>
      <div className="bodega-inventory-grid">{visibles.map(p => {
        const disponible = Math.max(0, p.stock - p.stockReservado)
        return <article key={p.id} className="bodega-inventory-card"><div className="bodega-inventory-title"><div><h3>{p.nombre}</h3><p>Unidad base: {p.unidad}</p></div><span className={disponible <= p.stockMinimo ? "bodega-status bodega-status-warning" : "bodega-status bodega-status-ok"}>{disponible <= p.stockMinimo ? "En mínimo" : "Disponible"}</span></div>
          <dl className="bodega-stock-metrics"><div><dt>Físico</dt><dd>{p.stock}</dd></div><div><dt>Reservado</dt><dd>{p.stockReservado}</dd></div><div><dt>Disponible</dt><dd>{disponible}</dd></div></dl>
          <div className="bodega-stock-adjust"><label>Nuevo stock <input aria-label={`Nuevo stock ${p.nombre}`} type="number" min={p.stockReservado} value={ediciones[p.id] ?? p.stock} onChange={e => setEdiciones({ ...ediciones, [p.id]: Number(e.target.value) })} /></label><button disabled={(ediciones[p.id] ?? p.stock) === p.stock} onClick={() => void ajustarStockProductoBodega(p.id, ediciones[p.id] ?? p.stock).catch(err => setError(mensajeErrorBodega(err)))}>Guardar ajuste</button></div>
        </article>
      })}{visibles.length === 0 && <BodegaEmptyState title={productos.length ? "Sin coincidencias" : "Aún no hay productos"} detail={productos.length ? "Cambia la búsqueda o muestra todos los productos." : "El stock aparecerá cuando se cree el catálogo."} />}</div>
    </div>
  </AdminSection>
}

export function BodegaVentasAdmin() {
  const { ventas, cargando } = useBodegaAdminData(); const ordenadas = useMemo(() => [...ventas].reverse(), [ventas])
  const [busqueda, setBusqueda] = useState("")
  const visibles = filtrarPorTextoBodega(ordenadas, busqueda, venta => [venta.clienteNombreSnapshot ?? "", venta.id, venta.metodoPago])
  if (cargando) return <AdminLoading />
  return <AdminSection eyebrow="Ventas" title="Ventas registradas" description="Consulta cada operación por cliente o referencia. El efectivo sin turno se revisa por venta y fecha, no en el arqueo.">
    <div className="bodega-panel"><div className="bodega-panel-heading"><div><p className="bodega-overline">Historial operativo</p><h2>{visibles.length} ventas</h2></div><Link className="bodega-panel-link" href="/admin/vender">Registrar venta ↗</Link></div>
      <BodegaSearch value={busqueda} onChange={setBusqueda} placeholder="Buscar por cliente o referencia" />
      <div className="bodega-list mt-4">{visibles.map(v => <article key={v.id} className="bodega-sale-row"><div><p className="bodega-sale-name">{v.clienteNombreSnapshot || "Cliente"}</p><p className="bodega-sale-meta">{formatearFechaBodega(v.fecha)} · {v.metodoPago} · vendedor {v.cajeroId}</p><p className="bodega-sale-meta">Ref. {v.id}{v.metodoPago === "efectivo" && v.turnoId === null ? " · efectivo sin turno" : v.turnoId ? ` · turno ${v.turnoId}` : ""}</p>{v.metodoPago === "efectivo" && v.montoRecibidoCOP !== null && <p className="bodega-sale-meta">Recibido {money(v.montoRecibidoCOP)} · cambio {money(v.cambioCOP ?? 0)}</p>}</div><div className="bodega-sale-total"><strong>{money(v.total)}</strong><span className="bodega-status bodega-status-ok">{v.estado}</span></div></article>)}{visibles.length === 0 && <BodegaEmptyState title={ventas.length ? "Sin coincidencias" : "Aún no hay ventas"} detail={ventas.length ? "Prueba con otro cliente o referencia." : "Las ventas aparecerán aquí cuando se confirmen."} />}</div>
    </div>
  </AdminSection>
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
  const { productos, presentaciones, clientes, cargando } = useBodegaAdminData()
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
  return <AdminSection eyebrow="Venta administrativa directa" title="Registrar venta" description="La administradora puede vender directamente por el comando canónico. No crea ni aprueba una solicitud propia.">
    {error && <ErrorBox>{error}</ErrorBox>}
    {tieneComandoPendiente && <p role="status" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800">El resultado del intento anterior no se pudo confirmar. Reintenta la misma venta; sus datos quedan bloqueados para evitar duplicados o cambios accidentales.</p>}
    {venta && "ventaId" in venta && <p role="status" className="mb-4 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-700">Venta registrada: {venta.ventaId} · {money(venta.total)}.{venta.montoRecibidoCOP !== undefined && <> Recibido {money(venta.montoRecibidoCOP)}; cambio {money(venta.cambioCOP ?? 0)}.{venta.turnoId ? ` Turno ${venta.turnoId}.` : " Efectivo sin turno; revisar por venta y fecha."}</>}</p>}
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <label className="block text-sm">Cliente<select aria-label="Cliente de venta" disabled={tieneComandoPendiente} value={clienteId} onChange={event => setClienteId(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">Seleccionar cliente</option>{clientes.filter(cliente => cliente.activo).map(cliente => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}</select></label>
      <div className="flex gap-2"><select aria-label="Presentación de venta" disabled={tieneComandoPendiente} value={presentacionId} onChange={event => setPresentacionId(event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3"><option value="">Seleccionar presentación</option>{presentacionesActivas.map(item => <option key={item.id} value={item.id}>{item.nombre} · {money(item.precioCOP)}</option>)}</select><button onClick={agregar} disabled={tieneComandoPendiente || !presentacionId} className="rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">Agregar</button></div>
      <div className="space-y-2">{lineasDetalle.map(linea => <div key={linea.presentacionId} className="flex items-center justify-between rounded-xl bg-muted/40 p-3"><div><p className="text-sm font-semibold">{linea.nombreProducto}</p><p className="text-xs text-muted-foreground">{linea.cantidad} × {linea.presentacion}</p></div><div className="flex items-center gap-3"><strong>{money(linea.precioCOP * linea.cantidad)}</strong><button aria-label={`Quitar ${linea.presentacion}`} disabled={tieneComandoPendiente} onClick={() => setCarrito(current => current.filter(item => item.presentacionId !== linea.presentacionId))} className="text-sm text-destructive disabled:opacity-50">Quitar</button></div></div>)}</div>
      <div className="flex justify-between border-t border-border pt-3"><span className="text-sm text-muted-foreground">Total estimado; servidor vuelve a resolver precio</span><strong>{money(estimado)}</strong></div>
      <div className="grid grid-cols-2 gap-2">{(["efectivo", "transferencia"] as const).map(method => <button key={method} disabled={tieneComandoPendiente} onClick={() => setMetodoPago(method)} className={`rounded-xl border px-3 py-3 text-sm font-semibold capitalize ${metodoPago === method ? "border-primary bg-primary/10" : "border-border"}`}>{method}</button>)}</div>
      {metodoPago === "efectivo" && <div className="rounded-xl border border-border p-3"><label className="text-sm">Efectivo recibido<input aria-label="Efectivo recibido" type="number" min={estimado} step={1} disabled={tieneComandoPendiente} value={montoRecibidoCOP ?? ""} onChange={event => setMontoRecibidoCOP(event.target.value === "" ? undefined : Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3" /></label>{cambioEstimado !== null ? <p className="mt-2 text-xs text-muted-foreground">Cambio estimado: {money(cambioEstimado)}</p> : <p className="mt-2 text-xs text-muted-foreground">Debe ser un entero igual o mayor a {money(estimado)}.</p>}<p className="mt-2 text-xs text-muted-foreground">{turno ? "Se vinculará a tu turno abierto." : "Sin turno también puedes vender; administración revisará por venta y fecha."}</p></div>}
      <button disabled={guardando || carrito.length === 0 || !clienteId || (metodoPago === "efectivo" && cambioEstimado === null)} onClick={() => void registrar()} className="h-12 w-full rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50">{guardando ? "Registrando…" : tieneComandoPendiente ? "Reintentar la misma venta" : "Confirmar venta directa"}</button>
    </div>
  </AdminSection>
}

function AdminSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) { return <section className="bodega-section" data-bodega-section={eyebrow}><header className="bodega-page-heading"><p className="bodega-overline">{eyebrow}</p><h1>{title}</h1><p>{description}</p></header>{children}</section> }
function AdminLoading() { return <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Cargando Bodega…</div> }
function ErrorBox({ children }: { children: React.ReactNode }) { return <p role="alert" className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{children}</p> }
function Input({ label, value, onChange, required }: { label: string; value: string; onChange(value: string): void; required?: boolean }) { return <label className="text-sm">{label}<input required={required} value={value} onChange={e => onChange(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3" /></label> }
function NumberInput({ label, value, onChange, min = 0 }: { label: string; value: number; onChange(value: number): void; min?: number }) { return <label className="text-sm">{label}<input required type="number" min={min} value={value} onChange={e => onChange(Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3" /></label> }
function Submit({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) { return <button disabled={disabled} className="mt-auto h-11 self-end rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{children}</button> }
