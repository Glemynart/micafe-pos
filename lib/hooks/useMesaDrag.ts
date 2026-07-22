'use client'

import { useCallback, useRef } from 'react'
import type { Viewport } from './useSalonViewport'

interface DragOptions {
  viewport: Viewport
  worldWidth: number
  worldHeight: number
  isAdmin: boolean
  editMode: boolean
  onCommit: (mesaId: string, posX: number, posY: number) => void
  // IMP-2: shared across useMesaDrag and useMesaTransform to enforce global single-pointer policy.
  sharedActivePointer: React.MutableRefObject<number | null>
}

interface DragState {
  mesaId: string
  pointerId: number
  startPointerX: number
  startPointerY: number
  startWorldX: number
  startWorldY: number
  mesaWidth: number
  mesaHeight: number
  // FASE-14 PR3 CRIT-1: saved before lift so it can be restored on pointerup/cancel.
  preGestureZIndex: string
  el: HTMLElement
}

function cleanupDragElement(el: HTMLElement, preGestureZIndex: string) {
  el.style.cursor = ''
  // FASE-14 PR3 CRIT-1 fix: restore exact pre-gesture zIndex, not ''.
  // Setting '' would leave React's prop-managed value out of sync when the
  // prop value hasn't changed, causing a permanent loss of the CSS z-index.
  el.style.zIndex = preGestureZIndex
  delete el.dataset.pendingX
  delete el.dataset.pendingY
}

export function useMesaDrag(options: DragOptions) {
  const optsRef = useRef(options)
  optsRef.current = options

  const dragRef = useRef<DragState | null>(null)

  // IMP-2: dims por-mesa recibidas en el pointerdown (no constantes globales).
  const onMesaPointerDown = useCallback((
    e: React.PointerEvent<HTMLElement>,
    mesaId: string,
    currentX: number,
    currentY: number,
    mesaWidth: number,
    mesaHeight: number,
  ) => {
    const { isAdmin, editMode, sharedActivePointer } = optsRef.current
    if (!isAdmin || !editMode) return
    // IMP-2 global: reject if any gesture is active across either hook.
    if (sharedActivePointer.current !== null) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    sharedActivePointer.current = e.pointerId

    // FASE-14 PR3 CRIT-1: save the React-managed zIndex before imperatively lifting.
    const preGestureZIndex = e.currentTarget.style.zIndex

    dragRef.current = {
      mesaId,
      pointerId: e.pointerId,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startWorldX: currentX,
      startWorldY: currentY,
      mesaWidth,
      mesaHeight,
      preGestureZIndex,
      el: e.currentTarget,
    }

    e.currentTarget.style.cursor = 'grabbing'
    e.currentTarget.style.zIndex = '9999'
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return
    // IMP-2: solo el puntero capturado procesa move.
    if (e.pointerId !== drag.pointerId) return

    const { viewport, worldWidth, worldHeight } = optsRef.current
    const { mesaWidth, mesaHeight } = drag
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

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return
    // IMP-2: solo el puntero capturado cierra el gesto.
    if (e.pointerId !== drag.pointerId) return

    const el = drag.el
    const pendingX = parseFloat(el.dataset.pendingX ?? '')
    const pendingY = parseFloat(el.dataset.pendingY ?? '')

    cleanupDragElement(el, drag.preGestureZIndex)
    dragRef.current = null
    optsRef.current.sharedActivePointer.current = null

    if (!isNaN(pendingX) && !isNaN(pendingY)) {
      optsRef.current.onCommit(drag.mesaId, pendingX, pendingY)
    }
  }, [])

  // I2: limpieza completa en cancelación del puntero.
  // Restaura la mesa a su posición pre-drag sin llamar onCommit.
  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag) return
    // IMP-2: solo el puntero capturado cancela.
    if (e.pointerId !== drag.pointerId) return

    const el = drag.el
    cleanupDragElement(el, drag.preGestureZIndex)

    const { viewport, sharedActivePointer } = optsRef.current
    const { mesaWidth, mesaHeight } = drag
    const screenX = drag.startWorldX * viewport.zoom + viewport.panX - (mesaWidth * viewport.zoom) / 2
    const screenY = drag.startWorldY * viewport.zoom + viewport.panY - (mesaHeight * viewport.zoom) / 2
    el.style.transform = `translate(${screenX}px, ${screenY}px)`

    dragRef.current = null
    sharedActivePointer.current = null
  }, [])

  return { onMesaPointerDown, onPointerMove, onPointerUp, onPointerCancel }
}
