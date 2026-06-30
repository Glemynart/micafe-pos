'use client'

import { ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** Hay más páginas hacia adelante (según el contrato de PR1, §8/K10). */
  hayMas: boolean
  /** El hook consumidor rastrea si hay páginas anteriores (cursor stack). */
  hasPrev: boolean
  /** Orden de la página actual sobre secuenciaArticulo (§8). */
  orden: 'asc' | 'desc'
  onSiguiente: () => void
  onAnterior: () => void
  onCambiarOrden: (orden: 'asc' | 'desc') => void
  /** Número de página 1-indexado para el indicador visual. */
  numeroPagina?: number
  disabled?: boolean
  className?: string
}

// ── Componente ───────────────────────────────────────────────────────────────

export function KardexPaginacion({
  hayMas,
  hasPrev,
  orden,
  onSiguiente,
  onAnterior,
  onCambiarOrden,
  numeroPagina,
  disabled,
  className,
}: Props) {
  return (
    <div className={cn('flex items-center justify-between gap-3 flex-wrap', className)}>
      {/* Selector de orden */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <Select
          value={orden}
          onValueChange={(v) => onCambiarOrden(v as 'asc' | 'desc')}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 w-44 text-xs bg-background border-border/50 focus:ring-primary/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Más reciente primero</SelectItem>
            <SelectItem value="asc">Más antiguo primero</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Navegación por cursor */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs border-border/50 disabled:opacity-40"
          onClick={onAnterior}
          disabled={disabled || !hasPrev}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Anterior
        </Button>
        {numeroPagina != null && (
          <span
            className="min-w-[4.5rem] text-center text-xs tabular-nums text-muted-foreground"
            aria-label={`Página ${numeroPagina}`}
            aria-current="page"
          >
            Pág. {numeroPagina}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs border-border/50 disabled:opacity-40"
          onClick={onSiguiente}
          disabled={disabled || !hayMas}
          aria-label="Página siguiente"
        >
          Siguiente
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
