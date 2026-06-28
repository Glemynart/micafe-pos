'use client'

import { useCallback, useRef } from 'react'
import { actualizarPosicionMesa, actualizarTransformMesa, type MesaTransformPatch } from '@/lib/mesas-service'

export interface LayoutCommit {
  commitMesaPosition: (mesaId: string, posX: number, posY: number) => void
  commitMesaTransform: (mesaId: string, patch: MesaTransformPatch) => void
}

/**
 * Gestiona el commit de layout de mesas a Firestore.
 * IMP-1 (PR2): dos mapas de timers completamente separados.
 * Un commit de transform jamás puede cancelar un commit de posición, y viceversa.
 */
export function useSalonLayout(isAdmin: boolean): LayoutCommit {
  // Namespace separado por tipo: nunca comparten la misma clave de timer.
  const timersPosition  = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const timersTransform = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

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
    // Separate debounce key per transform type so resize and rotation timers
    // never cancel each other. resize→resize and rotation→rotation still coalesce.
    const key = `${mesaId}-${'width' in patch ? 'size' : 'rot'}`
    if (timersTransform.current[key]) clearTimeout(timersTransform.current[key])
    timersTransform.current[key] = setTimeout(() => {
      actualizarTransformMesa(mesaId, patch).catch(console.error)
      delete timersTransform.current[key]
    }, 150)
  }, [isAdmin])

  return { commitMesaPosition, commitMesaTransform }
}
