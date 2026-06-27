'use client'

import { useState, useMemo, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Merge, ChefHat, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/demo-data'
import type { PedidoActivo, ComandaCocina } from '@/lib/pedidos-service'

interface UnirCuentasDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pedidos: PedidoActivo[]
  comandas: ComandaCocina[]
  pedidoDestinoIdInicial: string | null
  nombreMesa: string
  onConfirm: (destinoId: string, origenIds: string[]) => Promise<void>
}

export function UnirCuentasDialog({
  open,
  onOpenChange,
  pedidos,
  comandas,
  pedidoDestinoIdInicial,
  nombreMesa,
  onConfirm,
}: UnirCuentasDialogProps) {
  const [destinoId, setDestinoId] = useState<string | null>(null)
  const [origenIds, setOrigenIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  const destinoActual = destinoId ?? pedidoDestinoIdInicial

  const toggleOrigen = useCallback((id: string) => {
    setOrigenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectDestino = useCallback((id: string) => {
    setDestinoId(id)
    setOrigenIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const totalCombinado = useMemo(() => {
    if (!destinoActual) return 0
    let total = 0
    for (const p of pedidos) {
      if (p.id === destinoActual || origenIds.has(p.id)) {
        total += p.items.reduce((s, i) => s + i.price * i.quantity, 0)
      }
    }
    return total
  }, [pedidos, destinoActual, origenIds])

  const canConfirm = destinoActual && origenIds.size > 0

  const handleConfirm = useCallback(async () => {
    if (!destinoActual || origenIds.size === 0) return
    setSubmitting(true)
    try {
      await onConfirm(destinoActual, Array.from(origenIds))
      setDestinoId(null)
      setOrigenIds(new Set())
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }, [destinoActual, origenIds, onConfirm, onOpenChange])

  const handleOpenChange = useCallback((v: boolean) => {
    if (!v) {
      setDestinoId(null)
      setOrigenIds(new Set())
    }
    onOpenChange(v)
  }, [onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg w-[95vw] bg-card border-none flex flex-col p-0 overflow-hidden shadow-2xl rounded-3xl max-h-[85vh]">
        <DialogHeader className="px-6 py-5 border-b border-border bg-card shrink-0">
          <DialogTitle className="text-xl font-black flex items-center gap-3 text-foreground">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Merge className="h-5 w-5 text-primary" />
            </div>
            Unir Cuentas
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 font-medium">
            {nombreMesa} &middot; Selecciona destino y cuentas a unir
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-3">
            {pedidos.map((pedido, idx) => {
              const itemCount = pedido.items.reduce((s, i) => s + i.quantity, 0)
              const subtotal = pedido.items.reduce((s, i) => s + i.price * i.quantity, 0)
              const pedidoComandas = comandas.filter(c => c.pedidoId === pedido.id && c.tipo !== 'cancelacion')
              const pendientes = pedidoComandas.filter(c => c.estado === 'pendiente' || c.estado === 'en_preparacion').length
              const listos = pedidoComandas.filter(c => c.estado === 'listo').length

              const isDestino = pedido.id === destinoActual
              const isOrigen = origenIds.has(pedido.id)

              return (
                <div
                  key={pedido.id}
                  className={cn(
                    'p-4 rounded-xl border transition-all',
                    isDestino
                      ? 'bg-primary/10 border-primary/40 ring-2 ring-primary/20'
                      : isOrigen
                        ? 'bg-orange-500/5 border-orange-500/30'
                        : 'bg-card border-border',
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground text-sm">Cuenta {idx + 1}</span>
                      <span className="text-xs text-muted-foreground">
                        {itemCount} ítem{itemCount !== 1 && 's'}
                      </span>
                      {pendientes > 0 && (
                        <Badge variant="outline" className="text-[10px] h-4 gap-0.5 px-1.5 bg-orange-500/10 text-orange-600 border-orange-500/20">
                          <ChefHat className="h-2.5 w-2.5" />
                          {pendientes}
                        </Badge>
                      )}
                      {listos > 0 && (
                        <Badge variant="outline" className="text-[10px] h-4 gap-0.5 px-1.5 bg-success/10 text-success border-success/30">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          {listos}
                        </Badge>
                      )}
                    </div>
                    <span className="font-bold text-foreground text-sm">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>

                  <div className="text-xs text-muted-foreground mb-3 line-clamp-2">
                    {pedido.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => selectDestino(pedido.id)}
                      className={cn(
                        'flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all active:scale-95',
                        isDestino
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80',
                      )}
                    >
                      {isDestino ? 'Destino' : 'Elegir como destino'}
                    </button>
                    {!isDestino && (
                      <button
                        onClick={() => toggleOrigen(pedido.id)}
                        className={cn(
                          'flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all active:scale-95',
                          isOrigen
                            ? 'bg-orange-500 text-white shadow-sm'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80',
                        )}
                      >
                        {isOrigen ? 'Seleccionada' : 'Unir esta'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20 shrink-0">
          <div className="w-full space-y-3">
            {canConfirm && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">
                  {origenIds.size} cuenta{origenIds.size !== 1 && 's'} → Cuenta destino
                </span>
                <span className="float-right font-bold text-foreground">
                  Total: {formatCurrency(totalCombinado)}
                </span>
              </div>
            )}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => handleOpenChange(false)}
                className="flex-1 h-12 rounded-xl font-bold"
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!canConfirm || submitting}
                className="flex-1 h-12 rounded-xl font-bold bg-primary text-primary-foreground"
              >
                {submitting ? 'Uniendo...' : 'Unir cuentas'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
