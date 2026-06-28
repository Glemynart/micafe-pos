'use client'

import { useCallback, useRef } from 'react'
import type { Viewport } from './useSalonViewport'

interface DragOptions {
  viewport: Viewport
  worldWidth: number
  worldHeight: number
  isAdmin: boolean
  editMode: boolean
  mesaWidth: number
  mesaHeight: number
  onCommit: (mesaId: string, posX: number, posY: number) => void
}

interface DragState {
  mesaId: string
  startPointerX: number
  startPointerY: number
  startWorldX: number
  startWorldY: number
  el: HTMLElement
}

function cleanupDragElement(el: HTMLElement) {
  el.style.cursor = ''
  el.style.zIndex = ''
  delete el.dataset.pendingX
  delete el.dataset.pendingY
}

export function useMesaDrag(options: DragOptions) {
  const optsRef = useRef(options)
  optsRef.current = options

  const dragRef = useRef<DragState | null>(null)

  const onMesaPointerDown = useCallback((e: React.PointerEvent<HTMLElement>, mesaId: string, currentX: number, currentY: number) => {
    const { isAdmin, editMode } = optsRef.current
    if (!isAdmin || !editMode) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)

    dragRef.current = {
      mesaId,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startWorldX: currentX,
      startWorldY: currentY,
      el: e.currentTarget,
    }

    e.currentTarget.style.cursor = 'grabbing'
    e.currentTarget.style.zIndex = '9999'
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return

    const { viewport, mesaWidth, mesaHeight, worldWidth, worldHeight } = optsRef.current
    const dx = (e.clientX - drag.startPointerX) / viewport.zoom
    const dy = (e.clientY - drag.startPointerY) / viewport.zoom

    const rawX = drag.startWorldX + dx
    const rawY = drag.startWorldY + dy
    const newX = Math.max(mesaWidth / 2, Math.min(worldWidth - mesaWidth / 2, rawX))
    const newY = Math.max(mesaHeight / 2, Math.min(worldHeight - mesaHeight / 2, rawY))

    const screenX = newX * viewport.zoom + viewport.panX - (mesaWidth * viewport.zoom) / 2
    const screenY = newY * viewport.zoom + viewport.panY - (mesaHeight * viewport.zoom) / 2
    drag.el.style.transform = `translate(${screenX}px, ${screenY}px)`
    drag.el.dataset.pendingX = String(newX)
    drag.el.dataset.pendingY = String(newY)
  }, [])

  const onPointerUp = useCallback((_e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return

    const el = drag.el
    const pendingX = parseFloat(el.dataset.pendingX ?? '')
    const pendingY = parseFloat(el.dataset.pendingY ?? '')

    cleanupDragElement(el)
    dragRef.current = null

    if (!isNaN(pendingX) && !isNaN(pendingY)) {
      optsRef.current.onCommit(drag.mesaId, pendingX, pendingY)
    }
  }, [])

  // I2: limpieza completa en cancelación del puntero (gesto táctil interrumpido, SO, etc.)
  // Restaura la mesa a su posición pre-drag sin llamar onCommit.
  const onPointerCancel = useCallback((_e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return

    const el = drag.el
    cleanupDragElement(el)

    // Restaurar transform a la posición de mundo original (antes del drag)
    const { viewport, mesaWidth, mesaHeight } = optsRef.current
    const screenX = drag.startWorldX * viewport.zoom + viewport.panX - (mesaWidth * viewport.zoom) / 2
    const screenY = drag.startWorldY * viewport.zoom + viewport.panY - (mesaHeight * viewport.zoom) / 2
    el.style.transform = `translate(${screenX}px, ${screenY}px)`

    dragRef.current = null
  }, [])

  return { onMesaPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}
