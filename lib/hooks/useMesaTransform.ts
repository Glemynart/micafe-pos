'use client'

import { useCallback, useRef } from 'react'
import type { Viewport } from './useSalonViewport'
import type { MesaTransformPatch } from '@/lib/mesas-service'

// Handle ids: 8 resize handles + 1 rotation handle.
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type TransformHandle = ResizeHandle | 'rotate'

const RESIZE_MIN = 60
const RESIZE_MAX = 600

interface TransformOptions {
  viewport: Viewport
  isAdmin: boolean
  editMode: boolean
  onCommit: (mesaId: string, patch: MesaTransformPatch) => void
  // IMP-2: shared across useMesaDrag and useMesaTransform to enforce global single-pointer policy.
  sharedActivePointer: React.MutableRefObject<number | null>
}

interface ResizeState {
  kind: 'resize'
  handle: ResizeHandle
  mesaId: string
  pointerId: number
  startClientX: number
  startClientY: number
  startWidth: number
  startHeight: number
  startRotation: number
  // FASE-14 PR3: lockAspect = square | circle.
  lockAspect: boolean
  // Screen-space center of the mesa at gesture start (for projection).
  centerScreenX: number
  centerScreenY: number
  // FASE-14 PR3 IMP-2: pre-gesture zIndex saved for lift restoration.
  preGestureZIndex: string
  // Outer element (data-mesa-id div).
  outerEl: HTMLElement
  // Inner element (rotator div).
  innerEl: HTMLElement
}

interface RotateState {
  kind: 'rotate'
  mesaId: string
  pointerId: number
  startRotation: number
  // Screen-space center of the mesa at gesture start.
  centerScreenX: number
  centerScreenY: number
  // Angle from center to the initial pointer position, used to compute delta.
  startAngle: number
  // FASE-14 PR3 IMP-2: pre-gesture zIndex saved for lift restoration.
  preGestureZIndex: string
  // Outer element — needed to restore the lift.
  outerEl: HTMLElement
  // Inner element (rotator div).
  innerEl: HTMLElement
}

type GestureState = ResizeState | RotateState

function degToRad(deg: number) { return deg * Math.PI / 180 }
function radToDeg(rad: number) { return rad * 180 / Math.PI }
function normalizeDeg(deg: number) { return ((deg % 360) + 360) % 360 }

// Returns the resize deltas in the mesa's local (rotated) space.
// clientDx/clientDy are in screen space; rotation is in degrees.
function projectDeltaToLocal(clientDx: number, clientDy: number, rotation: number) {
  const rad = degToRad(-rotation)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    localDx: clientDx * cos - clientDy * sin,
    localDy: clientDx * sin + clientDy * cos,
  }
}

// How much each handle axis contributes to width/height change.
// Symmetric resize from center: the delta is multiplied by 2 (both sides move).
const HANDLE_AXIS: Record<ResizeHandle, { sx: number; sy: number }> = {
  nw: { sx: -1, sy: -1 },
  n:  { sx:  0, sy: -1 },
  ne: { sx:  1, sy: -1 },
  e:  { sx:  1, sy:  0 },
  se: { sx:  1, sy:  1 },
  s:  { sx:  0, sy:  1 },
  sw: { sx: -1, sy:  1 },
  w:  { sx: -1, sy:  0 },
}

export function useMesaTransform(options: TransformOptions) {
  const optsRef = useRef(options)
  optsRef.current = options

  const gestureRef = useRef<GestureState | null>(null)

  // ── Resize ──────────────────────────────────────────────────────────────────

  const onResizePointerDown = useCallback((
    e: React.PointerEvent<HTMLElement>,
    handle: ResizeHandle,
    mesaId: string,
    currentWidth: number,
    currentHeight: number,
    currentRotation: number,
    lockAspect: boolean,
    outerEl: HTMLElement,
    innerEl: HTMLElement,
  ) => {
    const { isAdmin, editMode, sharedActivePointer } = optsRef.current
    if (!isAdmin || !editMode) return
    // IMP-2 global: reject if any gesture is active across either hook.
    if (sharedActivePointer.current !== null) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    sharedActivePointer.current = e.pointerId

    const outerRect = outerEl.getBoundingClientRect()

    // FASE-14 PR3: lift visual — save current zIndex and elevate imperatively.
    const preGestureZIndex = outerEl.style.zIndex
    outerEl.style.zIndex = '9999'

    gestureRef.current = {
      kind: 'resize',
      handle,
      mesaId,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWidth: currentWidth,
      startHeight: currentHeight,
      startRotation: currentRotation,
      lockAspect,
      centerScreenX: outerRect.left + outerRect.width / 2,
      centerScreenY: outerRect.top  + outerRect.height / 2,
      preGestureZIndex,
      outerEl,
      innerEl,
    }
  }, [])

  // ── Rotation ─────────────────────────────────────────────────────────────────

  const onRotatePointerDown = useCallback((
    e: React.PointerEvent<HTMLElement>,
    mesaId: string,
    currentRotation: number,
    outerEl: HTMLElement,
    innerEl: HTMLElement,
  ) => {
    const { isAdmin, editMode, sharedActivePointer } = optsRef.current
    if (!isAdmin || !editMode) return
    // IMP-2 global: reject if any gesture is active across either hook.
    if (sharedActivePointer.current !== null) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    sharedActivePointer.current = e.pointerId

    const outerRect = outerEl.getBoundingClientRect()
    const cx = outerRect.left + outerRect.width / 2
    const cy = outerRect.top  + outerRect.height / 2

    // FASE-14 PR3: lift visual — save current zIndex and elevate imperatively.
    const preGestureZIndex = outerEl.style.zIndex
    outerEl.style.zIndex = '9999'

    gestureRef.current = {
      kind: 'rotate',
      mesaId,
      pointerId: e.pointerId,
      startRotation: currentRotation,
      centerScreenX: cx,
      centerScreenY: cy,
      startAngle: radToDeg(Math.atan2(e.clientY - cy, e.clientX - cx)),
      preGestureZIndex,
      outerEl,
      innerEl,
    }
  }, [])

  // ── Shared move ──────────────────────────────────────────────────────────────

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const g = gestureRef.current
    if (!g) return
    // IMP-2: only the captured pointer drives the gesture.
    if (e.pointerId !== g.pointerId) return

    const { viewport } = optsRef.current

    if (g.kind === 'resize') {
      const clientDx = e.clientX - g.startClientX
      const clientDy = e.clientY - g.startClientY

      // Project screen delta to mesa's local space (inverse rotation).
      const { localDx, localDy } = projectDeltaToLocal(clientDx, clientDy, g.startRotation)

      const axis = HANDLE_AXIS[g.handle]
      let newW = Math.max(RESIZE_MIN, Math.min(RESIZE_MAX, g.startWidth  + axis.sx * localDx * 2 / viewport.zoom))
      let newH = Math.max(RESIZE_MIN, Math.min(RESIZE_MAX, g.startHeight + axis.sy * localDy * 2 / viewport.zoom))

      // FASE-14 PR3: lockAspect constraint for square/circle (CONTRATO AABB I-14).
      if (g.lockAspect) {
        if (axis.sx === 0) {
          // Height-only handle: width follows height.
          newW = newH
        } else if (axis.sy === 0) {
          // Width-only handle: height follows width.
          newH = newW
        } else {
          // Corner handle: use the larger of both dimensions.
          const size = Math.max(newW, newH)
          newW = size
          newH = size
        }
      }

      // Keep center fixed: recalculate screenX/Y from center minus half the new screen size.
      const screenW = newW * viewport.zoom
      const screenH = newH * viewport.zoom
      const newScreenX = g.centerScreenX - screenW / 2
      const newScreenY = g.centerScreenY - screenH / 2

      g.outerEl.style.width     = `${screenW}px`
      g.outerEl.style.height    = `${screenH}px`
      g.outerEl.style.transform = `translate(${newScreenX}px, ${newScreenY}px)`
      g.outerEl.dataset.pendingW = String(newW)
      g.outerEl.dataset.pendingH = String(newH)

    } else {
      // Rotation
      const currentAngle = radToDeg(Math.atan2(
        e.clientY - g.centerScreenY,
        e.clientX - g.centerScreenX,
      ))
      const delta = currentAngle - g.startAngle
      const newRot = normalizeDeg(g.startRotation + delta)

      g.innerEl.style.transform = `rotate(${newRot}deg)`
      g.innerEl.dataset.pendingRot = String(newRot)
    }
  }, [])

  // ── Shared up ────────────────────────────────────────────────────────────────

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const g = gestureRef.current
    if (!g) return
    // IMP-2: only the captured pointer closes the gesture.
    if (e.pointerId !== g.pointerId) return

    if (g.kind === 'resize') {
      const pendingW = parseFloat(g.outerEl.dataset.pendingW ?? '')
      const pendingH = parseFloat(g.outerEl.dataset.pendingH ?? '')
      delete g.outerEl.dataset.pendingW
      delete g.outerEl.dataset.pendingH
      // FASE-14 PR3: restore lift — never persisted, always restored on pointerup.
      g.outerEl.style.zIndex = g.preGestureZIndex
      gestureRef.current = null
      optsRef.current.sharedActivePointer.current = null
      if (!isNaN(pendingW) && !isNaN(pendingH)) {
        optsRef.current.onCommit(g.mesaId, { width: pendingW, height: pendingH })
      }
    } else {
      const pendingRot = parseFloat(g.innerEl.dataset.pendingRot ?? '')
      delete g.innerEl.dataset.pendingRot
      // FASE-14 PR3: restore lift.
      g.outerEl.style.zIndex = g.preGestureZIndex
      gestureRef.current = null
      optsRef.current.sharedActivePointer.current = null
      if (!isNaN(pendingRot)) {
        optsRef.current.onCommit(g.mesaId, { rotation: pendingRot })
      }
    }
  }, [])

  // ── Shared cancel ────────────────────────────────────────────────────────────

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const g = gestureRef.current
    if (!g) return
    // IMP-2: only the captured pointer cancels.
    if (e.pointerId !== g.pointerId) return

    const { viewport, sharedActivePointer } = optsRef.current

    if (g.kind === 'resize') {
      // Restore original dimensions and position.
      const screenW = g.startWidth  * viewport.zoom
      const screenH = g.startHeight * viewport.zoom
      g.outerEl.style.width     = `${screenW}px`
      g.outerEl.style.height    = `${screenH}px`
      g.outerEl.style.transform = `translate(${g.centerScreenX - screenW / 2}px, ${g.centerScreenY - screenH / 2}px)`
      delete g.outerEl.dataset.pendingW
      delete g.outerEl.dataset.pendingH
      // FASE-14 PR3: restore lift — always restored on pointercancel.
      g.outerEl.style.zIndex = g.preGestureZIndex
    } else {
      // Restore original rotation.
      g.innerEl.style.transform = `rotate(${g.startRotation}deg)`
      delete g.innerEl.dataset.pendingRot
      // FASE-14 PR3: restore lift.
      g.outerEl.style.zIndex = g.preGestureZIndex
    }
    gestureRef.current = null
    sharedActivePointer.current = null
  }, [])

  return {
    onResizePointerDown,
    onRotatePointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }
}
