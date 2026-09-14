import { collection, getDocs, onSnapshot, where, type Unsubscribe } from "firebase/firestore"
import { db, getFirebaseFunctions } from "@/lib/firebase"
import { tenantQuery } from "@/lib/tenant"
import { crearEnvelopeInventario, ejecutarComandoInventario } from "@/lib/inventario-command"
import type { Cliente } from "@/lib/clientes-service"

export interface ProductoBodegaAdmin {
  id: string
  nombre: string
  categoriaId: string
  espacioId: string
  unidad: string
  stock: number
  stockMinimo: number
  activo: boolean
}

export interface PresentacionBodegaAdmin {
  id: string
  productoId: string
  nombre: string
  factorUnidadBase: number
  precioCOP: number
  activo: boolean
}

export interface VentaBodegaAdmin {
  id: string
  cajeroId: string
  clienteNombreSnapshot: string
  metodoPago: string
  estado: string
  total: number
  fecha: unknown
  schemaVersion: string
}

function suscribirTenant<T>(coleccion: string, map: (id: string, data: Record<string, any>) => T, callback: (items: T[]) => void): Unsubscribe {
  let unsubscribe = () => {}
  let cancelado = false
  tenantQuery(collection(db, coleccion)).then(query => {
    if (cancelado) return
    unsubscribe = onSnapshot(query, snapshot => callback(snapshot.docs.map(doc => map(doc.id, doc.data()))))
  })
  return () => { cancelado = true; unsubscribe() }
}

export const suscribirProductosBodegaAdmin = (callback: (items: ProductoBodegaAdmin[]) => void) => suscribirTenant("productos", (id, data) => ({ id, nombre: String(data.nombre ?? ""), categoriaId: String(data.categoriaId ?? ""), espacioId: String(data.espacioId ?? ""), unidad: String(data.unidadMedida ?? data.unidad ?? "und"), stock: Number(data.stock ?? 0), stockMinimo: Number(data.stockMinimo ?? 0), activo: data.activo === true }), items => callback(items.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))))
export const suscribirPresentacionesBodegaAdmin = (callback: (items: PresentacionBodegaAdmin[]) => void) => suscribirTenant("presentaciones_producto", (id, data) => ({ id, productoId: String(data.productoId ?? ""), nombre: String(data.nombre ?? ""), factorUnidadBase: Number(data.factorUnidadBase ?? 0), precioCOP: Number(data.precioCOP ?? 0), activo: data.activo === true }), callback)
export const suscribirClientesBodegaAdmin = (callback: (items: Cliente[]) => void) => suscribirTenant("clientes", (id, data) => ({ id, ...data } as Cliente), items => callback(items.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))))
export const suscribirVentasBodegaAdmin = (callback: (items: VentaBodegaAdmin[]) => void) => suscribirTenant("ventas", (id, data) => ({ id, cajeroId: String(data.cajeroId ?? ""), clienteNombreSnapshot: String(data.clienteNombreSnapshot ?? data.clienteNombre ?? ""), metodoPago: String(data.metodoPago ?? ""), estado: String(data.estado ?? ""), total: Number(data.totales?.total ?? 0), fecha: data.fecha ?? null, schemaVersion: String(data.schemaVersion ?? "") }), items => callback(items.filter(item => item.schemaVersion === "BODEGA_MVP1_V1")))

export async function listarEspaciosBodega(): Promise<Array<{ id: string; nombre: string }>> {
  const query = await tenantQuery(collection(db, "espacios"), where("activo", "==", true))
  const snapshot = await getDocs(query)
  return snapshot.docs.map(doc => ({ id: doc.id, nombre: String(doc.data().nombre ?? doc.id) }))
}

export async function listarCategoriasBodega(): Promise<Array<{ id: string; nombre: string }>> {
  const query = await tenantQuery(collection(db, "categorias"))
  const snapshot = await getDocs(query)
  return snapshot.docs.map(doc => ({ id: doc.id, nombre: String(doc.data().nombre ?? doc.id) }))
}

export async function crearProductoBodega(data: { nombre: string; categoriaId: string; espacioId: string; unidad: string; stock: number; stockMinimo: number; costo: number }): Promise<string> {
  const result = await ejecutarComandoInventario<{ articuloId: string }>("crearArticuloInventarioV1", crearEnvelopeInventario({ articuloTipo: "producto", data: { ...data, activo: true } }))
  return result.articuloId
}

export async function ajustarStockProductoBodega(productoId: string, stock: number): Promise<void> {
  await ejecutarComandoInventario("actualizarArticuloInventarioV1", crearEnvelopeInventario({ articuloTipo: "producto", articuloId: productoId, data: { stock } }, "ajuste_administrativo_bodega"))
}

async function ejecutarPresentacion(nombre: string, payload: Record<string, unknown>) {
  const commandId = `presentacion:${crypto.randomUUID()}`
  const callable = (await import("firebase/functions")).httpsCallable(getFirebaseFunctions(), nombre)
  await callable({ commandId, idempotencyKey: commandId, correlationId: `presentacion:${crypto.randomUUID()}`, payload })
}

export async function crearPresentacionBodega(payload: { productoId: string; nombre: string; factorUnidadBase: number; precioCOP: number }) {
  await ejecutarPresentacion("crearPresentacionComercialV1", { ...payload, activo: true })
}

export async function actualizarPresentacionBodega(payload: { presentacionId: string; nombre?: string; factorUnidadBase?: number; precioCOP?: number; activo?: boolean }) {
  await ejecutarPresentacion("actualizarPresentacionComercialV1", payload)
}
