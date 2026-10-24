import { collection, getDocs, onSnapshot, where, type Unsubscribe } from "firebase/firestore"
import { db, getFirebaseFunctions } from "@/lib/firebase"
import { tenantQuery } from "@/lib/tenant"
import { crearEnvelopeInventario, ejecutarComandoInventario } from "@/lib/inventario-command"
import { resolverCallableOperacionBodega } from "./operation-routing"
import { proyectarVentaBodegaAdmin, type VentaBodegaAdminDTO } from "@/lib/bodega/ui-contract"
import type { Cliente } from "@/lib/clientes-service"
import { proyectarProductoBodegaAdmin, type ProductoBodegaAdmin } from "@/lib/bodega/product-admin-projection"

export type { ProductoBodegaAdmin } from "@/lib/bodega/product-admin-projection"

export interface PresentacionBodegaAdmin {
  id: string
  productoId: string
  nombre: string
  factorUnidadBase: number
  precioCOP: number
  activo: boolean
}

export type VentaBodegaAdmin = VentaBodegaAdminDTO

function suscribirTenant<T>(
  coleccion: string,
  map: (id: string, data: Record<string, any>) => T,
  callback: (items: T[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let unsubscribe = () => {}
  let cancelado = false
  tenantQuery(collection(db, coleccion)).then(query => {
    if (cancelado) return
    unsubscribe = onSnapshot(
      query,
      snapshot => callback(snapshot.docs.map(doc => map(doc.id, doc.data()))),
      error => onError?.(error),
    )
  }).catch(error => {
    if (onError) onError(error instanceof Error ? error : new Error("No se pudo preparar la consulta del tenant."))
    else throw error
  })
  return () => { cancelado = true; unsubscribe() }
}

export const suscribirProductosBodegaAdmin = (callback: (items: ProductoBodegaAdmin[]) => void) => suscribirTenant("productos", proyectarProductoBodegaAdmin, items => callback(items.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))))
export const suscribirPresentacionesBodegaAdmin = (
  callback: (items: PresentacionBodegaAdmin[]) => void,
  onError?: (error: Error) => void,
) => suscribirTenant(
  "presentaciones_producto",
  (id, data) => ({ id, productoId: String(data.productoId ?? ""), nombre: String(data.nombre ?? ""), factorUnidadBase: Number(data.factorUnidadBase ?? 0), precioCOP: Number(data.precioCOP ?? 0), activo: data.activo === true }),
  callback,
  onError,
)
export const suscribirClientesBodegaAdmin = (callback: (items: Cliente[]) => void) => suscribirTenant("clientes", (id, data) => ({ id, ...data } as Cliente), items => callback(items.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))))
export const suscribirVentasBodegaAdmin = (callback: (items: VentaBodegaAdmin[]) => void) => suscribirTenant("ventas", (id, data) => proyectarVentaBodegaAdmin(id, data), items => callback(items.filter(item => item.schemaVersion === "BODEGA_MVP1_V1")))

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
  const result = await ejecutarComandoInventario<{ articuloId: string }>(resolverCallableOperacionBodega("BODEGA_MVP1", "crearArticuloInventarioV1"), crearEnvelopeInventario({ articuloTipo: "producto", data: { ...data, activo: true } }))
  return result.articuloId
}

export async function ajustarStockProductoBodega(productoId: string, stock: number): Promise<void> {
  await ejecutarComandoInventario(resolverCallableOperacionBodega("BODEGA_MVP1", "actualizarArticuloInventarioV1"), crearEnvelopeInventario({ articuloTipo: "producto", articuloId: productoId, data: { stock } }, "ajuste_administrativo_bodega"))
}

async function ejecutarComandoBodega<T>(nombre: string, prefijo: string, payload: Record<string, unknown>): Promise<T> {
  const commandId = `${prefijo}:${crypto.randomUUID()}`
  const callable = (await import("firebase/functions")).httpsCallable(getFirebaseFunctions(), resolverCallableOperacionBodega("BODEGA_MVP1", nombre))
  const result = await callable({ commandId, idempotencyKey: commandId, correlationId: `${prefijo}:${crypto.randomUUID()}`, payload })
  return result.data as T
}

export async function crearPresentacionBodega(payload: { productoId: string; nombre: string; factorUnidadBase: number; precioCOP: number }) {
  await ejecutarComandoBodega("crearPresentacionComercialV1", "presentacion", { ...payload, activo: true })
}

export async function actualizarPresentacionBodega(payload: { presentacionId: string; nombre?: string; factorUnidadBase?: number; precioCOP?: number; activo?: boolean }) {
  await ejecutarComandoBodega("actualizarPresentacionComercialV1", "presentacion", payload)
}

export async function crearCategoriaBodega(payload: { espacioId: string; nombre: string; icono?: string }): Promise<{ categoriaId: string; idempotente: boolean }> {
  return ejecutarComandoBodega("crearCategoriaBodegaV1", "categoria", payload)
}
