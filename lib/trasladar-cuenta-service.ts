import { db } from './firebase'
import { doc, runTransaction, serverTimestamp, Timestamp, type DocumentSnapshot } from 'firebase/firestore'
import type { PedidoActivo, MovimientoCuenta } from './pedidos-service'
import type { Mesa } from './mesas-service'

const PEDIDOS = 'pedidos_activos'
const COMANDAS = 'comandas_cocina'
const MESAS = 'mesas'

/**
 * Traslada una cuenta abierta (un único PedidoActivo) de su mesa actual a otra mesa.
 *
 * No se mueve la mesa completa: se mueve un solo pedido. El pedido es el mismo
 * antes y después, sólo cambia su ubicación (mesaId + nombreMesa denormalizado),
 * y la de TODAS sus comandas asociadas.
 *
 * Mismo patrón que separar/unir: una sola transacción, primero todas las lecturas
 * y luego todas las escrituras, sin side effects.
 */
export async function trasladarCuenta(
  pedidoId: string,
  mesaDestinoId: string,
  cajeroId: string,
): Promise<void> {
  await runTransaction(db, async (transaction) => {
    // --- FASE DE LECTURAS ---
    const pedidoRef = doc(db, PEDIDOS, pedidoId)
    const pedidoSnap = await transaction.get(pedidoRef)
    if (!pedidoSnap.exists()) throw new Error('Pedido no encontrado')
    const pedido = pedidoSnap.data() as PedidoActivo

    if (!pedido.activo || pedido.estado !== 'abierto') {
      throw new Error('Solo se pueden trasladar pedidos abiertos')
    }
    if (!pedido.mesaId) {
      throw new Error('No se puede trasladar un pedido de mostrador')
    }
    if (pedido.inicioAlquiler != null) {
      throw new Error('No se puede trasladar un pedido de alquiler')
    }
    if (pedido.mesaId === mesaDestinoId) {
      throw new Error('El pedido ya está en esa mesa')
    }

    const mesaDestinoRef = doc(db, MESAS, mesaDestinoId)
    const mesaDestinoSnap = await transaction.get(mesaDestinoRef)
    if (!mesaDestinoSnap.exists()) throw new Error('Mesa destino no encontrada')
    const mesaDestino = mesaDestinoSnap.data() as Mesa

    if (!mesaDestino.activa) {
      throw new Error('La mesa destino no está activa')
    }
    if (mesaDestino.espacioId !== pedido.espacioId) {
      throw new Error('La mesa destino pertenece a otro espacio')
    }

    // Leer todas las comandas del pedido (entran en el read-set de la transacción)
    const comandaIds = pedido.comandaIds || []
    const comandaSnaps: DocumentSnapshot[] = []
    for (const comandaId of comandaIds) {
      const snap = await transaction.get(doc(db, COMANDAS, comandaId))
      comandaSnaps.push(snap)
    }

    // --- FASE DE ESCRITURAS ---
    const mesaOrigenId = pedido.mesaId
    const nombreMesaOrigen = pedido.nombreMesa
    const nombreMesaDestino = mesaDestino.nombre

    const movimiento: MovimientoCuenta = {
      tipo: 'traslado',
      mesaOrigenId,
      mesaDestinoId,
      nombreMesaOrigen,
      nombreMesaDestino,
      items: pedido.items.map(item => ({
        uid: item.uid || item.id,
        name: item.name,
        quantity: item.quantity,
      })),
      fecha: Timestamp.now(),
      cajeroId,
    }

    transaction.update(pedidoRef, {
      mesaId: mesaDestinoId,
      nombreMesa: nombreMesaDestino,
      movimientos: [...(pedido.movimientos || []), movimiento],
      actualizadoEn: serverTimestamp(),
    })

    // Reubicar todas las comandas existentes (solo ubicación, nada más)
    for (const snap of comandaSnaps) {
      if (snap.exists()) {
        transaction.update(snap.ref, {
          mesaId: mesaDestinoId,
          nombreMesa: nombreMesaDestino,
        })
      }
    }
  })
}
