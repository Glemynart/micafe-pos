'use client'

import { ZoomIn, ZoomOut, Maximize2, Move, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SalonToolbarProps {
  zoom: number
  editMode: boolean
  isAdmin: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onToggleEdit: () => void
}

export function SalonToolbar({
  zoom,
  editMode,
  isAdmin,
  onZoomIn,
  onZoomOut,
  onFit,
  onToggleEdit,
}: SalonToolbarProps) {
  return (
    <div className="flex items-center gap-1 bg-card/90 backdrop-blur-sm border border-border rounded-2xl p-1 shadow-md">
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 rounded-xl"
        onClick={onZoomOut}
        title="Alejar"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>

      <span className="text-xs font-mono font-bold text-muted-foreground min-w-[3rem] text-center select-none">
        {Math.round(zoom * 100)}%
      </span>

      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 rounded-xl"
        onClick={onZoomIn}
        title="Acercar"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>

      <div className="w-px h-5 bg-border mx-0.5" />

      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 rounded-xl"
        onClick={onFit}
        title="Ajustar al lienzo"
      >
        <Maximize2 className="h-4 w-4" />
      </Button>

      {isAdmin && (
        <>
          <div className="w-px h-5 bg-border mx-0.5" />
          <Button
            size="icon"
            variant={editMode ? 'default' : 'ghost'}
            className={cn('h-8 w-8 rounded-xl', editMode && 'bg-primary text-primary-foreground')}
            onClick={onToggleEdit}
            title={editMode ? 'Salir del modo edición' : 'Editar disposición'}
          >
            {editMode ? <Lock className="h-4 w-4" /> : <Move className="h-4 w-4" />}
          </Button>
        </>
      )}
    </div>
  )
}
