'use client'

import { ShoppingCart, ChefHat, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { InfoMesa } from '@/lib/salon-service'
import type { ComandaCocina } from '@/lib/pedidos-service'
import { ESTADO_CONFIG } from './MesaVisual'

interface SalonDetailPanelProps {
  info: InfoMesa
  comandas: ComandaCocina[]
  onAbrirPedido?: (pedidoId: string) => void
  onClose: () => void
}

export function SalonDetailPanel({ info, comandas, onAbrirPedido, onClose }: SalonDetailPanelProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 transition-all shrink-0',
        ESTADO_CONFIG[info.estado].bg,
        ESTADO_CONFIG[info.estado].border,
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shadow-inner',
            ESTADO_CONFIG[info.estado].iconBg,
          )}>
            {info.mesa.nombre.charAt(0)}
          </div>
          <div>
            <p className="font-bold text-foreground">{info.mesa.nombre}</p>
            <p className="text-xs text-muted-foreground">
              {ESTADO_CONFIG[info.estado].label}
              {info.totalItems > 0 && ` · ${info.totalItems} ítems`}
              {info.pedidos.length > 1 && ` · ${info.pedidos.length} cuentas`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {info.pedidos.length <= 1 && (
            <>
              {info.comandasPendientes > 0 && (
                <Badge variant="outline" className={cn('text-xs gap-1', ESTADO_CONFIG.en_cocina.badgeClass)}>
                  <ChefHat className="h-3 w-3" />
                  {info.comandasPendientes} en cocina
                </Badge>
              )}
              {info.comandasListas > 0 && (
                <Badge variant="outline" className={cn('text-xs gap-1', ESTADO_CONFIG.lista.badgeClass)}>
                  <CheckCircle2 className="h-3 w-3" />
                  {info.comandasListas} lista{info.comandasListas !== 1 && 's'}
                </Badge>
              )}
              {onAbrirPedido && info.pedidoActivo && (
                <button
                  onClick={() => onAbrirPedido(info.pedidoActivo!.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors active:scale-95"
                >
                  <ShoppingCart className="h-3 w-3" />
                  Ir al pedido
                </button>
              )}
            </>
          )}
          <button
            onClick={onClose}
            className="ml-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {info.pedidos.length > 1 && (
        <div className="mt-3 space-y-2">
          {info.pedidos.map((pedido, idx) => {
            const itemCount = pedido.items.reduce((s, i) => s + i.quantity, 0)
            const pedidoComandas = comandas.filter(c => c.pedidoId === pedido.id && c.tipo !== 'cancelacion')
            const pendientes = pedidoComandas.filter(c => c.estado === 'pendiente' || c.estado === 'en_preparacion').length
            const listos = pedidoComandas.filter(c => c.estado === 'listo').length

            return (
              <div key={pedido.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-background/60 border border-border/50">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-foreground shrink-0">Cuenta {idx + 1}</span>
                  <span className="text-[10px] text-muted-foreground truncate">
                    {itemCount} ítem{itemCount !== 1 && 's'}
                  </span>
                  {pendientes > 0 && (
                    <Badge variant="outline" className={cn('text-[10px] h-4 gap-0.5 px-1.5', ESTADO_CONFIG.en_cocina.badgeClass)}>
                      <ChefHat className="h-2.5 w-2.5" />
                      {pendientes}
                    </Badge>
                  )}
                  {listos > 0 && (
                    <Badge variant="outline" className={cn('text-[10px] h-4 gap-0.5 px-1.5', ESTADO_CONFIG.lista.badgeClass)}>
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      {listos}
                    </Badge>
                  )}
                </div>
                {onAbrirPedido && (
                  <button
                    onClick={() => onAbrirPedido(pedido.id)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold hover:bg-primary/90 transition-colors active:scale-95 shrink-0"
                  >
                    <ShoppingCart className="h-2.5 w-2.5" />
                    Ir
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
