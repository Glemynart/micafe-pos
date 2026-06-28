'use client'

import { useCallback, useRef } from 'react'
import { actualizarPosicionMesa } from '@/lib/mesas-service'

export interface LayoutCommit {
  commitMesaPosition: (mesaId: string, posX: number, posY: number) => void
}

/**
 * Gestiona el commit de posiciones de mesas a Firestore.
 * Debounce por mesa: si el usuario mueve rápido la misma mesa, se agrupa.
 */
export function useSalonLayout(isAdmin: boolean): LayoutCommit {
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const commitMesaPosition = useCallback((mesaId: string, posX: number, posY: number) => {
    if (!isAdmin) return
    if (timers.current[mesaId]) clearTimeout(timers.current[mesaId])
    timers.current[mesaId] = setTimeout(() => {
      actualizarPosicionMesa(mesaId, posX, posY).catch(console.error)
      delete timers.current[mesaId]
    }, 150)
  }, [isAdmin])

  return { commitMesaPosition }
}
