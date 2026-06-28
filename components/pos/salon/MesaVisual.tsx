'use client'

import React, { useRef } from 'react'
import { ShoppingCart, ChefHat, CheckCircle2, Armchair, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InfoMesa, EstadoMesa } from '@/lib/salon-service'
import type { ResizeHandle } from '@/lib/hooks/useMesaTransform'

export const ESTADO_CONFIG: Record<EstadoMesa, {
  label: string
  bg: string
  border: string
  iconBg: string
  badgeClass: string
  icon: React.ReactNode
}> = {
  libre: {
    label: 'Libre',
    bg: 'bg-card',
    border: 'border-border',
    iconBg: 'bg-muted text-muted-foreground/50',
    badgeClass: '',
    icon: null,
  },
  ocupada: {
    label: 'Ocupada',
    bg: 'bg-primary/10',
    border: 'border-primary/50',
    iconBg: 'bg-gradient-to-br from-secondary to-primary text-primary-foreground',
    badgeClass: 'bg-primary/15 text-primary border-primary/30',
    icon: <ShoppingCart className="h-3 w-3" />,
  },
  en_cocina: {
    label: 'En cocina',
    bg: 'bg-warning/10',
    border: 'border-warning/50',
    iconBg: 'bg-gradient-to-br from-warning/80 to-warning text-warning-foreground',
    badgeClass: 'bg-warning/15 text-warning-foreground border-warning/30',
    icon: <ChefHat className="h-3 w-3" />,
  },
  lista: {
    label: 'Lista',
    bg: 'bg-success/10',
    border: 'border-success/50',
    iconBg: 'bg-gradient-to-br from-success/80 to-success text-success-foreground',
    badgeClass: 'bg-success/15 text-success border-success/30',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
}

// Resize handle positions: CSS absolute placement on the inner div (100%×100%).
const RESIZE_HANDLES: { handle: ResizeHandle; style: React.CSSProperties; cursor: string }[] = [
  { handle: 'nw', style: { top: -6, left: -6 },               cursor: 'nw-resize' },
  { handle: 'n',  style: { top: -6, left: '50%', transform: 'translateX(-50%)' }, cursor: 'n-resize' },
  { handle: 'ne', style: { top: -6, right: -6 },              cursor: 'ne-resize' },
  { handle: 'e',  style: { top: '50%', right: -6, transform: 'translateY(-50%)' }, cursor: 'e-resize' },
  { handle: 'se', style: { bottom: -6, right: -6 },           cursor: 'se-resize' },
  { handle: 's',  style: { bottom: -6, left: '50%', transform: 'translateX(-50%)' }, cursor: 's-resize' },
  { handle: 'sw', style: { bottom: -6, left: -6 },            cursor: 'sw-resize' },
  { handle: 'w',  style: { top: '50%', left: -6, transform: 'translateY(-50%)' }, cursor: 'w-resize' },
]

interface MesaVisualProps {
  info: InfoMesa
  selected: boolean
  editMode: boolean
  rotation: number
  // Screen-space position (px) calculated by SalonCanvas
  screenX: number
  screenY: number
  // Screen-space size (px)
  screenW: number
  screenH: number
  onSelect: () => void
  // Drag (body)
  onBodyPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onBodyPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onBodyPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
  onBodyPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void
  // Transform (handles)
  onResizePointerDown: (e: React.PointerEvent<HTMLDivElement>, handle: ResizeHandle, outerEl: HTMLElement, innerEl: HTMLElement) => void
  onRotatePointerDown: (e: React.PointerEvent<HTMLDivElement>, outerEl: HTMLElement, innerEl: HTMLElement) => void
  onTransformPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onTransformPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
  onTransformPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void
}

export const MesaVisual = React.memo(function MesaVisual({
  info,
  selected,
  editMode,
  rotation,
  screenX,
  screenY,
  screenW,
  screenH,
  onSelect,
  onBodyPointerDown,
  onBodyPointerMove,
  onBodyPointerUp,
  onBodyPointerCancel,
  onResizePointerDown,
  onRotatePointerDown,
  onTransformPointerMove,
  onTransformPointerUp,
  onTransformPointerCancel,
}: MesaVisualProps) {
  const config = ESTADO_CONFIG[info.estado]
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  const showHandles = editMode && selected

  return (
    // OUTER: owns translate + width/height. Never rotates.
    <div
      ref={outerRef}
      data-mesa-id={info.mesa.id}
      className={cn(
        'absolute select-none touch-none',
      )}
      style={{
        transform: `translate(${screenX}px, ${screenY}px)`,
        width: screenW,
        height: screenH,
        willChange: 'transform',
      }}
      onPointerDown={e => {
        // Handles stop propagation before this fires; this is the body handler.
        e.stopPropagation()
        if (editMode) {
          onBodyPointerDown(e)
        } else {
          onSelect()
        }
      }}
      onPointerMove={e => {
        onBodyPointerMove(e)
        onTransformPointerMove(e)
      }}
      onPointerUp={e => {
        if (editMode) {
          // Read ALL gesture markers BEFORE any handler clears them.
          // Drag writes pendingX on outer; resize writes pendingW on outer;
          // rotation writes pendingRot on inner (innerRef).
          const outerDs = e.currentTarget.dataset
          const innerDs = innerRef.current?.dataset
          const hadGesture = outerDs.pendingX !== undefined
                          || outerDs.pendingW !== undefined
                          || innerDs?.pendingRot !== undefined
          onBodyPointerUp(e)
          onTransformPointerUp(e)
          // Only toggle selection on a clean tap with no gesture movement.
          if (!hadGesture) onSelect()
        }
      }}
      onPointerCancel={e => {
        if (editMode) {
          onBodyPointerCancel(e)
          onTransformPointerCancel(e)
        }
      }}
    >
      {/* INNER: owns rotate. Never translates. */}
      <div
        ref={innerRef}
        className={cn(
          'relative w-full h-full flex flex-col items-center justify-center gap-1',
          'rounded-2xl border-2 transition-colors',
          config.bg, config.border,
          selected && 'ring-4 ring-primary/40 shadow-lg',
          editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        )}
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: 'center',
        }}
      >
        {/* Visual content */}
        <div className={cn(
          'rounded-xl flex items-center justify-center font-black shadow-inner',
          config.iconBg,
        )} style={{ width: Math.max(28, screenW * 0.38), height: Math.max(28, screenH * 0.38), fontSize: Math.max(10, screenW * 0.14) }}>
          {info.estado === 'libre'
            ? <Armchair style={{ width: Math.max(12, screenW * 0.2), height: Math.max(12, screenW * 0.2) }} />
            : info.mesa.nombre.charAt(0)
          }
        </div>

        {screenW >= 70 && (
          <p className="font-bold leading-none text-foreground truncate max-w-full px-1"
             style={{ fontSize: Math.max(8, screenW * 0.1) }}>
            {info.mesa.nombre}
          </p>
        )}

        {info.estado !== 'libre' && screenW >= 60 && (
          <div className={cn('flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[9px] font-bold', config.badgeClass)}>
            {config.icon}
            {screenW >= 80 && <span>{config.label}</span>}
          </div>
        )}

        {info.totalItems > 0 && screenH >= 80 && (
          <span className="text-[9px] text-muted-foreground leading-none">
            {info.totalItems} {info.totalItems === 1 ? 'ítem' : 'ítems'}
          </span>
        )}

        {/* Resize handles — rendered inside inner so they rotate with the mesa */}
        {showHandles && RESIZE_HANDLES.map(({ handle, style, cursor }) => (
          <div
            key={handle}
            data-handle={handle}
            className="absolute w-3.5 h-3.5 rounded-sm bg-background border-2 border-primary shadow-sm z-10"
            style={{ ...style, cursor }}
            onPointerDown={e => {
              e.stopPropagation()
              if (outerRef.current && innerRef.current) {
                onResizePointerDown(e, handle, outerRef.current, innerRef.current)
              }
            }}
            onPointerMove={onTransformPointerMove}
            onPointerUp={e => { onTransformPointerUp(e); e.stopPropagation() }}
            onPointerCancel={onTransformPointerCancel}
          />
        ))}

        {/* Rotation handle — above the top edge of the inner */}
        {showHandles && (
          <>
            {/* Stem */}
            <div
              className="absolute pointer-events-none"
              style={{ top: -14, left: '50%', transform: 'translateX(-50%)', width: 1, height: 10, background: 'hsl(var(--primary))' }}
            />
            {/* Circle */}
            <div
              data-handle="rotate"
              className="absolute w-5 h-5 rounded-full bg-background border-2 border-primary shadow-sm z-10 flex items-center justify-center cursor-crosshair"
              style={{ top: -28, left: '50%', transform: 'translateX(-50%)' }}
              onPointerDown={e => {
                e.stopPropagation()
                if (outerRef.current && innerRef.current) {
                  onRotatePointerDown(e, outerRef.current, innerRef.current)
                }
              }}
              onPointerMove={onTransformPointerMove}
              onPointerUp={e => { onTransformPointerUp(e); e.stopPropagation() }}
              onPointerCancel={onTransformPointerCancel}
            >
              <RotateCw className="h-2.5 w-2.5 text-primary" />
            </div>
          </>
        )}
      </div>
    </div>
  )
})
