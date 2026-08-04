import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import type { ImpuestoTipo } from '@/lib/impuestos-service'
import type { ModificadorGrupoSnapshot } from '@/lib/configured-line'
import { proyectarModificadoresCocina } from '@/lib/modifier-snapshot-projection'
import { tenantQuery } from '@/lib/tenant'
import { db, getFirebaseFunctions } from './firebase'

export interface PedidoItem {
  id: string
  uid?: string
  name: string
  code: string
  price: number
  cost: number
  category: string
  emoji: string
  stock: number
  impuestoTipo?: ImpuestoTipo
  iva?: number
  impoconsumo?: number
  hasRecipe: boolean
  quantity: number
  schemaVersion?: 1
  configurationKey?: string
  precioBaseUnitario?: number
  modificadores?: PedidoItemModificador[]
  cantidadEnviada?: number
  enviadoCocina?: boolean
}

export type PedidoItemModificador = ModificadorGrupoSnapshot

export type TipoMovimiento =
  | 'separacion_origen'
  | 'separacion_destino'
  | 'union_origen'
  | 'union_destino'
  | 'traslado'

export interface MovimientoCuenta {
  tipo: TipoMovimiento
  pedidoRelacionadoId?: string
  mesaOrigenId?: string
  mesaDestinoId?: string
  nombreMesaOrigen?: string
  nombreMesaDestino?: string
  items: Array<{ uid: string; name: string; quantity: number }>
  fecha: any
  cajeroId: string
}

export interface PedidoActivo {
  id: string
  mesaId: string | null
  nombreMesa: string
  espacioId: string
  cajeroId: string
  items: PedidoItem[]
  estado: 'abierto' | 'pagado' | 'cancelado' | 'unificado'
  activo: boolean
  comandaIds?: string[]
  movimientos?: MovimientoCuenta[]
  inicioAlquiler?: number | null
  fechaPago?: any
  ventaId?: string
  unionDestinoId?: string
  actualizadoEn: any
}

export interface ComandaItem {
  uid: string
  name: string
  quantity: number
  notas?: string
  modificadores?: PedidoItemModificador[]
}

export function obtenerModificadoresComandaCocina(item: ComandaItem): string[] {
  return proyectarModificadoresCocina(item.modificadores)
}

export interface ComandaCocina {
  id: string
  pedidoId: string
  mesaId: string | null
  nombreMesa: string
  espacioId: string
  cajeroId: string
  items: ComandaItem[]
  estado: 'pendiente' | 'en_preparacion' | 'listo' | 'entregado'
  tipo: 'nuevo' | 'adicion' | 'cancelacion'
  creadoEn: any
  completadoEn?: any
}

const COLLECTION_NAME = 'pedidos_activos'
const COMANDAS_COLLECTION = 'comandas_cocina'

export function suscribirPedidosActivos(espacioId: string, callback: (pedidos: PedidoActivo[]) => void) {
  let unsubscribe = () => {}
  let cancelado = false
  tenantQuery(collection(db, COLLECTION_NAME), where('espacioId', '==', espacioId), where('activo', '==', true)).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as PedidoActivo)))
    })
  })
  return () => { cancelado = true; unsubscribe() }
}

type SalonEnvelope = {
  commandId: string
  idempotencyKey: string
  correlationId: string
  causationId: null
  motivo: null
  payload: Record<string, unknown>
}

function salonEnvelope(nombre: string, payload: Record<string, unknown>): SalonEnvelope {
  const commandId = `salon:${nombre}:${crypto.randomUUID()}`
  return { commandId, idempotencyKey: commandId, correlationId: `corr-${commandId}`, causationId: null, motivo: null, payload }
}

async function invocarSalon<TResult>(nombre: string, payload: Record<string, unknown>): Promise<TResult> {
  const callable = httpsCallable<SalonEnvelope, TResult>(getFirebaseFunctions(), nombre)
  return (await callable(salonEnvelope(nombre, payload))).data
}

/** Las mutaciones pasan por Functions; el cliente conserva únicamente lecturas y la intención. */
export async function guardarPedido(pedido: Omit<PedidoActivo, 'actualizadoEn' | 'id' | 'activo' | 'comandaIds'> & { id?: string }) {
  return invocarSalon<{ pedidoId: string }>('crearCuentaSalonV1', {
    mesaId: pedido.mesaId,
    nombreMesa: pedido.nombreMesa,
    espacioId: pedido.espacioId,
    items: pedido.items,
    ...(pedido.inicioAlquiler !== undefined ? { inicioAlquiler: pedido.inicioAlquiler } : {}),
  })
}

export async function agregarItemPedido(pedidoId: string, newItem: PedidoItem) {
  await invocarSalon('agregarLineaCuentaSalonV1', { pedidoId, item: newItem })
}

export async function enviarPedidoACocina(pedidoId: string) {
  await invocarSalon('enviarCuentaCocinaV1', { pedidoId })
}

export async function modificarItemPedido(pedidoId: string, itemUid: string, newQuantity: number) {
  await invocarSalon('modificarLineaCuentaSalonV1', { pedidoId, itemUid, newQuantity })
}

export async function finalizarAlquiler(pedidoId: string, itemAlquiler: PedidoItem) {
  await invocarSalon('finalizarAlquilerSalonV1', { pedidoId, item: itemAlquiler })
}

/** El cierre pagado pertenece a aplicarEfectosVentaOperativaV1, no a este servicio. */
export async function archivarPedidoConComandas(_pedidoId: string, _ventaId: string): Promise<never> {
  throw new Error('El cierre pagado debe ejecutarse mediante la autoridad de venta.')
}

/** La eliminación física de pedidos no forma parte del contrato operativo. */
export async function eliminarPedido(_pedidoId: string): Promise<never> {
  throw new Error('Los pedidos operativos no se eliminan desde el cliente.')
}

export function suscribirComandasCocina(espacioId: string, callback: (comandas: ComandaCocina[]) => void) {
  let unsubscribe = () => {}
  let cancelado = false
  tenantQuery(collection(db, COMANDAS_COLLECTION), where('espacioId', '==', espacioId), where('estado', 'in', ['pendiente', 'en_preparacion'])).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snapshot) => {
      const comandas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ComandaCocina))
      comandas.sort((a, b) => (a.creadoEn?.toDate?.().getTime?.() || 0) - (b.creadoEn?.toDate?.().getTime?.() || 0))
      callback(comandas)
    })
  })
  return () => { cancelado = true; unsubscribe() }
}

export async function actualizarEstadoComanda(comandaId: string, nuevoEstado: ComandaCocina['estado']) {
  await invocarSalon('actualizarEstadoComandaSalonV1', { comandaId, nuevoEstado })
}

export function suscribirComandasActivas(espacioId: string, callback: (comandas: ComandaCocina[]) => void) {
  let unsubscribe = () => {}
  let cancelado = false
  tenantQuery(collection(db, COMANDAS_COLLECTION), where('espacioId', '==', espacioId), where('estado', 'in', ['pendiente', 'en_preparacion', 'listo'])).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snapshot) => callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as ComandaCocina))))
  })
  return () => { cancelado = true; unsubscribe() }
}
