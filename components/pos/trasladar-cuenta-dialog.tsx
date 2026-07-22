'use client'

import { useState, useMemo, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowRightLeft, Armchair } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Mesa } from '@/lib/mesas-service'

interface TrasladarCuentaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mesas: Mesa[]
  mesaOrigenId: string
  nombreMesaOrigen: string
  onConfirm: (mesaDestinoId: string) => Promise<void>
}

export function TrasladarCuentaDialog({
  open,
  onOpenChange,
  mesas,
  mesaOrigenId,
  nombreMesaOrigen,
  onConfirm,
}: TrasladarCuentaDialogProps) {
  const [destinoId, setDestinoId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const mesasDestino = useMemo(
    () => mesas.filter(m => m.id !== mesaOrigenId && m.activa),
    [mesas, mesaOrigenId],
  )

  const canConfirm = destinoId !== null

  const handleConfirm = useCallback(async () => {
    if (!destinoId) return
    setSubmitting(true)
    try {
      await onConfirm(destinoId)
      setDestinoId(null)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }, [destinoId, onConfirm, onOpenChange])

  const handleOpenChange = useCallback((v: boolean) => {
    if (!v) setDestinoId(null)
    onOpenChange(v)
  }, [onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg w-[95vw] bg-card border-none flex flex-col p-0 overflow-hidden shadow-2xl rounded-3xl max-h-[85vh]">
        <DialogHeader className="px-6 py-5 border-b border-border bg-card shrink-0">
          <DialogTitle className="text-xl font-black flex items-center gap-3 text-foreground">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ArrowRightLeft className="h-5 w-5 text-primary" />
            </div>
            Trasladar Cuenta
          </DialogTitle>
          <DialogDescription className="text-muted-foreground mt-1 font-medium">
            {nombreMesaOrigen} &middot; Selecciona la mesa destino
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4">
            {mesasDestino.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                <Armchair className="h-10 w-10 opacity-30" />
                <p className="text-sm">No hay otras mesas disponibles.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {mesasDestino.map(mesa => {
                  const selected = destinoId === mesa.id
                  return (
                    <button
                      key={mesa.id}
                      onClick={() => setDestinoId(mesa.id)}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all active:scale-[0.98]',
                        'focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30',
                        selected
                          ? 'bg-primary/10 border-primary ring-2 ring-primary/20'
                          : 'bg-card border-border hover:border-primary/50 hover:bg-muted',
                      )}
                    >
                      <div className={cn(
                        'w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-inner',
                        selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}>
                        {mesa.nombre.charAt(0)}
                      </div>
                      <p className="font-bold text-sm text-foreground truncate max-w-full">{mesa.nombre}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/20 shrink-0">
          <div className="flex gap-3 w-full">
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
              {submitting ? 'Trasladando...' : 'Trasladar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
