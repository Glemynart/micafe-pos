'use client'

import { ArrowUpCircle, ArrowDownCircle, SearchX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/format-utils'
import type { LineaKardex, KardexArticulo } from '@/lib/inventario-kardex'
import type { TipoMovimientoInventario } from '@/lib/inventario-ledger'

// ── Etiquetas legibles de los tipos de movimiento (catálogo §3 de FASE-15) ──

const ETIQUETA_TIPO: Record<TipoMovimientoInventario, string> = {
  inventario_inicial:  'Apertura',
  compra:              'Compra',
  venta:               'Venta',
  consumo_receta:      'Consumo (receta)',
  ajuste_positivo:     'Ajuste +',
  ajuste_negativo:     'Ajuste −',
  merma:               'Merma',
  devolucion_compra:   'Dev. compra',
  devolucion_venta:    'Dev. venta',
  produccion_salida:   'Producción ↓',
  produccion_entrada:  'Producción ↑',
  traslado_salida:     'Traslado ↓',
  traslado_entrada:    'Traslado ↑',
}

// ── Formateo de fecha desde Firestore Timestamp (unknown) ────────────────────
// El módulo POS siempre carga con ssr:false, por lo que el Timestamp cliente
// ya está disponible. La fecha es informativa (K3); no se usa como clave de orden.

function formatearFecha(fecha: unknown): string {
  if (fecha == null) return '—'
  if (
    typeof fecha === 'object' &&
    typeof (fecha as { toDate?: unknown }).toDate === 'function'
  ) {
    const d = (fecha as { toDate: () => Date }).toDate()
    return d.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  if (fecha instanceof Date) {
    return fecha.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  if (typeof fecha === 'number') {
    return new Date(fecha).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  return '—'
}

function formatearNumero(n: number, decimales = 2): string {
  return n.toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimales,
  })
}

// Trunca un id de referencia para caber en la celda.
function truncarId(id: string | null): string {
  if (!id) return '—'
  return id.length > 10 ? `${id.slice(0, 8)}…` : id
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  lineas: LineaKardex[]
  unidad: KardexArticulo['unidad']
  /** true cuando hay al menos un filtro activo — personaliza el mensaje de vacío. */
  hayFiltrosActivos?: boolean
  cargando?: boolean
  className?: string
}

// ── Componente ───────────────────────────────────────────────────────────────

export function KardexTabla({ lineas, unidad, hayFiltrosActivos, cargando, className }: Props) {
  const unidadLabel = unidad ?? '—'

  // Carga inicial: no hay datos previos que mostrar — spinner puro
  if (cargando && lineas.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center py-16 text-muted-foreground text-sm', className)}
        role="status"
        aria-label="Cargando movimientos"
      >
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin mr-3" aria-hidden="true" />
        Cargando movimientos…
      </div>
    )
  }

  // Vacío con filtros activos
  if (lineas.length === 0 && hayFiltrosActivos) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground', className)}>
        <SearchX className="h-8 w-8 opacity-40" aria-hidden="true" />
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">Sin resultados</p>
          <p className="text-xs max-w-xs">
            Ningún movimiento de esta página coincide con los filtros activos.
            Ajusta los filtros o navega a otra página.
          </p>
        </div>
      </div>
    )
  }

  // Vacío sin filtros activos
  if (lineas.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground', className)}>
        <p className="text-sm">No hay movimientos en esta página</p>
        <p className="text-xs">Navega a otras páginas para ver más movimientos.</p>
      </div>
    )
  }

  return (
    <div className={cn('relative flex flex-col', className)} aria-busy={cargando}>
      {/* Contador de líneas */}
      <p className="flex-shrink-0 px-1 pb-2 text-xs text-muted-foreground" aria-live="polite">
        {lineas.length} movimiento{lineas.length !== 1 ? 's' : ''} en esta página
      </p>

      {/* Overlay de carga para cambios de página / filtro / orden (datos previos visibles) */}
      {cargando && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/70"
          role="status"
          aria-label="Actualizando movimientos"
        >
          <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-hidden="true" />
        </div>
      )}

      <div className="flex-1 min-h-0">
        <ScrollArea className={cn('w-full h-full', cargando && 'pointer-events-none')}>
          {/* overflow-x: la tabla puede ser ancha; el ScrollArea la contiene */}
          <div className="min-w-[900px]">
            <Table aria-label="Movimientos del kardex">
          <TableHeader className="bg-secondary/20">
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-muted-foreground font-bold h-10 w-12 text-right">#</TableHead>
              <TableHead className="text-muted-foreground font-bold h-10 w-36">Fecha</TableHead>
              <TableHead className="text-muted-foreground font-bold h-10">Tipo</TableHead>
              <TableHead className="text-muted-foreground font-bold h-10 w-24 text-center">Clase</TableHead>
              <TableHead className="text-muted-foreground font-bold h-10 text-right">Cantidad</TableHead>
              <TableHead className="text-muted-foreground font-bold h-10 text-right">Costo U.</TableHead>
              <TableHead className="text-muted-foreground font-bold h-10 text-right">Costo T.</TableHead>
              <TableHead className="text-muted-foreground font-bold h-10 text-right">
                Saldo ({unidadLabel})
              </TableHead>
              <TableHead className="text-muted-foreground font-bold h-10">Referencia</TableHead>
              <TableHead className="text-muted-foreground font-bold h-10">Autor</TableHead>
              <TableHead className="text-muted-foreground font-bold h-10">Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.map((linea) => {
              const esEntrada = linea.clase === 'entrada'
              const saldoNegativo = linea.saldoCantidadDespues < 0
              return (
                <TableRow
                  key={linea.id}
                  className="border-border/50 hover:bg-secondary/30 transition-colors text-sm"
                >
                  {/* Secuencia */}
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {linea.secuenciaArticulo}
                  </TableCell>

                  {/* Fecha */}
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatearFecha(linea.fecha)}
                  </TableCell>

                  {/* Tipo */}
                  <TableCell className="font-medium text-foreground whitespace-nowrap">
                    {ETIQUETA_TIPO[linea.tipo] ?? linea.tipo}
                  </TableCell>

                  {/* Clase */}
                  <TableCell className="text-center">
                    {esEntrada ? (
                      <Badge className="bg-success/15 text-success border-success/30 gap-1 text-xs">
                        <ArrowUpCircle className="h-3 w-3" />
                        Entrada
                      </Badge>
                    ) : (
                      <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1 text-xs">
                        <ArrowDownCircle className="h-3 w-3" />
                        Salida
                      </Badge>
                    )}
                  </TableCell>

                  {/* Cantidad (con signo, sin recorte — K6) */}
                  <TableCell
                    className={cn(
                      'text-right font-mono font-bold tabular-nums',
                      esEntrada ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {linea.signo === 1 ? '+' : ''}
                    {formatearNumero(linea.cantidad, 4)}
                  </TableCell>

                  {/* Costo unitario — capturado en origen, no es modelo de costeo (K7) */}
                  <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                    {formatCurrency(linea.costoUnitario)}
                  </TableCell>

                  {/* Costo total */}
                  <TableCell className="text-right font-mono text-muted-foreground tabular-nums">
                    {formatCurrency(linea.costoTotal)}
                  </TableCell>

                  {/* Saldo corrido congelado (K2) — negativo si aplica (K6) */}
                  <TableCell
                    className={cn(
                      'text-right font-mono font-black tabular-nums',
                      saldoNegativo ? 'text-destructive' : 'text-foreground',
                    )}
                  >
                    {formatearNumero(linea.saldoCantidadDespues, 4)}
                  </TableCell>

                  {/* Referencia al documento de origen */}
                  <TableCell className="text-xs">
                    {linea.referenciaColeccion ? (
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground">{linea.referenciaColeccion}</p>
                        <p className="font-mono text-foreground/70">
                          {truncarId(linea.referenciaId)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>

                  {/* Autor (snapshot — K4) */}
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {linea.usuarioNombre}
                  </TableCell>

                  {/* Motivo */}
                  <TableCell className="text-xs text-muted-foreground max-w-32 truncate">
                    {linea.motivo ?? <span className="opacity-40">—</span>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </ScrollArea>
      </div>
    </div>
  )
}
