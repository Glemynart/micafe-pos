'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { Armchair, Loader2, ShoppingCart, ChefHat, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useEspacios } from '@/contexts/espacios-context'
import { useAuthContext } from '@/contexts/auth-context'
import { derivarMapa } from '@/lib/salon-service'
import { useSalonData } from '@/lib/hooks/useSalonData'
import { useSalonViewport } from '@/lib/hooks/useSalonViewport'
import { useSalonLayout } from '@/lib/hooks/useSalonLayout'
import { SalonCanvas, DEFAULT_WORLD_W, DEFAULT_WORLD_H, calcFitViewport } from './salon/SalonCanvas'
import { SalonToolbar } from './salon/SalonToolbar'
import { SalonDetailPanel } from './salon/SalonDetailPanel'
import { ESTADO_CONFIG } from './salon/MesaVisual'

export interface SalonModuleProps {
  onAbrirPedido?: (pedidoId: string) => void
}

export function SalonModule({ onAbrirPedido }: SalonModuleProps = {}) {
  const { espacioActivo } = useEspacios()
  const { usuario } = useAuthContext()
  const isAdmin = usuario?.rol === 'admin'

  const { mesas, pedidos, comandas, cargando } = useSalonData(espacioActivo?.id ?? null)
  const { viewport, updateViewport, fitPending, clearFitPending } = useSalonViewport(espacioActivo?.id ?? null)
  const { commitMesaPosition, commitMesaTransform } = useSalonLayout(isAdmin)

  const [selectedMesaId, setSelectedMesaId] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)

  // containerRef: solo para el botón "Ajustar" manual del toolbar (getBoundingClientRect)
  const containerRef = useRef<HTMLDivElement>(null)

  const worldWidth = espacioActivo?.salonWorldWidth ?? DEFAULT_WORLD_W
  const worldHeight = espacioActivo?.salonWorldHeight ?? DEFAULT_WORLD_H

  const mapa = useMemo(() => derivarMapa(mesas, pedidos, comandas), [mesas, pedidos, comandas])

  const selectedInfo = useMemo(
    () => mapa.find(m => m.mesa.id === selectedMesaId) ?? null,
    [mapa, selectedMesaId]
  )

  const conteo = useMemo(() => {
    const c = { libre: 0, ocupada: 0, en_cocina: 0, lista: 0 }
    for (const m of mapa) c[m.estado]++
    return c
  }, [mapa])

  const handleFit = useCallback(() => {
    if (!containerRef.current) return
    const { width, height } = containerRef.current.getBoundingClientRect()
    updateViewport(calcFitViewport(mapa, worldWidth, worldHeight, width, height))
  }, [mapa, worldWidth, worldHeight, updateViewport])

  const handleZoomIn = useCallback(() => {
    updateViewport(prev => {
      const newZoom = Math.min(4, prev.zoom * 1.2)
      return { ...prev, zoom: newZoom }
    })
  }, [updateViewport])

  const handleZoomOut = useCallback(() => {
    updateViewport(prev => {
      const newZoom = Math.max(0.15, prev.zoom / 1.2)
      return { ...prev, zoom: newZoom }
    })
  }, [updateViewport])

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground/50" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Armchair className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Salón</h2>
            <p className="text-xs text-muted-foreground">
              {mesas.length} {mesas.length === 1 ? 'mesa' : 'mesas'} &middot; {espacioActivo?.nombre}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {conteo.libre > 0 && (
            <Badge variant="outline" className="text-xs gap-1">
              {conteo.libre} libre{conteo.libre !== 1 && 's'}
            </Badge>
          )}
          {conteo.ocupada > 0 && (
            <Badge variant="outline" className={cn('text-xs gap-1', ESTADO_CONFIG.ocupada.badgeClass)}>
              <ShoppingCart className="h-3 w-3" />
              {conteo.ocupada}
            </Badge>
          )}
          {conteo.en_cocina > 0 && (
            <Badge variant="outline" className={cn('text-xs gap-1', ESTADO_CONFIG.en_cocina.badgeClass)}>
              <ChefHat className="h-3 w-3" />
              {conteo.en_cocina}
            </Badge>
          )}
          {conteo.lista > 0 && (
            <Badge variant="outline" className={cn('text-xs gap-1', ESTADO_CONFIG.lista.badgeClass)}>
              <CheckCircle2 className="h-3 w-3" />
              {conteo.lista}
            </Badge>
          )}
        </div>
      </div>

      {/* Canvas area */}
      {mesas.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <Armchair className="h-12 w-12 opacity-30" />
          <p className="text-sm">No hay mesas configuradas en este espacio.</p>
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 relative min-h-0">
          <SalonCanvas
            mapa={mapa}
            worldWidth={worldWidth}
            worldHeight={worldHeight}
            viewport={viewport}
            selectedMesaId={selectedMesaId}
            editMode={editMode}
            isAdmin={isAdmin}
            fitPending={fitPending}
            onFitComplete={clearFitPending}
            onViewportChange={updateViewport}
            onSelectMesa={setSelectedMesaId}
            onCommitPosition={commitMesaPosition}
            onCommitTransform={commitMesaTransform}
          />

          {/* Toolbar overlay — bottom-left */}
          <div className="absolute bottom-3 left-3 z-10">
            <SalonToolbar
              zoom={viewport.zoom}
              editMode={editMode}
              isAdmin={isAdmin}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onFit={handleFit}
              onToggleEdit={() => setEditMode(v => !v)}
            />
          </div>
        </div>
      )}

      {/* Detail panel */}
      {selectedInfo && (
        <SalonDetailPanel
          info={selectedInfo}
          comandas={comandas}
          onAbrirPedido={onAbrirPedido}
          onClose={() => setSelectedMesaId(null)}
        />
      )}
    </div>
  )
}
