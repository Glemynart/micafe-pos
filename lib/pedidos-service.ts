import { db } from './firebase'
import { collection, doc, setDoc, onSnapshot, query, where, deleteDoc, serverTimestamp, getDoc, orderBy } from 'firebase/firestore'

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
  iva: number
  impoconsumo: number
  hasRecipe: boolean
  quantity: number
  enviadoCocina?: boolean // True if this exact item has been sent to the kitchen
}

export interface PedidoActivo {
  id: string
  mesaId: string | null // null = Mostrador/Para llevar
  nombreMesa: string
  espacioId: string
  cajeroId: string
  items: PedidoItem[]
  estado: 'abierto' | 'en_preparacion'
  inicioAlquiler?: number | null // Timestamp en ms para alquileres
  actualizadoEn: any
}

export interface ComandaItem {
  uid: string
  name: string
  quantity: number
  notas?: string
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
  const q = query(
    collection(db, COLLECTION_NAME),
    where('espacioId', '==', espacioId)
  )

  return onSnapshot(q, (snapshot) => {
    const pedidos = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PedidoActivo))
    callback(pedidos)
  })
}

export async function guardarPedido(pedido: Omit<PedidoActivo, 'actualizadoEn' | 'id'> & { id?: string }) {
  const pedidoId = pedido.id || doc(collection(db, COLLECTION_NAME)).id
  await setDoc(doc(db, COLLECTION_NAME, pedidoId), {
    ...pedido,
    id: pedidoId,
    actualizadoEn: serverTimestamp()
  }, { merge: true })
}

export async function enviarPedidoACocina(pedidoId: string) {
  const docRef = doc(db, COLLECTION_NAME, pedidoId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return;

  const pedido = snap.data() as PedidoActivo;
  const itemsToSend: ComandaItem[] = [];
  
  const isAdicion = pedido.items.some((i: any) => (i.cantidadEnviada || 0) > 0);

  const updatedItems = pedido.items.map(item => {
    const cantidadEnviada = (item as any).cantidadEnviada || 0;
    const difference = item.quantity - cantidadEnviada;
    
    // Solo si es un producto que se prepara (hasRecipe o bebidas, etc, pero por ahora enviaremos todo lo nuevo)
    if (difference > 0) {
      itemsToSend.push({
        uid: item.uid || item.id,
        name: item.name,
        quantity: difference,
      });
      return { ...item, cantidadEnviada: item.quantity };
    }
    return item;
  });

  if (itemsToSend.length === 0) return; // No hay nada nuevo para enviar

  // 1. Crear la comanda para KDS
  const comandaId = doc(collection(db, COMANDAS_COLLECTION)).id;
  await setDoc(doc(db, COMANDAS_COLLECTION, comandaId), {
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
  });

  // 2. Actualizar el pedido
  await setDoc(docRef, {
    items: updatedItems,
    estado: 'en_preparacion',
    actualizadoEn: serverTimestamp()
  }, { merge: true });
}

export async function eliminarPedido(pedidoId: string) {
  await deleteDoc(doc(db, COLLECTION_NAME, pedidoId))
}

// --- COMANDAS KDS (Kitchen Display System) ---

export function suscribirComandasCocina(espacioId: string, callback: (comandas: ComandaCocina[]) => void) {
  // Traemos comandas pendientes o en preparación. Las 'listo' ya salieron de cocina.
  const q = query(
    collection(db, COMANDAS_COLLECTION),
    where('espacioId', '==', espacioId),
    where('estado', 'in', ['pendiente', 'en_preparacion'])
  )

  return onSnapshot(q, (snapshot) => {
    const comandas = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ComandaCocina))
    // Ordenamos las más antiguas primero
    comandas.sort((a, b) => {
      const ta = a.creadoEn?.toDate().getTime() || 0
      const tb = b.creadoEn?.toDate().getTime() || 0
      return ta - tb
    })
    callback(comandas)
  })
}

export async function crearComanda(comanda: Omit<ComandaCocina, 'id' | 'creadoEn'>) {
  const comandaId = doc(collection(db, COMANDAS_COLLECTION)).id
  await setDoc(doc(db, COMANDAS_COLLECTION, comandaId), {
    ...comanda,
    id: comandaId,
    creadoEn: serverTimestamp()
  })
}

export async function actualizarEstadoComanda(comandaId: string, nuevoEstado: ComandaCocina['estado']) {
  const data: any = { estado: nuevoEstado }
  if (nuevoEstado === 'listo' || nuevoEstado === 'entregado') {
    data.completadoEn = serverTimestamp()
  }
  await setDoc(doc(db, COMANDAS_COLLECTION, comandaId), data, { merge: true })
}
