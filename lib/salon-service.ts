import type { Mesa } from './mesas-service'
import type { PedidoActivo, ComandaCocina } from './pedidos-service'

export type EstadoMesa = 'libre' | 'ocupada' | 'en_cocina' | 'lista'

export interface InfoMesa {
  mesa: Mesa
  estado: EstadoMesa
  pedidoActivo: PedidoActivo | null
  totalItems: number
  comandasPendientes: number
  comandasListas: number
}

export function estadoMesa(
  mesa: Mesa,
  pedidos: PedidoActivo[],
  comandas: ComandaCocina[],
): InfoMesa {
  const pedido = pedidos.find(p => p.mesaId === mesa.id && p.activo && p.estado === 'abierto') ?? null

  if (!pedido) {
    return { mesa, estado: 'libre', pedidoActivo: null, totalItems: 0, comandasPendientes: 0, comandasListas: 0 }
  }

  const comandasPedido = comandas.filter(c => c.pedidoId === pedido.id && c.tipo !== 'cancelacion')
  const pendientes = comandasPedido.filter(c => c.estado === 'pendiente' || c.estado === 'en_preparacion').length
  const listas = comandasPedido.filter(c => c.estado === 'listo').length
  const totalItems = pedido.items.reduce((sum, i) => sum + i.quantity, 0)

  let estado: EstadoMesa
  if (pendientes > 0) {
    estado = 'en_cocina'
  } else if (comandasPedido.length > 0 && listas > 0) {
    estado = 'lista'
  } else {
    estado = 'ocupada'
  }

  return { mesa, estado, pedidoActivo: pedido, totalItems, comandasPendientes: pendientes, comandasListas: listas }
}

export function derivarMapa(
  mesas: Mesa[],
  pedidos: PedidoActivo[],
  comandas: ComandaCocina[],
): InfoMesa[] {
  return mesas.map(m => estadoMesa(m, pedidos, comandas))
}
