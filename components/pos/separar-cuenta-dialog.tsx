'use client'

import { useState, useMemo, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DynamicIcon } from '@/components/ui/dynamic-icon'
import { Plus, Minus, SplitSquareHorizontal, ChefHat } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/demo-data'
import type { PedidoItem } from '@/lib/pedidos-service'
import type { ItemSeparacion } from '@/lib/separar-cuenta-service'

interface SepararCuentaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: PedidoItem[]
  nombreMesa: string
  onConfirm: (items: ItemSeparacion[]) => Promise<void>
}

export function SepararCuentaDialog({
  open,
  onOpenChange,
  items,
  nombreMesa,
  onConfirm,
}: SepararCuentaDialogProps) {
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)

  const setQty = useCallback((uid: string, qty: number) => {
    setCantidades(prev => ({ ...prev, [uid]: qty }))
  }, [])

  const totalItemsSeleccionados = useMemo(
    () => Object.values(cantidades).reduce((s, q) => s + q, 0),
    [cantidades],
  )

  const totalItemsOrigen = useMemo(
    () => items.reduce((s, i) => s + i.quantity, 0),
    [items],
  )

  const itemsRestantes = totalItemsOrigen - totalItemsSeleccionados

  const canConfirm = totalItemsSeleccionados > 0 && itemsRestantes > 0

  const subtotalNuevaCuenta = useMemo(() => {
    let total = 0
    for (const item of items) {
      const uid = item.uid || item.id
      const qty = cantidades[uid] || 0
      if (qty > 0) total += item.price * qty
    }
    return total
  }, [items, cantidades])

  const handleConfirm = useCallback(async () => {
    const selected: ItemSeparacion[] = []
    for (const item of items) {
      const uid = item.uid || item.id
      const qty = cantidades[uid] || 0
      if (qty > 0) selected.push({ uid, cantidad: qty })
    }
    if (selected.length === 0) return

    setSubmitting(true)
    try {
      await onConfirm(selected)
      setCantidades({})
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }, [items, cantidades, onConfirm, onOpenChange])

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!v) setCantidades({})
      onOpenChange(v)
    },
    [onOpenChange],
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg w-[95vw] bg-card border-none flex flex-col p-0 overflow-hidden shadow-2xl rounded-3xl max-h-[85vh]">
        <DialogHeader className="px-6 py-5 border-b border-border bg-card shrink-0">
          <DialogTitle className="text-xl font-black flex items-center gap-3 text-foreground">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <SplitSquareHorizontal className="h-5 w-5 text-primary" />
            </div>
            Separar Cuenta
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 font-medium">
            {nombreMesa} &middot; Selecciona los items para la nueva cuenta
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-3">
            {items.map(item => {
              const uid = item.uid || item.id
              const qty = cantidades[uid] || 0
              const enviada = item.cantidadEnviada || 0

              return (
                <div
                  key={uid}
                  className={cn(
                    'p-4 rounded-xl border transition-all',
                    qty > 0
                      ? 'bg-primary/5 border-primary/30'
                      : 'bg-card border-border',
                  )}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                      <DynamicIcon name={item.emoji} className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm leading-tight truncate">
                        {item.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {item.quantity} disponible{item.quantity !== 1 && 's'} &middot;{' '}
                          {formatCurrency(item.price)} c/u
                        </span>
                        {enviada > 0 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] h-4 bg-orange-500/10 text-orange-600 border-orange-500/20 px-1.5 font-bold"
                          >
                            <ChefHat className="h-2.5 w-2.5 mr-0.5" />
                            {enviada === item.quantity
                              ? 'En cocina'
                              : `${enviada} en cocina`}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <span className="font-bold text-foreground text-sm shrink-0">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">
                      Mover a nueva cuenta:
                    </span>
                    <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 border border-border">
                      <button
                        onClick={() => setQty(uid, Math.max(0, qty - 1))}
                        disabled={qty === 0}
                        className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-background text-foreground shadow-sm transition-all active:scale-90 disabled:opacity-30"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span
                        className={cn(
                          'w-8 text-center font-bold text-lg',
                          qty > 0 ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {qty}
                      </span>
                      <button
                        onClick={() => setQty(uid, Math.min(item.quantity, qty + 1))}
                        disabled={qty >= item.quantity}
                        className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-background text-foreground shadow-sm transition-all active:scale-90 disabled:opacity-30"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20 shrink-0">
          <div className="w-full space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {totalItemsSeleccionados} item{totalItemsSeleccionados !== 1 && 's'} seleccionado{totalItemsSeleccionados !== 1 && 's'}
              </span>
              <span className="font-bold text-foreground">
                {formatCurrency(subtotalNuevaCuenta)}
              </span>
            </div>
            {totalItemsSeleccionados > 0 && itemsRestantes === 0 && (
              <p className="text-xs text-destructive font-medium">
                El pedido origen debe conservar al menos un item.
              </p>
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
                {submitting ? 'Creando...' : 'Crear nueva cuenta'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
