'use client'

import { AlertTriangle, Package, Beaker } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { KardexEstadoBadge } from '@/components/pos/kardex-estado-badge'
import type { KardexArticulo } from '@/lib/inventario-kardex'
import type { DiagnosticoArticulo } from '@/lib/inventario-ledger'

// ── Helpers locales ──────────────────────────────────────────────────────────

function formatearCantidad(n: number): string {
  return n.toLocaleString('es-CO', { maximumFractionDigits: 4 })
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  articulo: KardexArticulo
  diagnostico: DiagnosticoArticulo
  /**
   * Nombre a mostrar cuando articuloNombre es null (caso no_migrado, §11).
   * La capa de presentación resuelve este nombre desde el catálogo vivo.
   */
  nombreFallback?: string
  className?: string
}

// ── Subcomponentes privados ──────────────────────────────────────────────────

function ArticuloTipoBadge({ tipo }: { tipo: KardexArticulo['articuloTipo'] }) {
  return (
    <Badge variant="outline" className="gap-1 text-xs text-muted-foreground border-border/50">
      {tipo === 'producto'
        ? <Package className="h-3 w-3" />
        : <Beaker className="h-3 w-3" />}
      {tipo === 'producto' ? 'Producto' : 'Insumo'}
    </Badge>
  )
}

// Detalle de corrupción (§12): huecos, movimientos inválidos y motivo.
function DetalleCorrupcion({ diagnostico }: { diagnostico: DiagnosticoArticulo }) {
  const { huecos, movimientosInvalidos, motivoCorrupcion } = diagnostico
  const tieneHuecos = huecos.length > 0
  const tieneInvalidos = movimientosInvalidos.length > 0

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs space-y-1.5">
      <div className="flex items-center gap-1.5 font-semibold text-destructive">
        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
        Serie corrupta — los saldos pueden no cuadrar
      </div>
      {motivoCorrupcion && (
        <p className="text-destructive/80">{motivoCorrupcion}</p>
      )}
      {tieneHuecos && (
        <p className="text-destructive/80">
          Huecos en secuencia:{' '}
          <span className="font-mono">[{huecos.join(', ')}]</span>
        </p>
      )}
      {tieneInvalidos && (
        <p className="text-destructive/80">
          Movimientos inválidos:{' '}
          {movimientosInvalidos.map((m) => (
            <span key={m.movimientoId} className="font-mono mr-1">
              #{m.secuenciaArticulo} ({m.razon})
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

// Nota de divergencia (§12): el cache difiere del ledger, pero la serie es confiable.
function NotaDivergencia({ diagnostico }: { diagnostico: DiagnosticoArticulo }) {
  const { stockCache, stockLedger } = diagnostico
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning/80">
      <span className="font-semibold">Nota:</span> el caché del artículo (
      <span className="font-mono">{formatearCantidad(stockCache)}</span>) difiere del
      saldo Ledger (
      <span className="font-mono">{stockLedger != null ? formatearCantidad(stockLedger) : '—'}</span>
      ). La serie de movimientos es confiable; solo el caché está desincronizado.
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

export function KardexEncabezado({ articulo, diagnostico, nombreFallback, className }: Props) {
  const nombre = articulo.articuloNombre ?? nombreFallback ?? '(artículo sin nombre)'
  const unidad = articulo.unidad ?? '—'
  const { estado, saldoActual, articuloTipo } = articulo
  const { stockCache, stockLedger } = diagnostico

  // Saldo a mostrar según el estado (§11, §12):
  // no_migrado → stockCache del diagnóstico (legacy, informativo).
  // demás     → saldoActual (Σ ledger, autoritativo por I4).
  const saldoDisplay =
    estado === 'no_migrado'
      ? `${formatearCantidad(stockCache)} ${unidad} (caché legacy)`
      : saldoActual != null
        ? `${formatearCantidad(saldoActual)} ${unidad}`
        : '—'

  const saldoLabelClass =
    estado === 'no_migrado'
      ? 'text-muted-foreground'
      : saldoActual != null && saldoActual < 0
        ? 'text-destructive'
        : 'text-foreground'

  return (
    <div className={cn('space-y-3', className)}>
      {/* Fila principal: nombre + badges */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-black tracking-tight text-foreground leading-tight">
            {nombre}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <ArticuloTipoBadge tipo={articuloTipo} />
            <KardexEstadoBadge estado={estado} />
            {estado === 'no_migrado' && (
              <span className="text-xs text-muted-foreground">
                Sin movimientos en el Ledger — la apertura se emite al primer movimiento real
              </span>
            )}
          </div>
        </div>

        {/* Saldo destacado */}
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-0.5">Saldo actual</p>
          <p className={cn('text-2xl font-black tabular-nums', saldoLabelClass)}>
            {saldoDisplay}
          </p>
          {/* Para divergente_reparable: mostrar también el stockCache para visibilidad */}
          {estado === 'divergente_reparable' && stockLedger != null && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Caché:{' '}
              <span className="font-mono text-warning">
                {formatearCantidad(stockCache)} {unidad}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Alertas de estado */}
      {estado === 'corrupto' && (
        <DetalleCorrupcion diagnostico={diagnostico} />
      )}
      {estado === 'divergente_reparable' && (
        <NotaDivergencia diagnostico={diagnostico} />
      )}

      <Separator className="bg-border/50" />
    </div>
  )
}
