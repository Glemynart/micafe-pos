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
 const [cargandoPagina, setCargandoPagina] = useState(false)
 const [errorPagina, setErrorPagina] = useState<string | null>(null)
 const [cargandoDiagnostico, setCargandoDiagnostico] = useState(false)
 const [errorDiagnostico, setErrorDiagnostico] = useState<string | null>(null)
 const [contadorRecarga, setContadorRecarga] = useState(0)

 const cursorActual: CursorKardex | null = cursorStack[cursorStack.length - 1] ?? null
 const hasPrev = cursorStack.length > 1
 const numeroPagina = cursorStack.length
 // Interfaz pública sin cambios: combina los dos estados internos.
 const cargando = cargandoPagina || cargandoDiagnostico
 const error = errorPagina ?? errorDiagnostico

 // Limpiar estado al cambiar de artículo para no mostrar datos del anterior.
 useEffect(() => {
  setPagina(null)
  setDiagnostico(null)
  setErrorPagina(null)
  setErrorDiagnostico(null)
  setCursorStack([null])
 }, [articuloTipo, articuloId])

 // Diagnóstico: solo al cambiar artículo o recargar.
 // obtenerEstadoKardex → diagnosticarArticulo lee TODOS los movimientos sin limit (§6);
 // no debe re-ejecutarse por cambios de cursor/orden/filtros.
 useEffect(() => {
  if (!articuloTipo || !articuloId) {
   setCargandoDiagnostico(false)
   return
  }

  let cancelado = false
  setCargandoDiagnostico(true)
  setErrorDiagnostico(null)

  ;(async () => {
   try {
    const nuevoDiagnostico = await obtenerEstadoKardex(articuloTipo, articuloId)
    if (!cancelado) setDiagnostico(nuevoDiagnostico)
   } catch (err) {
    if (!cancelado) {
     setErrorDiagnostico(err instanceof Error ? err.message : 'Error al cargar diagnóstico')
     setDiagnostico(null)
    }
   } finally {
    if (!cancelado) setCargandoDiagnostico(false)
   }
  })()

  return () => { cancelado = true }
 }, [articuloTipo, articuloId, contadorRecarga])

 // Página: re-ejecuta al cambiar artículo, cursor, orden, filtros o recargar.
 useEffect(() => {
  if (!articuloTipo || !articuloId) {
   setCargandoPagina(false)
   return
  }

  let cancelado = false
  setCargandoPagina(true)
  setErrorPagina(null)

  ;(async () => {
   try {
    const nuevaPagina = await consultarKardexArticulo(articuloTipo, articuloId, {
     cursor: cursorActual,
     orden,
     filtros,
    })
    if (!cancelado) setPagina(nuevaPagina)
   } catch (err) {
    if (!cancelado) {
     setErrorPagina(err instanceof Error ? err.message : 'Error al cargar movimientos')
     setPagina(null)
    }
   } finally {
    if (!cancelado) setCargandoPagina(false)
   }
  })()

  return () => { cancelado = true }
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
