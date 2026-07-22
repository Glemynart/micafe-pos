import { db } from './firebase'
import { doc, runTransaction, serverTimestamp, Timestamp, type DocumentSnapshot } from 'firebase/firestore'
import type { PedidoActivo, MovimientoCuenta } from './pedidos-service'

const PEDIDOS = 'pedidos_activos'
const COMANDAS = 'comandas_cocina'

export async function unirCuentas(
  pedidoDestinoId: string,
  pedidosOrigenIds: string[],
  cajeroId: string,
): Promise<void> {
  if (pedidosOrigenIds.length === 0) {
    throw new Error('Debe seleccionar al menos una cuenta origen')
  }
  if (pedidosOrigenIds.includes(pedidoDestinoId)) {
    throw new Error('No se puede unir una cuenta consigo misma')
  }
  if (new Set(pedidosOrigenIds).size !== pedidosOrigenIds.length) {
    throw new Error('Las cuentas origen no pueden estar duplicadas')
  }

  await runTransaction(db, async (transaction) => {
    // --- FASE DE LECTURAS ---
    const destinoRef = doc(db, PEDIDOS, pedidoDestinoId)
    const destinoSnap = await transaction.get(destinoRef)
    if (!destinoSnap.exists()) throw new Error('Pedido destino no encontrado')
    const destino = destinoSnap.data() as PedidoActivo

    if (!destino.activo || destino.estado !== 'abierto') {
      throw new Error('El pedido destino debe estar abierto')
    }
    if (!destino.mesaId) {
      throw new Error('No se pueden unir pedidos de mostrador')
    }

    const origenes: { data: PedidoActivo; id: string }[] = []
    for (const origenId of pedidosOrigenIds) {
      const origenRef = doc(db, PEDIDOS, origenId)
      const origenSnap = await transaction.get(origenRef)
      if (!origenSnap.exists()) throw new Error(`Pedido origen ${origenId} no encontrado`)
      const origen = origenSnap.data() as PedidoActivo

      if (!origen.activo || origen.estado !== 'abierto') {
        throw new Error('Solo se pueden unir pedidos abiertos')
      }
      if (origen.mesaId !== destino.mesaId) {
        throw new Error('Todas las cuentas deben pertenecer a la misma mesa')
      }

      origenes.push({ data: origen, id: origenId })
    }

    // Leer comandas de todos los orígenes (entra en read-set de la transacción)
    const comandasPorOrigen: Map<string, string[]> = new Map()
    const comandaSnaps: Map<string, DocumentSnapshot> = new Map()
    for (const origen of origenes) {
      const ids = origen.data.comandaIds || []
      comandasPorOrigen.set(origen.id, ids)
      for (const comandaId of ids) {
        const snap = await transaction.get(doc(db, COMANDAS, comandaId))
        comandaSnaps.set(comandaId, snap)
      }
    }

    // --- FASE DE ESCRITURAS ---
    const fechaMovimiento = Timestamp.now()

    // IMP-11: garantizar uid presente en todo item que entra al consolidado
    // (solo afecta items legacy sin uid; con uid ya asignado es un no-op).
    let itemsConsolidados = destino.items.map(item => ({ ...item, uid: item.uid || crypto.randomUUID() }))
    let comandaIdsConsolidados = [...(destino.comandaIds || [])]
    const movimientosDestino = [...(destino.movimientos || [])]

    for (const origen of origenes) {
      const itemsLog = origen.data.items.map(item => ({
        uid: item.uid || item.id,
        name: item.name,
        quantity: item.quantity,
      }))

      // Anexar items preservando uid y cantidadEnviada (IMP-11: sanear uid si falta)
      itemsConsolidados = [
        ...itemsConsolidados,
        ...origen.data.items.map(item => ({ ...item, uid: item.uid || crypto.randomUUID() })),
      ]

      // Consolidar comandaIds (solo las que existen)
      const origenComandaIds = comandasPorOrigen.get(origen.id) || []
      const origenComandaIdsExistentes = origenComandaIds.filter(id => comandaSnaps.get(id)?.exists())
      comandaIdsConsolidados = [...comandaIdsConsolidados, ...origenComandaIdsExistentes]

      // Repuntar pedidoId de cada comanda del origen al destino
      for (const comandaId of origenComandaIds) {
        const snap = comandaSnaps.get(comandaId)
        if (snap?.exists()) {
          transaction.update(snap.ref, {
            pedidoId: pedidoDestinoId,
          })
        }
      }

      // Movimiento en el origen
      const movOrigen: MovimientoCuenta = {
        tipo: 'union_origen',
        pedidoRelacionadoId: pedidoDestinoId,
        items: itemsLog,
        fecha: fechaMovimiento,
        cajeroId,
      }

      // Cerrar origen
      transaction.update(doc(db, PEDIDOS, origen.id), {
        items: [],
        estado: 'unificado',
        activo: false,
        unionDestinoId: pedidoDestinoId,
        movimientos: [...(origen.data.movimientos || []), movOrigen],
        actualizadoEn: serverTimestamp(),
      })

      // Movimiento en el destino
      const movDestino: MovimientoCuenta = {
        tipo: 'union_destino',
        pedidoRelacionadoId: origen.id,
        items: itemsLog,
        fecha: fechaMovimiento,
        cajeroId,
      }
      movimientosDestino.push(movDestino)
    }

    // Escribir destino
    transaction.update(destinoRef, {
      items: itemsConsolidados,
      comandaIds: comandaIdsConsolidados,
      movimientos: movimientosDestino,
      actualizadoEn: serverTimestamp(),
    })
  })
}
