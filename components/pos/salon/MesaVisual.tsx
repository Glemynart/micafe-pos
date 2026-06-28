'use client'

import React from 'react'
import { ShoppingCart, ChefHat, CheckCircle2, Armchair } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InfoMesa, EstadoMesa } from '@/lib/salon-service'

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

interface MesaVisualProps {
  info: InfoMesa
  selected: boolean
  editMode: boolean
  // Screen-space position (px) calculated by SalonCanvas
  screenX: number
  screenY: number
  // Screen-space size (px)
  screenW: number
  screenH: number
  onSelect: () => void
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void
}

export const MesaVisual = React.memo(function MesaVisual({
  info,
  selected,
  editMode,
  screenX,
  screenY,
  screenW,
  screenH,
  onSelect,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: MesaVisualProps) {
  const config = ESTADO_CONFIG[info.estado]

  return (
    <div
      data-mesa-id={info.mesa.id}
      className={cn(
        'absolute flex flex-col items-center justify-center gap-1',
        'rounded-2xl border-2 transition-colors select-none',
        'touch-none', // Prevent scroll interference
        config.bg, config.border,
        selected && 'ring-4 ring-primary/40 shadow-lg',
        editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
      )}
      style={{
        transform: `translate(${screenX}px, ${screenY}px)`,
        width: screenW,
        height: screenH,
        willChange: 'transform',
      }}
      onPointerDown={e => {
        e.stopPropagation() // Always prevent canvas pan when pressing a mesa
        if (editMode) {
          onPointerDown(e)
        } else {
          onSelect()
        }
      }}
      onPointerMove={onPointerMove}
      onPointerUp={e => {
        if (editMode) {
          // Check BEFORE onPointerUp deletes pendingX
          const hasDragged = e.currentTarget.dataset.pendingX !== undefined
          onPointerUp(e)
          if (!hasDragged) onSelect()
        }
      }}
      onPointerCancel={e => {
        if (editMode) {
          onPointerCancel(e) // restaura posición pre-drag, limpia estado, no llama onSelect
        }
      }}
    >
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
    </div>
  )
})
