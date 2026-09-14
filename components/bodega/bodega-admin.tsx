"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { Boxes, CircleDollarSign, PackagePlus, RefreshCw, Settings, Tags, Users } from "lucide-react"
import { useConfiguracionEmpresa } from "@/contexts/configuracion-empresa-context"
import { useAuthContext } from "@/contexts/auth-context"
import { actualizarCliente, crearCliente, eliminarCliente, type Cliente } from "@/lib/clientes-service"
import { ajustarStockProductoBodega, crearPresentacionBodega, crearProductoBodega, listarCategoriasBodega, listarEspaciosBodega, suscribirClientesBodegaAdmin, suscribirPresentacionesBodegaAdmin, suscribirProductosBodegaAdmin, suscribirVentasBodegaAdmin, actualizarPresentacionBodega, type PresentacionBodegaAdmin, type ProductoBodegaAdmin, type VentaBodegaAdmin } from "@/lib/bodega/admin-service"
import { mensajeErrorBodega } from "@/lib/bodega/ui-contract"

const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value)
const cards = [
  { href: "/admin/catalogo", label: "Productos y precios", detail: "Catálogo base y presentaciones", icon: Tags },
  { href: "/admin/clientes", label: "Clientes", detail: "Directorio comercial", icon: Users },
  { href: "/admin/inventario", label: "Inventario", detail: "Stock en unidad base", icon: Boxes },
  { href: "/admin/ventas", label: "Ventas", detail: "Consulta operativa", icon: CircleDollarSign },
  { href: "/admin/permisos", label: "Configuración operativa", detail: "Usuarios y permisos existentes", icon: Settings },
]

function useBodegaAdminData() {
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
  return <div className="space-y-5"><section className="rounded-3xl border border-amber-300/20 bg-gradient-to-br from-slate-900 to-slate-950 p-6 text-white"><p className="text-xs font-bold uppercase tracking-[.24em] text-amber-300">Bodega MVP-1</p><h1 className="mt-2 text-2xl font-bold">Centro de operación</h1><p className="mt-2 max-w-md text-sm text-slate-400">Administra el catálogo comercial, inventario base, clientes y ventas sin mezclar módulos de restaurante.</p><div className="mt-6 grid grid-cols-2 gap-3"><Kpi label="Ventas registradas" value={String(ventas.length)} /><Kpi label="Total operativo" value={money(total)} /><Kpi label="Productos activos" value={String(productos.filter(p => p.activo).length)} /><Kpi label="Clientes activos" value={String(clientes.filter(c => c.activo).length)} /></div></section><section className="grid gap-3 sm:grid-cols-2">{cards.map(card => <Link key={card.href} href={card.href} className="rounded-2xl border border-border bg-card p-5 transition hover:border-primary/50"><card.icon className="h-5 w-5 text-primary" /><p className="mt-4 font-semibold">{card.label}</p><p className="mt-1 text-sm text-muted-foreground">{card.detail}</p></Link>)}</section><p className="text-xs text-muted-foreground">{presentaciones.filter(p => p.activo).length} presentaciones comerciales activas.</p></div>
}

function Kpi({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></div> }

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
  const { productos, presentaciones, cargando } = useBodegaAdminData()
  const [espacios, setEspacios] = useState<Array<{ id: string; nombre: string }>>([])
  const [categorias, setCategorias] = useState<Array<{ id: string; nombre: string }>>([])
  const [producto, setProducto] = useState({ nombre: "", categoriaId: "", espacioId: "", unidad: "unidad", stock: 0, stockMinimo: 0, costo: 0 })
  const [presentacion, setPresentacion] = useState({ productoId: "", nombre: "", factorUnidadBase: 1, precioCOP: 0 })
  const [error, setError] = useState(""); const [guardando, setGuardando] = useState(false)
  useEffect(() => { void Promise.all([listarEspaciosBodega(), listarCategoriasBodega()]).then(([spaces, categories]) => { setEspacios(spaces); setCategorias(categories); setProducto(actual => ({ ...actual, espacioId: actual.espacioId || spaces[0]?.id || "", categoriaId: actual.categoriaId || categories[0]?.id || "" })) }).catch(e => setError(mensajeErrorBodega(e))) }, [])
  const run = async (action: () => Promise<unknown>) => { if (guardando) return; setGuardando(true); setError(""); try { await action() } catch (e) { setError(mensajeErrorBodega(e)) } finally { setGuardando(false) } }
  if (cargando) return <AdminLoading />
  return <AdminSection eyebrow="Catálogo Bodega" title="Productos, presentaciones y precios" description="El stock se conserva en el producto base; factor y precio se validan nuevamente en el servidor.">{error && <ErrorBox>{error}</ErrorBox>}<div className="grid gap-4 lg:grid-cols-2"><form onSubmit={e => { e.preventDefault(); void run(async () => { await crearProductoBodega(producto); setProducto({ ...producto, nombre: "", stock: 0, stockMinimo: 0, costo: 0 }) }) }} className="rounded-2xl border border-border bg-card p-4"><h2 className="flex items-center gap-2 font-semibold"><PackagePlus className="h-4 w-4 text-primary" />Nuevo producto base</h2><div className="mt-4 grid gap-3"><Input label="Nombre" value={producto.nombre} onChange={nombre => setProducto({ ...producto, nombre })} required /><label className="text-sm">Categoría<select required value={producto.categoriaId} onChange={e => setProducto({ ...producto, categoriaId: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">Seleccionar</option>{categorias.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><Input label="Unidad base" value={producto.unidad} onChange={unidad => setProducto({ ...producto, unidad })} required /><label className="text-sm">Espacio<select required value={producto.espacioId} onChange={e => setProducto({ ...producto, espacioId: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">Seleccionar</option>{espacios.map(item => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label><NumberInput label="Costo por unidad base" value={producto.costo} onChange={costo => setProducto({ ...producto, costo })} /><NumberInput label="Stock inicial" value={producto.stock} onChange={stock => setProducto({ ...producto, stock })} /><NumberInput label="Stock mínimo" value={producto.stockMinimo} onChange={stockMinimo => setProducto({ ...producto, stockMinimo })} /></div><Submit disabled={guardando || espacios.length === 0 || categorias.length === 0}>Crear producto</Submit></form><form onSubmit={e => { e.preventDefault(); void run(async () => { await crearPresentacionBodega(presentacion); setPresentacion({ ...presentacion, nombre: "", factorUnidadBase: 1, precioCOP: 0 }) }) }} className="rounded-2xl border border-border bg-card p-4"><h2 className="flex items-center gap-2 font-semibold"><Tags className="h-4 w-4 text-primary" />Nueva presentación</h2><div className="mt-4 grid gap-3"><label className="text-sm">Producto<select required value={presentacion.productoId} onChange={e => setPresentacion({ ...presentacion, productoId: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3"><option value="">Seleccionar</option>{productos.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label><Input label="Nombre comercial" value={presentacion.nombre} onChange={nombre => setPresentacion({ ...presentacion, nombre })} required /><NumberInput min={1} label="Factor a unidad base" value={presentacion.factorUnidadBase} onChange={factorUnidadBase => setPresentacion({ ...presentacion, factorUnidadBase })} /><NumberInput min={1} label="Precio operativo COP" value={presentacion.precioCOP} onChange={precioCOP => setPresentacion({ ...presentacion, precioCOP })} /></div><Submit disabled={guardando}>Crear presentación</Submit></form></div><div className="mt-5 space-y-3">{productos.map(p => <article key={p.id} className="rounded-2xl border border-border bg-card p-4"><div className="flex justify-between gap-4"><div><p className="font-semibold">{p.nombre}</p><p className="text-xs text-muted-foreground">Stock: {p.stock} {p.unidad}</p></div><span className="text-xs text-muted-foreground">{p.activo ? "Activo" : "Inactivo"}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{presentaciones.filter(x => x.productoId === p.id).map(x => <PresentacionRow key={x.id} item={x} onSave={(precioCOP, activo) => run(() => actualizarPresentacionBodega({ presentacionId: x.id, precioCOP, activo }))} />)}</div></article>)}</div></AdminSection>
}

function PresentacionRow({ item, onSave }: { item: PresentacionBodegaAdmin; onSave(price: number, active: boolean): void }) { const [precio, setPrecio] = useState(item.precioCOP); return <div className="rounded-xl bg-muted/40 p-3"><p className="text-sm font-semibold">{item.nombre}</p><p className="text-xs text-muted-foreground">× {item.factorUnidadBase} unidades base</p><div className="mt-2 flex gap-2"><input aria-label={`Precio ${item.nombre}`} type="number" min={1} value={precio} onChange={e => setPrecio(Number(e.target.value))} className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2" /><button onClick={() => onSave(precio, item.activo)} className="rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground">Guardar</button></div></div> }

export function BodegaClientesAdmin() {
  const { clientes, cargando } = useBodegaAdminData(); const [form, setForm] = useState({ nombre: "", cedula: "", telefono: "", tipoDocumento: "NIT" }); const [error, setError] = useState("")
  if (cargando) return <AdminLoading />
  return <AdminSection eyebrow="Clientes" title="Directorio empresarial" description="Administración conserva edición y desactivación; el vendedor solo crea y consulta activos.">{error && <ErrorBox>{error}</ErrorBox>}<form onSubmit={async e => { e.preventDefault(); try { await crearCliente(form); setForm({ ...form, nombre: "", cedula: "", telefono: "" }) } catch (err) { setError(mensajeErrorBodega(err)) } }} className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4"><Input label="Nombre" value={form.nombre} onChange={nombre => setForm({ ...form, nombre })} required /><Input label="Documento" value={form.cedula} onChange={cedula => setForm({ ...form, cedula })} required /><Input label="Teléfono" value={form.telefono} onChange={telefono => setForm({ ...form, telefono })} required /><Submit>Crear cliente</Submit></form><div className="mt-4 space-y-2">{clientes.map(c => <ClienteAdminRow key={c.id} cliente={c} onError={setError} />)}</div></AdminSection>
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
  if (cargando) return <AdminLoading />
  return <AdminSection eyebrow="Inventario" title="Existencias en unidad base" description="Los ajustes usan el comando canónico de inventario y generan su movimiento server-side.">{error && <ErrorBox>{error}</ErrorBox>}<div className="space-y-3">{productos.map(p => <article key={p.id} className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center justify-between"><div><p className="font-semibold">{p.nombre}</p><p className="text-xs text-muted-foreground">Unidad base: {p.unidad} · mínimo {p.stockMinimo}</p></div><strong className="text-xl">{p.stock}</strong></div><div className="mt-3 flex gap-2"><input aria-label={`Nuevo stock ${p.nombre}`} type="number" min={0} value={ediciones[p.id] ?? p.stock} onChange={e => setEdiciones({ ...ediciones, [p.id]: Number(e.target.value) })} className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-background px-3" /><button onClick={() => void ajustarStockProductoBodega(p.id, ediciones[p.id] ?? p.stock).catch(err => setError(mensajeErrorBodega(err)))} className="rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Ajustar</button></div></article>)}</div></AdminSection>
}

export function BodegaVentasAdmin() {
  const { ventas, cargando } = useBodegaAdminData(); const ordenadas = useMemo(() => [...ventas].reverse(), [ventas])
  if (cargando) return <AdminLoading />
  return <AdminSection eyebrow="Ventas" title="Consulta operativa" description="Vista administrativa tenant-aware. La anulación Bodega permanece fuera de este corte."><div className="space-y-3">{ordenadas.map(v => <article key={v.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4"><div><p className="font-semibold">{v.clienteNombreSnapshot || "Cliente"}</p><p className="text-xs text-muted-foreground">{v.id} · {v.metodoPago} · vendedor {v.cajeroId}</p></div><div className="text-right"><p className="font-bold">{money(v.total)}</p><p className="text-xs text-emerald-600">{v.estado}</p></div></article>)}{ventas.length === 0 && <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">No hay ventas Bodega registradas.</p>}</div></AdminSection>
}

function AdminSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) { return <section><p className="text-xs font-bold uppercase tracking-[.22em] text-primary">{eyebrow}</p><h1 className="mt-1 text-2xl font-bold">{title}</h1><p className="mt-1 mb-5 text-sm text-muted-foreground">{description}</p>{children}</section> }
function AdminLoading() { return <div className="flex min-h-[50vh] items-center justify-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" />Cargando Bodega…</div> }
function ErrorBox({ children }: { children: React.ReactNode }) { return <p role="alert" className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{children}</p> }
function Input({ label, value, onChange, required }: { label: string; value: string; onChange(value: string): void; required?: boolean }) { return <label className="text-sm">{label}<input required={required} value={value} onChange={e => onChange(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3" /></label> }
function NumberInput({ label, value, onChange, min = 0 }: { label: string; value: number; onChange(value: number): void; min?: number }) { return <label className="text-sm">{label}<input required type="number" min={min} value={value} onChange={e => onChange(Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3" /></label> }
function Submit({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) { return <button disabled={disabled} className="mt-auto h-11 self-end rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{children}</button> }
