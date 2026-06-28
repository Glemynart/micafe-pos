'use client'

import { useRef, useEffect, useCallback } from 'react'
import type { InfoMesa } from '@/lib/salon-service'
import type { Viewport } from '@/lib/hooks/useSalonViewport'
import type { MesaTransformPatch } from '@/lib/mesas-service'
import { useMesaDrag } from '@/lib/hooks/useMesaDrag'
import { useMesaTransform } from '@/lib/hooks/useMesaTransform'
import { MesaVisual } from './MesaVisual'

export const MESA_W = 120
export const MESA_H = 80

export const DEFAULT_WORLD_W = 1600
export const DEFAULT_WORLD_H = 1000

const ZOOM_STEP = 1.2
const ZOOM_MIN = 0.15
const ZOOM_MAX = 4

// Partial geometry that can be pending optimistically for any mesa.
interface OptimisticGeometry {
  posX?: number
  posY?: number
  width?: number
  height?: number
  rotation?: number
}

interface SalonCanvasProps {
  mapa: InfoMesa[]
  worldWidth: number
  worldHeight: number
  viewport: Viewport
  selectedMesaId: string | null
  editMode: boolean
  isAdmin: boolean
  // C1/I4: true cuando no hay viewport guardado y debe ejecutarse zoom-to-fit
  fitPending: boolean
  onFitComplete: () => void
  onViewportChange: (next: Viewport | ((prev: Viewport) => Viewport)) => void
  onSelectMesa: (mesaId: string | null) => void
  onCommitPosition: (mesaId: string, posX: number, posY: number) => void
  onCommitTransform: (mesaId: string, patch: MesaTransformPatch) => void
}

function worldToScreen(wx: number, wy: number, mesaW: number, mesaH: number, vp: Viewport) {
  return {
    screenX: wx * vp.zoom + vp.panX - (mesaW * vp.zoom) / 2,
    screenY: wy * vp.zoom + vp.panY - (mesaH * vp.zoom) / 2,
    screenW: mesaW * vp.zoom,
    screenH: mesaH * vp.zoom,
  }
}

function fallbackWorldCoords(index: number, totalMesas: number, worldW: number, worldH: number) {
  const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(totalMesas))))
  const rows = Math.ceil(totalMesas / cols)
  const cellW = worldW / (cols + 1)
  const cellH = worldH / (rows + 1)
  const col = index % cols
  const row = Math.floor(index / cols)
  return {
    posX: (col + 1) * cellW,
    posY: (row + 1) * cellH,
  }
}

export function calcFitViewport(
  mapa: InfoMesa[],
  worldWidth: number,
  worldHeight: number,
  containerW: number,
  containerH: number,
): Viewport {
  if (containerW <= 0 || containerH <= 0) return { zoom: 1, panX: 0, panY: 0 }

  if (mapa.length === 0) {
    const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(containerW / worldWidth, containerH / worldHeight) * 0.9))
    return {
      zoom,
      panX: (containerW - worldWidth * zoom) / 2,
      panY: (containerH - worldHeight * zoom) / 2,
    }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  mapa.forEach((info, idx) => {
    const posX = info.mesa.posX ?? fallbackWorldCoords(idx, mapa.length, worldWidth, worldHeight).posX
    const posY = info.mesa.posY ?? fallbackWorldCoords(idx, mapa.length, worldWidth, worldHeight).posY
    const w = (info.mesa.width ?? MESA_W) / 2
    const h = (info.mesa.height ?? MESA_H) / 2
    minX = Math.min(minX, posX - w)
    minY = Math.min(minY, posY - h)
    maxX = Math.max(maxX, posX + w)
    maxY = Math.max(maxY, posY + h)
  })

  const bboxW = maxX - minX
  const bboxH = maxY - minY
  const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX,
    Math.min(containerW / (bboxW * 1.16), containerH / (bboxH * 1.16))
  ))
  const centerX = (minX + bboxW / 2) * zoom
  const centerY = (minY + bboxH / 2) * zoom
  return {
    zoom,
    panX: containerW / 2 - centerX,
    panY: containerH / 2 - centerY,
  }
}

export function SalonCanvas({
  mapa,
  worldWidth,
  worldHeight,
  viewport,
  selectedMesaId,
  editMode,
  isAdmin,
  fitPending,
  onFitComplete,
  onViewportChange,
  onSelectMesa,
  onCommitPosition,
  onCommitTransform,
}: SalonCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const panStartRef = useRef<{ px: number; py: number; panX: number; panY: number } | null>(null)
  // IMP-2: single source of truth for the active pointer across drag and transform hooks.
  const activePointerRef = useRef<number | null>(null)

  // Generalized optimistic geometry: Partial per mesa, cleared field-by-field as Firestore echoes arrive.
  const optimisticGeometry = useRef<Record<string, OptimisticGeometry>>({})

  // Clear optimistic fields whose Firestore echo has arrived (field-by-field to avoid clearing unrelated pending fields).
  useEffect(() => {
    for (const [mesaId, opt] of Object.entries(optimisticGeometry.current)) {
      const mesa = mapa.find(m => m.mesa.id === mesaId)?.mesa
      if (!mesa) continue
      const remaining: OptimisticGeometry = {}
      if (opt.posX !== undefined && mesa.posX !== opt.posX) remaining.posX = opt.posX
      if (opt.posY !== undefined && mesa.posY !== opt.posY) remaining.posY = opt.posY
      if (opt.width !== undefined && mesa.width !== opt.width) remaining.width = opt.width
      if (opt.height !== undefined && mesa.height !== opt.height) remaining.height = opt.height
      if (opt.rotation !== undefined && mesa.rotation !== opt.rotation) remaining.rotation = opt.rotation
      if (Object.keys(remaining).length === 0) {
        delete optimisticGeometry.current[mesaId]
      } else {
        optimisticGeometry.current[mesaId] = remaining
      }
    }
  }, [mapa])

  // C1/I4: zoom-to-fit solo cuando fitPending=true.
  useEffect(() => {
    if (!fitPending) return
    if (!containerRef.current) return
    const { width, height } = containerRef.current.getBoundingClientRect()
    if (width === 0) return
    onViewportChange(calcFitViewport(mapa, worldWidth, worldHeight, width, height))
    onFitComplete()
  })

  const handleCommitPosition = useCallback((mesaId: string, posX: number, posY: number) => {
    optimisticGeometry.current[mesaId] = {
      ...optimisticGeometry.current[mesaId],
      posX,
      posY,
    }
    onCommitPosition(mesaId, posX, posY)
  }, [onCommitPosition])

  const handleCommitTransform = useCallback((mesaId: string, patch: MesaTransformPatch) => {
    optimisticGeometry.current[mesaId] = {
      ...optimisticGeometry.current[mesaId],
      ...patch,
    }
    onCommitTransform(mesaId, patch)
  }, [onCommitTransform])

  const { onMesaPointerDown, onPointerMove: onDragMove, onPointerUp: onDragUp, onPointerCancel: onDragCancel } = useMesaDrag({
    viewport,
    worldWidth,
    worldHeight,
    isAdmin,
    editMode,
    onCommit: handleCommitPosition,
    sharedActivePointer: activePointerRef,
  })

  const {
    onResizePointerDown,
    onRotatePointerDown,
    onPointerMove: onTransformMove,
    onPointerUp: onTransformUp,
    onPointerCancel: onTransformCancel,
  } = useMesaTransform({
    viewport,
    isAdmin,
    editMode,
    onCommit: handleCommitTransform,
    sharedActivePointer: activePointerRef,
  })

  const onCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== containerRef.current && (e.target as HTMLElement).closest('[data-mesa-id]')) return
    if (e.button !== 0 && e.button !== 1) return
    e.currentTarget.setPointerCapture(e.pointerId)
    panStartRef.current = { px: e.clientX, py: e.clientY, panX: viewport.panX, panY: viewport.panY }
  }, [viewport.panX, viewport.panY])

  const onCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!panStartRef.current) return
    const { px, py, panX: startPanX, panY: startPanY } = panStartRef.current
    const dx = e.clientX - px
    const dy = e.clientY - py
    onViewportChange(prev => ({
      ...prev,
      panX: startPanX + dx,
      panY: startPanY + dy,
    }))
  }, [onViewportChange])

  const onCanvasPointerUp = useCallback(() => {
    panStartRef.current = null
  }, [])

  const onCanvasPointerCancel = useCallback(() => {
    panStartRef.current = null
  }, [])

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    onViewportChange(prev => {
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev.zoom * factor))
      const scale = newZoom / prev.zoom
      return {
        zoom: newZoom,
        panX: mouseX - scale * (mouseX - prev.panX),
        panY: mouseY - scale * (mouseY - prev.panY),
      }
    })
  }, [onViewportChange])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-muted/30 rounded-2xl border border-border"
      style={{ cursor: panStartRef.current ? 'grabbing' : (editMode ? 'default' : 'grab') }}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
      onPointerCancel={onCanvasPointerCancel}
      onWheel={onWheel}
    >
      {/* World boundary hint */}
      <div
        className="absolute rounded-xl border border-dashed border-border/40 pointer-events-none"
        style={{
          left: viewport.panX,
          top: viewport.panY,
          width: worldWidth * viewport.zoom,
          height: worldHeight * viewport.zoom,
        }}
      />

      {/* Mesas — single render path; fallback coords for mesas without posX/posY */}
      {mapa.map((info, idx) => {
        // Optimistic geometry takes priority over Firestore data, which takes priority over defaults.
        const opt = optimisticGeometry.current[info.mesa.id]
        const fallback = fallbackWorldCoords(idx, mapa.length, worldWidth, worldHeight)
        const posX   = opt?.posX     ?? info.mesa.posX     ?? fallback.posX
        const posY   = opt?.posY     ?? info.mesa.posY     ?? fallback.posY
        const mesaW  = opt?.width    ?? info.mesa.width    ?? MESA_W
        const mesaH  = opt?.height   ?? info.mesa.height   ?? MESA_H
        const rot    = opt?.rotation ?? info.mesa.rotation ?? 0

        const { screenX, screenY, screenW, screenH } = worldToScreen(posX, posY, mesaW, mesaH, viewport)

        return (
          <MesaVisual
            key={info.mesa.id}
            info={info}
            selected={selectedMesaId === info.mesa.id}
            editMode={editMode}
            rotation={rot}
            screenX={screenX}
            screenY={screenY}
            screenW={screenW}
            screenH={screenH}
            onSelect={() => onSelectMesa(selectedMesaId === info.mesa.id ? null : info.mesa.id)}
            // Body drag handlers — pass per-mesa dims so clamp is correct.
            onBodyPointerDown={e => onMesaPointerDown(e, info.mesa.id, posX, posY, mesaW, mesaH)}
            onBodyPointerMove={onDragMove}
            onBodyPointerUp={onDragUp}
            onBodyPointerCancel={onDragCancel}
            // Transform (resize / rotate) handlers.
            onResizePointerDown={(e, handle, outerEl, innerEl) =>
              onResizePointerDown(e, handle, info.mesa.id, mesaW, mesaH, rot, outerEl, innerEl)
            }
            onRotatePointerDown={(e, outerEl, innerEl) =>
              onRotatePointerDown(e, info.mesa.id, rot, outerEl, innerEl)
            }
            onTransformPointerMove={onTransformMove}
            onTransformPointerUp={onTransformUp}
            onTransformPointerCancel={onTransformCancel}
          />
        )
      })}
    </div>
  )
}
