'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { EstadoReconciliacion } from '@/lib/inventario-ledger'

// ── Mapa de presentación de los cuatro estados de reconciliación (K5, §11, §12) ──

const CONFIG: Record<
  EstadoReconciliacion,
  { label: string; className: string }
> = {
  consistente: {
    label: 'Consistente',
    className: 'bg-success/15 text-success border-success/30',
  },
  divergente_reparable: {
    label: 'Caché diverge',
    className: 'bg-warning/15 text-warning border-warning/30',
  },
  corrupto: {
    label: 'Corrupto',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
  },
  no_migrado: {
    label: 'Sin migrar',
    className: 'bg-muted text-muted-foreground border-border',
  },
}

interface Props {
  estado: EstadoReconciliacion
  className?: string
}

export function KardexEstadoBadge({ estado, className }: Props) {
  const { label, className: colorClass } = CONFIG[estado]
  return (
    <Badge
      variant="outline"
      className={cn('font-semibold text-xs', colorClass, className)}
    >
      {label}
    </Badge>
  )
}
