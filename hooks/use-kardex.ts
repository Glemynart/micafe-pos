'use client'

import { useState, useEffect } from 'react'
import {
 consultarKardexArticulo,
 obtenerEstadoKardex,
 type PaginaKardex,
 type FiltrosKardex,
 type CursorKardex,
} from '@/lib/inventario-kardex'
import { type ArticuloTipo, type DiagnosticoArticulo } from '@/lib/inventario-ledger'

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface ArticuloKardex {
 tipo: ArticuloTipo
 id: string
 /** Nombre del catálogo vivo — fallback para el caso no_migrado (§11). */
 nombre: string
}

export interface UseKardexReturn {
 pagina: PaginaKardex | null
 diagnostico: DiagnosticoArticulo | null
 filtros: FiltrosKardex
 setFiltros: (filtros: FiltrosKardex) => void
 orden: 'asc' | 'desc'
 cambiarOrden: (orden: 'asc' | 'desc') => void
 hasPrev: boolean
 irSiguiente: () => void
 irAnterior: () => void
 cargando: boolean
 error: string | null
 /** Número de página 1-indexado (1 = primera página). */
 numeroPagina: number
 /** Re-ejecuta la carga con los mismos parámetros (útil para Reintentar tras error). */
 recargar: () => void
}

// ── Hook ──────────────────────────────────────────────────────────────────────
//
// Toda la lógica de carga, paginación y estado del Kardex vive aquí.
// Los componentes de presentación son puramente controlados.

export function useKardex(articulo: ArticuloKardex | null): UseKardexReturn {
 const articuloTipo = articulo?.tipo
 const articuloId = articulo?.id

 const [pagina, setPagina] = useState<PaginaKardex | null>(null)
 const [diagnostico, setDiagnostico] = useState<DiagnosticoArticulo | null>(null)
 const [filtros, setFiltros] = useState<FiltrosKardex>({})
 const [orden, setOrden] = useState<'asc' | 'desc'>('desc')
 // Stack de cursores: [null] = página 1, [null, c1] = página 2, etc.
 // El cursor activo es el último elemento; null implica sin startAfter.
 const [cursorStack, setCursorStack] = useState<(CursorKardex | null)[]>([null])
 const [cargando, setCargando] = useState(false)
 const [error, setError] = useState<string | null>(null)
 const [contadorRecarga, setContadorRecarga] = useState(0)

 const cursorActual: CursorKardex | null = cursorStack[cursorStack.length - 1] ?? null
 const hasPrev = cursorStack.length > 1
 const numeroPagina = cursorStack.length

 // Limpiar estado al cambiar de artículo para no mostrar datos del anterior.
 useEffect(() => {
  setPagina(null)
  setDiagnostico(null)
  setError(null)
  setCursorStack([null])
 }, [articuloTipo, articuloId])

 // Carga principal: re-ejecuta al cambiar artículo, página, orden o filtros.
 useEffect(() => {
  if (!articuloTipo || !articuloId) {
   setCargando(false)
   return
  }

  let cancelado = false
  setCargando(true)
  setError(null)

  ;(async () => {
   try {
    const [nuevaPagina, nuevoDiagnostico] = await Promise.all([
     consultarKardexArticulo(articuloTipo, articuloId, {
      cursor: cursorActual,
      orden,
      filtros,
     }),
     obtenerEstadoKardex(articuloTipo, articuloId),
    ])
    if (!cancelado) {
     setPagina(nuevaPagina)
     setDiagnostico(nuevoDiagnostico)
    }
   } catch (err) {
    if (!cancelado) {
     setError(err instanceof Error ? err.message : 'Error al cargar movimientos')
     setPagina(null)
     setDiagnostico(null)
    }
   } finally {
    if (!cancelado) setCargando(false)
   }
  })()

  return () => {
   cancelado = true
  }
 }, [articuloTipo, articuloId, cursorActual, orden, filtros, contadorRecarga])

 // ── Acciones de paginación ────────────────────────────────────────────────

 function irSiguiente() {
  if (!pagina?.cursorSiguiente) return
  setCursorStack((prev) => [...prev, pagina.cursorSiguiente!])
 }

 function irAnterior() {
  if (cursorStack.length <= 1) return
  setCursorStack((prev) => prev.slice(0, -1))
 }

 function cambiarOrden(nuevoOrden: 'asc' | 'desc') {
  setOrden(nuevoOrden)
  setCursorStack([null])
 }

 function recargar() {
  setContadorRecarga((n) => n + 1)
 }

 return {
  pagina,
  diagnostico,
  filtros,
  setFiltros,
  orden,
  cambiarOrden,
  hasPrev,
  irSiguiente,
  irAnterior,
  cargando,
  error,
  numeroPagina,
  recargar,
 }
}
