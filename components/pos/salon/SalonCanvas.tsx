'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import type { InfoMesa } from '@/lib/salon-service'
import type { Viewport } from '@/lib/hooks/useSalonViewport'
import { useMesaDrag } from '@/lib/hooks/useMesaDrag'
import { MesaVisual } from './MesaVisual'

export const MESA_W = 120
export const MESA_H = 80

export const DEFAULT_WORLD_W = 1600
export const DEFAULT_WORLD_H = 1000

const ZOOM_STEP = 1.2
const ZOOM_MIN = 0.15
const ZOOM_MAX = 4

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
}: SalonCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const panStartRef = useRef<{ px: number; py: number; panX: number; panY: number } | null>(null)

  // I1: posiciones optimistas para evitar revert de drag mientras llega el eco de Firestore.
  // Llave = mesaId, valor = {posX, posY} confirmado en pointerup pero aún no reflejado en mapa.
  const optimisticPositions = useRef<Record<string, { posX: number; posY: number }>>({})

  // Limpia entradas optimistas cuyo eco ya llegó (posX/posY coincide con el valor committeado)
  useEffect(() => {
    const entries = Object.entries(optimisticPositions.current)
    if (entries.length === 0) return
    for (const [mesaId, opt] of entries) {
      const mesa = mapa.find(m => m.mesa.id === mesaId)?.mesa
      if (mesa && mesa.posX === opt.posX && mesa.posY === opt.posY) {
        delete optimisticPositions.current[mesaId]
      }
    }
  }, [mapa])

  // C1/I4: zoom-to-fit solo cuando fitPending=true (no hay viewport guardado).
  // El efecto sin deps corre tras cada render; la guardia fitPending lo hace inocuo
  // en cuanto se complete, evitando sobrescribir un viewport restaurado desde localStorage.
  useEffect(() => {
    if (!fitPending) return
    if (!containerRef.current) return
    const { width, height } = containerRef.current.getBoundingClientRect()
    if (width === 0) return
    onViewportChange(calcFitViewport(mapa, worldWidth, worldHeight, width, height))
    onFitComplete()
  })

  // I1: wrapper de commit que registra la posición optimista antes de que llegue el eco
  const handleCommitPosition = useCallback((mesaId: string, posX: number, posY: number) => {
    optimisticPositions.current[mesaId] = { posX, posY }
    onCommitPosition(mesaId, posX, posY)
  }, [onCommitPosition])

  const { onMesaPointerDown, onPointerMove: onDragMove, onPointerUp: onDragUp, onPointerCancel: onDragCancel } = useMesaDrag({
    viewport,
    worldWidth,
    worldHeight,
    isAdmin,
    editMode,
    mesaWidth: MESA_W,
    mesaHeight: MESA_H,
    onCommit: handleCommitPosition,
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

  // I2: cancela el pan si el sistema interrumpe el puntero durante un arrastre del canvas
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

      {/* Mesas — camino de render único; fallback de orden para mesas sin posX/posY */}
      {mapa.map((info, idx) => {
        // I1: la posición optimista tiene prioridad hasta que llegue el eco de Firestore
        const opt = optimisticPositions.current[info.mesa.id]
        const posX = opt?.posX ?? info.mesa.posX ?? fallbackWorldCoords(idx, mapa.length, worldWidth, worldHeight).posX
        const posY = opt?.posY ?? info.mesa.posY ?? fallbackWorldCoords(idx, mapa.length, worldWidth, worldHeight).posY
        const mesaW = info.mesa.width ?? MESA_W
        const mesaH = info.mesa.height ?? MESA_H
        const { screenX, screenY, screenW, screenH } = worldToScreen(posX, posY, mesaW, mesaH, viewport)

        return (
          <MesaVisual
            key={info.mesa.id}
            info={info}
            selected={selectedMesaId === info.mesa.id}
            editMode={editMode}
            screenX={screenX}
            screenY={screenY}
            screenW={screenW}
            screenH={screenH}
            onSelect={() => onSelectMesa(selectedMesaId === info.mesa.id ? null : info.mesa.id)}
            onPointerDown={e => onMesaPointerDown(e, info.mesa.id, posX, posY)}
            onPointerMove={onDragMove}
            onPointerUp={onDragUp}
            onPointerCancel={onDragCancel}
          />
        )
      })}
    </div>
  )
}
