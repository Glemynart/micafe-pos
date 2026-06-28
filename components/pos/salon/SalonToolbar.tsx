'use client'

import { useRef, useState, useEffect } from 'react'
import { ZoomIn, ZoomOut, Maximize2, Move, Lock, BringToFront, SendToBack, Plus, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Sector } from '@/lib/espacios-service'

interface SalonToolbarProps {
  zoom: number
  editMode: boolean
  isAdmin: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onToggleEdit: () => void
  // FASE-14 PR3: sector filter + z-order + sector assignment.
  sectors?: Sector[]
  activeSectorFilter?: string | null
  onSectorFilterChange?: (id: string | null) => void
  selectedMesaId?: string | null
  selectedMesaSectorId?: string | null
  onBringToFront?: () => void
  onSendToBack?: () => void
  onAssignSector?: (sectorId: string | null) => void
  onCreateSector?: (nombre: string) => void
}

export function SalonToolbar({
  zoom,
  editMode,
  isAdmin,
  onZoomIn,
  onZoomOut,
  onFit,
  onToggleEdit,
  sectors = [],
  activeSectorFilter = null,
  onSectorFilterChange,
  selectedMesaId,
  selectedMesaSectorId,
  onBringToFront,
  onSendToBack,
  onAssignSector,
  onCreateSector,
}: SalonToolbarProps) {
  const [creatingNewSector, setCreatingNewSector] = useState(false)
  const [newSectorName, setNewSectorName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (creatingNewSector) inputRef.current?.focus()
  }, [creatingNewSector])

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const nombre = newSectorName.trim()
    if (nombre && onCreateSector) {
      onCreateSector(nombre)
    }
    setNewSectorName('')
    setCreatingNewSector(false)
  }

  const showSectorRow = sectors.length > 0 || (isAdmin && editMode)
  const showZOrder = isAdmin && editMode && !!selectedMesaId
  const showAssign = isAdmin && editMode && !!selectedMesaId && sectors.length > 0

  return (
    <div className="flex flex-col gap-1 items-start">
      {/* Sector filter row — shown when sectors exist or admin can create them */}
      {showSectorRow && (
        <div className="flex items-center gap-1 bg-card/90 backdrop-blur-sm border border-border rounded-2xl p-1 shadow-md flex-wrap max-w-xs">
          {sectors.length > 0 && (
            <>
              <Button
                size="sm"
                variant={activeSectorFilter === null ? 'default' : 'ghost'}
                className="h-6 px-2 text-xs rounded-xl"
                onClick={() => onSectorFilterChange?.(null)}
              >
                Todos
              </Button>
              {sectors.map(s => (
                <Button
                  key={s.id}
                  size="sm"
                  variant={activeSectorFilter === s.id ? 'default' : 'ghost'}
                  className="h-6 px-2 text-xs rounded-xl"
                  style={activeSectorFilter !== s.id && s.color ? { color: s.color } : undefined}
                  onClick={() => onSectorFilterChange?.(s.id)}
                >
                  {s.nombre}
                </Button>
              ))}
            </>
          )}
          {isAdmin && editMode && (
            creatingNewSector ? (
              <form onSubmit={handleCreateSubmit} className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  value={newSectorName}
                  onChange={e => setNewSectorName(e.target.value)}
                  placeholder="Nombre..."
                  className="h-6 w-24 px-2 text-xs rounded-xl border border-border bg-background outline-none focus:border-primary"
                />
                <Button type="submit" size="icon" variant="ghost" className="h-6 w-6 rounded-xl">
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 rounded-xl"
                  onClick={() => { setCreatingNewSector(false); setNewSectorName('') }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </form>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 rounded-xl"
                title="Agregar sector"
                onClick={() => setCreatingNewSector(true)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            )
          )}
        </div>
      )}

      {/* Main toolbar */}
      <div className="flex items-center gap-1 bg-card/90 backdrop-blur-sm border border-border rounded-2xl p-1 shadow-md flex-wrap">
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

        {/* Z-order buttons — visible in edit mode with a mesa selected */}
        {showZOrder && (
          <>
            <div className="w-px h-5 bg-border mx-0.5" />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-xl"
              onClick={onBringToFront}
              title="Traer al frente"
            >
              <BringToFront className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-xl"
              onClick={onSendToBack}
              title="Enviar atrás"
            >
              <SendToBack className="h-4 w-4" />
            </Button>
          </>
        )}

        {/* Sector assignment for selected mesa */}
        {showAssign && (
          <>
            <div className="w-px h-5 bg-border mx-0.5" />
            <select
              value={selectedMesaSectorId ?? ''}
              onChange={e => onAssignSector?.(e.target.value || null)}
              className="h-8 px-2 text-xs rounded-xl border border-border bg-background text-foreground"
              title="Asignar sector"
            >
              <option value="">Sin sector</option>
              {sectors.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </>
        )}
      </div>
    </div>
  )
}
