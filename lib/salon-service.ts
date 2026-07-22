import type { Mesa } from './mesas-service'
import type { PedidoActivo, ComandaCocina } from './pedidos-service'

export type EstadoMesa = 'libre' | 'ocupada' | 'en_cocina' | 'lista'

export interface InfoMesa {
  mesa: Mesa
  estado: EstadoMesa
  pedidos: PedidoActivo[]
  pedidoActivo: PedidoActivo | null
  displayName: string
  totalItems: number
  comandasPendientes: number
  comandasListas: number
}

export function estadoMesa(
  mesa: Mesa,
  pedidos: PedidoActivo[],
  comandas: ComandaCocina[],
): InfoMesa {
  const pedidosMesa = pedidos.filter(p => p.mesaId === mesa.id && p.activo && p.estado === 'abierto')
  const pedido = pedidosMesa[0] ?? null

  if (pedidosMesa.length === 0) {
    return { mesa, estado: 'libre', pedidos: [], pedidoActivo: null, displayName: mesa.nombre, totalItems: 0, comandasPendientes: 0, comandasListas: 0 }
  }

  let totalItems = 0
  let pendientes = 0
  let listas = 0
  let totalComandas = 0

  for (const p of pedidosMesa) {
    totalItems += p.items.reduce((sum, i) => sum + i.quantity, 0)
    const comandasPedido = comandas.filter(c => c.pedidoId === p.id && c.tipo !== 'cancelacion')
    totalComandas += comandasPedido.length
    pendientes += comandasPedido.filter(c => c.estado === 'pendiente' || c.estado === 'en_preparacion').length
    listas += comandasPedido.filter(c => c.estado === 'listo').length
  }

  let estado: EstadoMesa
  if (pendientes > 0) {
    estado = 'en_cocina'
  } else if (totalComandas > 0 && listas > 0) {
    estado = 'lista'
  } else {
    estado = 'ocupada'
  }

  return { mesa, estado, pedidos: pedidosMesa, pedidoActivo: pedido, displayName: mesa.nombre, totalItems, comandasPendientes: pendientes, comandasListas: listas }
}

export function derivarMapa(
  mesas: Mesa[],
  pedidos: PedidoActivo[],
  comandas: ComandaCocina[],
): InfoMesa[] {
  return mesas.map(m => estadoMesa(m, pedidos, comandas))
}
