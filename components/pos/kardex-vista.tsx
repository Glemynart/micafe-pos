'use client'

import { Separator } from '@/components/ui/separator'
import { KardexEncabezado } from '@/components/pos/kardex-encabezado'
import { KardexTabla } from '@/components/pos/kardex-tabla'
import { KardexFiltros } from '@/components/pos/kardex-filtros'
import { KardexPaginacion } from '@/components/pos/kardex-paginacion'
import type { PaginaKardex, FiltrosKardex } from '@/lib/inventario-kardex'

// Determina si hay al menos un filtro activo (misma lógica que KardexFiltros).
function hayFiltros(f: FiltrosKardex): boolean {
  return (
    (f.tipos != null && f.tipos.length > 0) ||
    f.clase != null ||
    f.desdeFecha != null ||
    f.hastaFecha != null ||
    f.desdeSecuencia != null ||
    f.hastaSecuencia != null
  )
}
import type { DiagnosticoArticulo } from '@/lib/inventario-ledger'

// ── Props ────────────────────────────────────────────────────────────────────
//
// Todos los datos y callbacks vienen de fuera (sin estado interno, sin Firestore).
// El hook consumidor (paso 2) proveerá el estado y los callbacks reales.

export interface KardexVistaProps {
  /** Página actual del kardex, tal como la devuelve consultarKardexArticulo. */
  pagina: PaginaKardex
  /**
   * Diagnóstico del artículo, tal como lo devuelve obtenerEstadoKardex.
   * Se necesita separado de pagina porque contiene huecos/movimientosInvalidos/stockCache
   * para la señalización de estado (K5, §11, §12) que va más allá de KardexArticulo.
   */
  diagnostico: DiagnosticoArticulo
  /** Filtros activos (controlados externamente). */
  filtros: FiltrosKardex
  onFiltrosChange: (filtros: FiltrosKardex) => void
  /** Orden activo sobre secuenciaArticulo. */
  orden: 'asc' | 'desc'
  onCambiarOrden: (orden: 'asc' | 'desc') => void
  /** El hook rastrea si hay páginas anteriores (cursor stack externo a esta vista). */
  hasPrev: boolean
  onSiguiente: () => void
  onAnterior: () => void
  /**
   * Nombre del artículo desde el catálogo vivo, para el caso no_migrado donde
   * articuloNombre === null y el Principio 5 prohíbe leerlo desde el contrato (§11).
   */
  nombreFallback?: string
  /**
   * true mientras se espera la respuesta de Firestore.
   * La tabla muestra un spinner y los controles se deshabilitan.
   */
  cargando?: boolean
  /** Número de página 1-indexado para el indicador de paginación. */
  numeroPagina?: number
}

// ── Componente ───────────────────────────────────────────────────────────────
//
// Es el contenido de la vista embebida (paso 2 la envolverá en un Sheet).
// No asume nada sobre su contenedor: puede renderizarse dentro de un Sheet,
// un Dialog, un panel fijo o directamente en una página.

export function KardexVista({
  pagina,
  diagnostico,
  filtros,
  onFiltrosChange,
  orden,
  onCambiarOrden,
  hasPrev,
  onSiguiente,
  onAnterior,
  nombreFallback,
  cargando = false,
  numeroPagina,
}: KardexVistaProps) {
  const { articulo, hayMas } = pagina
  const hayFiltrosActivos = hayFiltros(filtros)

  return (
    <div className="flex flex-col gap-4 p-4 h-full min-h-0">
      {/* ── Encabezado del artículo: nombre, tipo, estado, saldo (K5) ── */}
      <KardexEncabezado
        articulo={articulo}
        diagnostico={diagnostico}
        nombreFallback={nombreFallback}
      />

      {/* ── Filtros (cuatro de PR2, D-UI-2) ── */}
      <KardexFiltros
        valor={filtros}
        onChange={onFiltrosChange}
        disabled={cargando}
      />

      <Separator className="bg-border/30" />

      {/* ── Tabla de movimientos ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <KardexTabla
          lineas={articulo.lineas}
          unidad={articulo.unidad}
          hayFiltrosActivos={hayFiltrosActivos}
          cargando={cargando}
          className="h-full"
        />
      </div>

      <Separator className="bg-border/30" />

      {/* ── Paginación ── */}
      <KardexPaginacion
        hayMas={hayMas}
        hasPrev={hasPrev}
        orden={orden}
        onSiguiente={onSiguiente}
        onAnterior={onAnterior}
        onCambiarOrden={onCambiarOrden}
        numeroPagina={numeroPagina}
        disabled={cargando}
      />
    </div>
  )
}
