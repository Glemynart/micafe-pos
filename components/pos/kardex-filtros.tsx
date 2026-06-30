'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { FiltrosKardex } from '@/lib/inventario-kardex'
import type {
  TipoMovimientoInventario,
  ClaseMovimiento,
} from '@/lib/inventario-ledger'

// ── Catálogo de tipos para el selector múltiple ──────────────────────────────
// Incluye solo los tipos activos (FASE-15). Los reservados aparecen si el
// Ledger los tiene; se renderizan igual (compatibilidad hacia adelante, §15).

const TODOS_LOS_TIPOS: Array<{ valor: TipoMovimientoInventario; etiqueta: string }> = [
  { valor: 'inventario_inicial',  etiqueta: 'Apertura' },
  { valor: 'compra',              etiqueta: 'Compra' },
  { valor: 'venta',               etiqueta: 'Venta' },
  { valor: 'consumo_receta',      etiqueta: 'Consumo (receta)' },
  { valor: 'ajuste_positivo',     etiqueta: 'Ajuste +' },
  { valor: 'ajuste_negativo',     etiqueta: 'Ajuste −' },
  { valor: 'merma',               etiqueta: 'Merma' },
  { valor: 'devolucion_compra',   etiqueta: 'Dev. compra' },
  { valor: 'devolucion_venta',    etiqueta: 'Dev. venta' },
  { valor: 'produccion_salida',   etiqueta: 'Producción ↓' },
  { valor: 'produccion_entrada',  etiqueta: 'Producción ↑' },
  { valor: 'traslado_salida',     etiqueta: 'Traslado ↓' },
  { valor: 'traslado_entrada',    etiqueta: 'Traslado ↑' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function fechaAInputValue(d: Date | undefined): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10) // "YYYY-MM-DD"
}

function inputValueAFecha(v: string): Date | undefined {
  if (!v) return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d
}

function esFiltrosVacios(f: FiltrosKardex): boolean {
  return (
    (!f.tipos || f.tipos.length === 0) &&
    !f.clase &&
    !f.desdeFecha &&
    !f.hastaFecha &&
    f.desdeSecuencia == null &&
    f.hastaSecuencia == null
  )
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  /** Estado controlado de filtros — viene del padre (no hay estado interno). */
  valor: FiltrosKardex
  onChange: (filtros: FiltrosKardex) => void
  disabled?: boolean
  className?: string
}

// ── Componente ───────────────────────────────────────────────────────────────

export function KardexFiltros({ valor, onChange, disabled, className }: Props) {
  const tiposActivos = valor.tipos ?? []

  // ── Handlers controlados ───────────────────────────────────────────────────

  function handleClase(v: string) {
    onChange({
      ...valor,
      clase: v === '__todas__' ? undefined : (v as ClaseMovimiento),
    })
  }

  function toggleTipo(tipo: TipoMovimientoInventario) {
    const ya = tiposActivos.includes(tipo)
    onChange({
      ...valor,
      tipos: ya
        ? tiposActivos.filter((t) => t !== tipo)
        : [...tiposActivos, tipo],
    })
  }

  function handleDesdeFecha(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({ ...valor, desdeFecha: inputValueAFecha(e.target.value) })
  }

  function handleHastaFecha(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({ ...valor, hastaFecha: inputValueAFecha(e.target.value) })
  }

  function handleDesdeSeq(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseInt(e.target.value, 10)
    onChange({ ...valor, desdeSecuencia: isNaN(n) ? undefined : n })
  }

  function handleHastaSeq(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseInt(e.target.value, 10)
    onChange({ ...valor, hastaSecuencia: isNaN(n) ? undefined : n })
  }

  function limpiarFiltros() {
    onChange({})
  }

  const hayFiltros = !esFiltrosVacios(valor)

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Filtros{' '}
          <span className="normal-case font-normal text-muted-foreground/70">
            — sobre la página actual, no la serie completa
          </span>
        </p>
        {hayFiltros && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
            onClick={limpiarFiltros}
            disabled={disabled}
            aria-label="Limpiar todos los filtros"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Fila 1: clase + selector de tipos */}
      <div className="flex flex-wrap gap-3">
        {/* Filtro por clase */}
        <div className="space-y-1 min-w-[140px]">
          <Label className="text-xs text-muted-foreground">Clase</Label>
          <Select
            value={valor.clase ?? '__todas__'}
            onValueChange={handleClase}
            disabled={disabled}
          >
            <SelectTrigger className="h-8 text-xs bg-background border-border/50 focus:ring-primary/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todas__">Todas</SelectItem>
              <SelectItem value="entrada">Entradas</SelectItem>
              <SelectItem value="salida">Salidas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filtro por tipo (multi-checkboxes en fila) */}
        <div className="flex-1 space-y-1 min-w-[280px]">
          <Label className="text-xs text-muted-foreground">
            Tipo de movimiento{tiposActivos.length > 0 && ` (${tiposActivos.length} activos)`}
          </Label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo de movimiento">
            {TODOS_LOS_TIPOS.map(({ valor: tipo, etiqueta }) => {
              const activo = tiposActivos.includes(tipo)
              return (
                <button
                  key={tipo}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleTipo(tipo)}
                  aria-pressed={activo}
                  aria-label={`${etiqueta}${activo ? ', activo' : ''}`}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                    activo
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background text-muted-foreground border-border/50 hover:border-primary/50 hover:text-foreground',
                    disabled && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {etiqueta}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <Separator className="bg-border/30" />

      {/* Fila 2: rangos de fecha y secuencia */}
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1 w-36">
          <Label className="text-xs text-muted-foreground">Desde fecha</Label>
          <Input
            type="date"
            className="h-8 text-xs bg-background border-border/50 focus:ring-primary/50"
            value={fechaAInputValue(valor.desdeFecha)}
            onChange={handleDesdeFecha}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1 w-36">
          <Label className="text-xs text-muted-foreground">Hasta fecha</Label>
          <Input
            type="date"
            className="h-8 text-xs bg-background border-border/50 focus:ring-primary/50"
            value={fechaAInputValue(valor.hastaFecha)}
            onChange={handleHastaFecha}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1 w-32">
          <Label className="text-xs text-muted-foreground">Desde secuencia</Label>
          <Input
            type="number"
            min={1}
            className="h-8 text-xs bg-background border-border/50 focus:ring-primary/50"
            value={valor.desdeSecuencia ?? ''}
            onChange={handleDesdeSeq}
            placeholder="1"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1 w-32">
          <Label className="text-xs text-muted-foreground">Hasta secuencia</Label>
          <Input
            type="number"
            min={1}
            className="h-8 text-xs bg-background border-border/50 focus:ring-primary/50"
            value={valor.hastaSecuencia ?? ''}
            onChange={handleHastaSeq}
            placeholder="∞"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  )
}
