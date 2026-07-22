'use client'

import { useCallback, useRef } from 'react'
import {
  actualizarPosicionMesa,
  actualizarTransformMesa,
  actualizarZIndexMesa,
  actualizarSectorMesa,
  type MesaTransformPatch,
} from '@/lib/mesas-service'

export interface LayoutCommit {
  commitMesaPosition: (mesaId: string, posX: number, posY: number) => void
  commitMesaTransform: (mesaId: string, patch: MesaTransformPatch) => void
  // FASE-14 PR3: IMP-1 — tercer namespace de timers, completamente separado.
  commitMesaZIndex: (mesaId: string, zIndex: number) => void
  // I-12: sin debounce — acción discreta, no gesto continuo.
  commitMesaSector: (mesaId: string, sectorId: string | null) => void
}

/**
 * Gestiona el commit de layout de mesas a Firestore.
 * IMP-1 (PR2): timersPosition / timersTransform completamente separados.
 * IMP-1 (PR3): timersZ también completamente separado de los dos anteriores.
 * Ningún commit cancela timer de otra naturaleza.
 */
export function useSalonLayout(isAdmin: boolean): LayoutCommit {
  // Tres namespaces de timers: nunca comparten claves entre sí.
  const timersPosition  = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const timersTransform = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const timersZ         = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const commitMesaPosition = useCallback((mesaId: string, posX: number, posY: number) => {
    if (!isAdmin) return
    if (timersPosition.current[mesaId]) clearTimeout(timersPosition.current[mesaId])
    timersPosition.current[mesaId] = setTimeout(() => {
      actualizarPosicionMesa(mesaId, posX, posY).catch(console.error)
      delete timersPosition.current[mesaId]
    }, 150)
  }, [isAdmin])

  const commitMesaTransform = useCallback((mesaId: string, patch: MesaTransformPatch) => {
    if (!isAdmin) return
    const key = `${mesaId}-${'width' in patch ? 'size' : 'rot'}`
    if (timersTransform.current[key]) clearTimeout(timersTransform.current[key])
    timersTransform.current[key] = setTimeout(() => {
      actualizarTransformMesa(mesaId, patch).catch(console.error)
      delete timersTransform.current[key]
    }, 150)
  }, [isAdmin])

  const commitMesaZIndex = useCallback((mesaId: string, zIndex: number) => {
    if (!isAdmin) return
    if (timersZ.current[mesaId]) clearTimeout(timersZ.current[mesaId])
    timersZ.current[mesaId] = setTimeout(() => {
      actualizarZIndexMesa(mesaId, zIndex).catch(console.error)
      delete timersZ.current[mesaId]
    }, 150)
  }, [isAdmin])

  const commitMesaSector = useCallback((mesaId: string, sectorId: string | null) => {
    if (!isAdmin) return
    actualizarSectorMesa(mesaId, sectorId).catch(console.error)
  }, [isAdmin])

  return { commitMesaPosition, commitMesaTransform, commitMesaZIndex, commitMesaSector }
}
