import { db } from './firebase'
import { collection, doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'
import type { PedidoActivo, PedidoItem, MovimientoCuenta } from './pedidos-service'

export interface ItemSeparacion {
  uid: string
  cantidad: number
}

export async function separarCuenta(
  pedidoOrigenId: string,
  itemsToMove: ItemSeparacion[],
  cajeroId: string,
): Promise<string> {
  return runTransaction(db, async (transaction) => {
    const origenRef = doc(db, 'pedidos_activos', pedidoOrigenId)
    const origenSnap = await transaction.get(origenRef)
    if (!origenSnap.exists()) throw new Error('Pedido no encontrado')

    const origen = origenSnap.data() as PedidoActivo
    if (!origen.activo || origen.estado !== 'abierto') {
      throw new Error('Solo se pueden separar pedidos abiertos')
    }
    if (!origen.mesaId) {
      throw new Error('No se puede separar un pedido de mostrador')
    }

    const moveMap = new Map(itemsToMove.map(i => [i.uid, i.cantidad]))
    const itemsOrigenActualizados: PedidoItem[] = []
    const itemsNuevoPedido: PedidoItem[] = []
    const itemsLog: Array<{ uid: string; name: string; quantity: number }> = []

    for (const item of origen.items) {
      const itemUid = item.uid || item.id
      const cantidadMover = moveMap.get(itemUid)

      if (cantidadMover === undefined) {
        itemsOrigenActualizados.push(item)
        continue
      }

      if (cantidadMover <= 0 || cantidadMover > item.quantity) {
        throw new Error(`Cantidad inválida para ${item.name}: ${cantidadMover}`)
      }

      const cantidadEnviada = item.cantidadEnviada || 0
      const noEnviados = item.quantity - cantidadEnviada
      const moverNoEnviados = Math.min(cantidadMover, noEnviados)
      const moverEnviados = cantidadMover - moverNoEnviados

      if (cantidadMover === item.quantity) {
        itemsNuevoPedido.push({
          ...item,
          uid: item.uid || crypto.randomUUID(),
          cantidadEnviada: moverEnviados,
        })
      } else {
        itemsOrigenActualizados.push({
          ...item,
          quantity: item.quantity - cantidadMover,
          cantidadEnviada: cantidadEnviada - moverEnviados,
        })

        itemsNuevoPedido.push({
          ...item,
          uid: crypto.randomUUID(),
          quantity: cantidadMover,
          cantidadEnviada: moverEnviados,
        })
      }

      itemsLog.push({ uid: itemUid, name: item.name, quantity: cantidadMover })
      moveMap.delete(itemUid)
    }

    if (moveMap.size > 0) {
      throw new Error('Algunos items a mover no existen en el pedido')
    }
    if (itemsOrigenActualizados.length === 0) {
      throw new Error('El pedido origen debe conservar al menos un item')
    }
    if (itemsNuevoPedido.length === 0) {
      throw new Error('Debe seleccionar al menos un item para separar')
    }

    const nuevoPedidoId = doc(collection(db, 'pedidos_activos')).id
    const fechaMovimiento = Timestamp.now()

    const movOrigen: MovimientoCuenta = {
      tipo: 'separacion_origen',
      pedidoRelacionadoId: nuevoPedidoId,
      items: itemsLog,
      fecha: fechaMovimiento,
      cajeroId,
    }

    const movDestino: MovimientoCuenta = {
      tipo: 'separacion_destino',
      pedidoRelacionadoId: pedidoOrigenId,
      items: itemsLog,
      fecha: fechaMovimiento,
      cajeroId,
    }

    transaction.update(origenRef, {
      items: itemsOrigenActualizados,
      movimientos: [...(origen.movimientos || []), movOrigen],
      actualizadoEn: serverTimestamp(),
    })

    transaction.set(doc(db, 'pedidos_activos', nuevoPedidoId), {
      id: nuevoPedidoId,
      mesaId: origen.mesaId,
      nombreMesa: origen.nombreMesa,
      espacioId: origen.espacioId,
      cajeroId,
      items: itemsNuevoPedido,
      estado: 'abierto',
      activo: true,
      comandaIds: [],
      movimientos: [movDestino],
      actualizadoEn: serverTimestamp(),
    })

    return nuevoPedidoId
  })
}
