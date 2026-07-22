import { db } from './firebase'
import { collection, doc, setDoc, onSnapshot, query, where, deleteDoc, serverTimestamp, runTransaction, arrayUnion } from 'firebase/firestore'
import type { ImpuestoTipo } from '@/lib/impuestos-service'
import { sonLineasComercialmenteEquivalentes, type ModificadorGrupoSnapshot } from '@/lib/configured-line'
import { proyectarModificadoresCocina } from '@/lib/modifier-snapshot-projection'
import { tenantQuery, getEmpresaId, stampEmpresaId, withEmpresaId } from '@/lib/tenant'

export interface PedidoItem {
  id: string // Product ID
  uid?: string // Unique instance ID for the cart item
  name: string
  code: string
  price: number
  cost: number
  category: string
  emoji: string
  stock: number
  // ADR-TRIB-001 D3: clasificación tributaria del ítem (reemplaza iva/impoconsumo).
  impuestoTipo?: ImpuestoTipo
  // Legado (IMP-6): ya no se leen para calcular impuesto; opcionales por
  // compatibilidad con pedidos_activos abiertos antes del despliegue.
  iva?: number
  impoconsumo?: number
  hasRecipe: boolean
  quantity: number
  /** Contrato de línea U4. Ausente en documentos legacy. */
  schemaVersion?: 1
  configurationKey?: string
  precioBaseUnitario?: number
  modificadores?: PedidoItemModificador[]
  cantidadEnviada?: number
  enviadoCocina?: boolean // Deprecated — usar cantidadEnviada
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
  // Otro pedido involucrado (separar/unir). Undefined en traslados: el pedido es el mismo.
  pedidoRelacionadoId?: string
  // Solo en traslados: ubicación antes/después del cambio de mesa.
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
  mesaId: string | null // null = Mostrador/Para llevar
  nombreMesa: string
  espacioId: string
  cajeroId: string
  items: PedidoItem[]
  estado: 'abierto' | 'pagado' | 'cancelado' | 'unificado'
  activo: boolean
  comandaIds?: string[]
  movimientos?: MovimientoCuenta[]
  inicioAlquiler?: number | null // Timestamp en ms para alquileres
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
  /** Snapshot U4 transportado desde PedidoItem; opcional para comandas legacy. */
  modificadores?: PedidoItemModificador[]
}

/** Solo para presentación KDS; no consulta catálogo ni servicios administrativos. */
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

  tenantQuery(
    collection(db, COLLECTION_NAME),
    where('espacioId', '==', espacioId),
    where('activo', '==', true)
  ).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snapshot) => {
      const pedidos = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PedidoActivo))
      callback(pedidos)
    })
  })

  return () => {
    cancelado = true
    unsubscribe()
  }
}

export async function guardarPedido(pedido: Omit<PedidoActivo, 'actualizadoEn' | 'id' | 'activo' | 'comandaIds'> & { id?: string }) {
  const pedidoId = pedido.id || doc(collection(db, COLLECTION_NAME)).id
  await setDoc(doc(db, COLLECTION_NAME, pedidoId), await stampEmpresaId({
    ...pedido,
    id: pedidoId,
    activo: true,
    comandaIds: [],
    actualizadoEn: serverTimestamp()
  }), { merge: true })
}

export async function agregarItemPedido(
  pedidoId: string,
  newItem: PedidoItem,
) {
  await runTransaction(db, async (transaction) => {
    const docRef = doc(db, COLLECTION_NAME, pedidoId)
    const snap = await transaction.get(docRef)
    if (!snap.exists()) throw new Error('Pedido no encontrado')

    const pedido = snap.data() as PedidoActivo
    if (!pedido.activo) throw new Error('Pedido no está activo')

    const esLineaU4 = newItem.schemaVersion === 1 && typeof newItem.configurationKey === 'string'
    const existingIndex = esLineaU4
      ? pedido.items.findIndex((item) => sonLineasComercialmenteEquivalentes(item, newItem))
      : pedido.items.findIndex((item) => item.schemaVersion !== 1 && item.id === newItem.id)
    let updatedItems: PedidoItem[]

    if (existingIndex !== -1) {
      updatedItems = pedido.items.map((it, idx) => {
        if (idx !== existingIndex) return it
        return { ...it, quantity: it.quantity + newItem.quantity }
      })
    } else {
      updatedItems = [{ ...newItem, uid: newItem.uid || crypto.randomUUID() }, ...pedido.items]
    }

    transaction.update(docRef, {
      items: updatedItems,
      actualizadoEn: serverTimestamp(),
    })
  })
}

export async function enviarPedidoACocina(pedidoId: string) {
  // MT-U3 Capa 3: resuelto antes de runTransaction (§2.5).
  const empresaId = await getEmpresaId()

  await runTransaction(db, async (transaction) => {
    const docRef = doc(db, COLLECTION_NAME, pedidoId);
    const snap = await transaction.get(docRef);
    if (!snap.exists()) return;

    const pedido = snap.data() as PedidoActivo;
    if (!pedido.activo) return;

    const itemsToSend: ComandaItem[] = [];

    const isAdicion = pedido.items.some(i => (i.cantidadEnviada || 0) > 0);

    const updatedItems = pedido.items.map(item => {
      const cantidadEnviada = item.cantidadEnviada || 0;
      const difference = item.quantity - cantidadEnviada;

      if (difference > 0) {
        itemsToSend.push({
          uid: item.uid || item.id,
          name: item.name,
          quantity: difference,
          ...(item.modificadores !== undefined ? { modificadores: item.modificadores } : {}),
        });
        return { ...item, cantidadEnviada: item.quantity };
      }
      return item;
    });

    if (itemsToSend.length === 0) return;

    const comandaId = doc(collection(db, COMANDAS_COLLECTION)).id;
    transaction.set(doc(db, COMANDAS_COLLECTION, comandaId), withEmpresaId(empresaId, {
      id: comandaId,
      pedidoId: pedido.id,
      mesaId: pedido.mesaId,
      nombreMesa: pedido.nombreMesa,
      espacioId: pedido.espacioId,
      cajeroId: pedido.cajeroId,
      items: itemsToSend,
      estado: 'pendiente',
      tipo: isAdicion ? 'adicion' : 'nuevo',
      creadoEn: serverTimestamp()
    }));

    transaction.update(docRef, {
      items: updatedItems,
      comandaIds: arrayUnion(comandaId),
      actualizadoEn: serverTimestamp()
    });
  });
}

export async function modificarItemPedido(
  pedidoId: string,
  itemUid: string,
  newQuantity: number,
) {
  if (newQuantity < 0) {
    throw new Error(`Cantidad inválida: ${newQuantity}`)
  }

  // MT-U3 Capa 3: resuelto antes de runTransaction (§2.5).
  const empresaId = await getEmpresaId()

  await runTransaction(db, async (transaction) => {
    const docRef = doc(db, COLLECTION_NAME, pedidoId)
    const snap = await transaction.get(docRef)
    if (!snap.exists()) throw new Error('Pedido no encontrado')

    const pedido = snap.data() as PedidoActivo
    if (!pedido.activo) throw new Error('Pedido no está activo')

    const itemIndex = pedido.items.findIndex(i => (i.uid || i.id) === itemUid)
    if (itemIndex === -1) throw new Error('Item no encontrado en el pedido')

    const item = pedido.items[itemIndex]
    const cantidadEnviada = item.cantidadEnviada || 0
    const isRemoval = newQuantity === 0

    const deltaCancelar = isRemoval
      ? cantidadEnviada
      : Math.max(0, cantidadEnviada - newQuantity)

    if (deltaCancelar > cantidadEnviada) {
      throw new Error(
        `Cancelación imposible: deltaCancelar (${deltaCancelar}) > cantidadEnviada (${cantidadEnviada})`
      )
    }

    let cancelacionComandaId: string | undefined
    if (deltaCancelar > 0) {
      cancelacionComandaId = doc(collection(db, COMANDAS_COLLECTION)).id
      transaction.set(doc(db, COMANDAS_COLLECTION, cancelacionComandaId), withEmpresaId(empresaId, {
        id: cancelacionComandaId,
        pedidoId: pedido.id,
        mesaId: pedido.mesaId,
        nombreMesa: pedido.nombreMesa,
        espacioId: pedido.espacioId,
        cajeroId: pedido.cajeroId,
        items: [{
          uid: item.uid || item.id,
          name: item.name,
          quantity: deltaCancelar,
          ...(item.modificadores !== undefined ? { modificadores: item.modificadores } : {}),
        }],
        estado: 'pendiente',
        tipo: 'cancelacion',
        creadoEn: serverTimestamp(),
      }))
    }

    let updatedItems: PedidoItem[]
    if (isRemoval) {
      updatedItems = pedido.items.filter((_, idx) => idx !== itemIndex)
    } else {
      updatedItems = pedido.items.map((it, idx) => {
        if (idx !== itemIndex) return it
        return {
          ...it,
          quantity: newQuantity,
          cantidadEnviada: Math.min(cantidadEnviada, newQuantity),
        }
      })
    }

    if (updatedItems.length === 0) {
      transaction.update(docRef, {
        items: [],
        estado: 'cancelado',
        activo: false,
        actualizadoEn: serverTimestamp(),
        ...(cancelacionComandaId ? { comandaIds: arrayUnion(cancelacionComandaId) } : {}),
      })
    } else {
      transaction.update(docRef, {
        items: updatedItems,
        actualizadoEn: serverTimestamp(),
        ...(cancelacionComandaId ? { comandaIds: arrayUnion(cancelacionComandaId) } : {}),
      })
    }
  })
}

export async function finalizarAlquiler(pedidoId: string, itemAlquiler: PedidoItem) {
  await runTransaction(db, async (transaction) => {
    const docRef = doc(db, COLLECTION_NAME, pedidoId)
    const snap = await transaction.get(docRef)
    if (!snap.exists()) throw new Error('Pedido no encontrado')

    const pedido = snap.data() as PedidoActivo
    if (!pedido.inicioAlquiler) return

    const itemAlquilerUid = itemAlquiler.uid || itemAlquiler.id
    const existingIndex = pedido.items.findIndex((item) => (item.uid || item.id) === itemAlquilerUid)
    const updatedItems = existingIndex !== -1
      ? pedido.items
      : [...pedido.items, itemAlquiler]

    transaction.update(docRef, {
      items: updatedItems,
      inicioAlquiler: null,
      actualizadoEn: serverTimestamp(),
    })
  })
}

export async function eliminarPedido(pedidoId: string) {
  await deleteDoc(doc(db, COLLECTION_NAME, pedidoId))
}

export async function archivarPedidoConComandas(pedidoId: string, ventaId: string) {
  await runTransaction(db, async (transaction) => {
    const pedidoRef = doc(db, COLLECTION_NAME, pedidoId)
    const pedidoSnap = await transaction.get(pedidoRef)
    if (!pedidoSnap.exists()) throw new Error('Pedido no encontrado')

    const pedido = pedidoSnap.data() as PedidoActivo
    if (!pedido.activo || pedido.estado !== 'abierto') {
      throw new Error('Pedido ya no está activo')
    }

    const ids = pedido.comandaIds || []
    const comandaSnaps = await Promise.all(
      ids.map(id => transaction.get(doc(db, COMANDAS_COLLECTION, id)))
    )

    transaction.update(pedidoRef, {
      estado: 'pagado',
      activo: false,
      fechaPago: serverTimestamp(),
      ventaId,
    })

    for (const snap of comandaSnaps) {
      if (snap.exists() && snap.data().estado !== 'entregado') {
        transaction.update(snap.ref, { estado: 'entregado', completadoEn: serverTimestamp() })
      }
    }
  })
}

// --- COMANDAS KDS (Kitchen Display System) ---

export function suscribirComandasCocina(espacioId: string, callback: (comandas: ComandaCocina[]) => void) {
  // Traemos comandas pendientes o en preparación. Las 'listo' ya salieron de cocina.
  let unsubscribe = () => {}
  let cancelado = false

  tenantQuery(
    collection(db, COMANDAS_COLLECTION),
    where('espacioId', '==', espacioId),
    where('estado', 'in', ['pendiente', 'en_preparacion'])
  ).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snapshot) => {
      const comandas = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ComandaCocina))
      // Ordenamos las más antiguas primero
      comandas.sort((a, b) => {
        const ta = a.creadoEn?.toDate().getTime() || 0
        const tb = b.creadoEn?.toDate().getTime() || 0
        return ta - tb
      })
      callback(comandas)
    })
  })

  return () => {
    cancelado = true
    unsubscribe()
  }
}

export async function actualizarEstadoComanda(comandaId: string, nuevoEstado: ComandaCocina['estado']) {
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, COMANDAS_COLLECTION, comandaId)
    const snap = await transaction.get(ref)
    if (!snap.exists()) return

    const comanda = snap.data() as ComandaCocina
    if (comanda.estado === 'entregado') return

    transaction.update(ref, {
      estado: nuevoEstado,
      ...(nuevoEstado === 'listo' || nuevoEstado === 'entregado'
        ? { completadoEn: serverTimestamp() }
        : {}),
    })
  })
}

export function suscribirComandasActivas(espacioId: string, callback: (comandas: ComandaCocina[]) => void) {
  let unsubscribe = () => {}
  let cancelado = false

  tenantQuery(
    collection(db, COMANDAS_COLLECTION),
    where('espacioId', '==', espacioId),
    where('estado', 'in', ['pendiente', 'en_preparacion', 'listo'])
  ).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snapshot) => {
      const comandas = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ComandaCocina))
      callback(comandas)
    })
  })

  return () => {
    cancelado = true
    unsubscribe()
  }
}

