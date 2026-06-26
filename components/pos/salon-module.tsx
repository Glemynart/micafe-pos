'use client'

import { useState, useEffect, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, ChefHat, CheckCircle2, Armchair, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEspacios } from '@/contexts/espacios-context'
import { suscribirMesas, type Mesa } from '@/lib/mesas-service'
import { suscribirPedidosActivos, suscribirComandasActivas, type PedidoActivo, type ComandaCocina } from '@/lib/pedidos-service'
import { derivarMapa, type InfoMesa, type EstadoMesa } from '@/lib/salon-service'

const ESTADO_CONFIG: Record<EstadoMesa, {
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
    border: 'border-border hover:border-primary/40',
    iconBg: 'bg-muted text-muted-foreground/50',
    badgeClass: '',
    icon: null,
  },
  ocupada: {
    label: 'Ocupada',
    bg: 'bg-primary/10',
    border: 'border-primary/50 hover:border-primary',
    iconBg: 'bg-gradient-to-br from-secondary to-primary text-primary-foreground',
    badgeClass: 'bg-primary/15 text-primary border-primary/30',
    icon: <ShoppingCart className="h-3.5 w-3.5" />,
  },
  en_cocina: {
    label: 'En cocina',
    bg: 'bg-warning/10',
    border: 'border-warning/50 hover:border-warning',
    iconBg: 'bg-gradient-to-br from-warning/80 to-warning text-warning-foreground',
    badgeClass: 'bg-warning/15 text-warning-foreground border-warning/30',
    icon: <ChefHat className="h-3.5 w-3.5" />,
  },
  lista: {
    label: 'Lista',
    bg: 'bg-success/10',
    border: 'border-success/50 hover:border-success',
    iconBg: 'bg-gradient-to-br from-success/80 to-success text-success-foreground',
    badgeClass: 'bg-success/15 text-success border-success/30',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
}

function MesaCard({ info, selected, onSelect }: { info: InfoMesa; selected: boolean; onSelect: () => void }) {
  const config = ESTADO_CONFIG[info.estado]

  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30",
        "hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]",
        config.bg, config.border,
        selected && "ring-4 ring-primary/20 shadow-lg"
      )}
    >
      <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner", config.iconBg)}>
        {info.estado === 'libre' ? <Armchair className="h-6 w-6" /> : info.mesa.nombre.charAt(0)}
      </div>

      <p className="font-bold text-sm text-foreground truncate max-w-full">{info.mesa.nombre}</p>

      {info.estado !== 'libre' && (
        <Badge variant="outline" className={cn("text-[10px] gap-1", config.badgeClass)}>
          {config.icon}
          {config.label}
        </Badge>
      )}

      {info.totalItems > 0 && (
        <span className="text-[10px] text-muted-foreground">
          {info.totalItems} {info.totalItems === 1 ? 'ítem' : 'ítems'}
        </span>
      )}
    </button>
  )
}

export interface SalonModuleProps {
  onAbrirPedido?: (pedidoId: string) => void
}

export function SalonModule({ onAbrirPedido }: SalonModuleProps = {}) {
  const { espacioActivo } = useEspacios()

  const [mesas, setMesas] = useState<Mesa[]>([])
  const [pedidos, setPedidos] = useState<PedidoActivo[]>([])
  const [comandas, setComandas] = useState<ComandaCocina[]>([])
  const [cargando, setCargando] = useState(true)
  const [selectedMesaId, setSelectedMesaId] = useState<string | null>(null)

  useEffect(() => {
    if (!espacioActivo) {
      setMesas([])
      setPedidos([])
      setComandas([])
      setCargando(false)
      return
    }
    setCargando(true)
    let loaded = 0
    const check = () => { if (++loaded >= 3) setCargando(false) }

    const unsubMesas = suscribirMesas(espacioActivo.id, (data) => { setMesas(data); check() })
    const unsubPedidos = suscribirPedidosActivos(espacioActivo.id, (data) => { setPedidos(data); check() })
    const unsubComandas = suscribirComandasActivas(espacioActivo.id, (data) => { setComandas(data); check() })

    return () => { unsubMesas(); unsubPedidos(); unsubComandas() }
  }, [espacioActivo?.id])

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

  if (cargando) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground/50" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
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
            <Badge variant="outline" className={cn("text-xs gap-1", ESTADO_CONFIG.ocupada.badgeClass)}>
              <ShoppingCart className="h-3 w-3" />
              {conteo.ocupada}
            </Badge>
          )}
          {conteo.en_cocina > 0 && (
            <Badge variant="outline" className={cn("text-xs gap-1", ESTADO_CONFIG.en_cocina.badgeClass)}>
              <ChefHat className="h-3 w-3" />
              {conteo.en_cocina}
            </Badge>
          )}
          {conteo.lista > 0 && (
            <Badge variant="outline" className={cn("text-xs gap-1", ESTADO_CONFIG.lista.badgeClass)}>
              <CheckCircle2 className="h-3 w-3" />
              {conteo.lista}
            </Badge>
          )}
        </div>
      </div>

      {/* Mapa de mesas */}
      {mesas.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <Armchair className="h-12 w-12 opacity-30" />
          <p className="text-sm">No hay mesas configuradas en este espacio.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {mapa.map(info => (
              <MesaCard
                key={info.mesa.id}
                info={info}
                selected={selectedMesaId === info.mesa.id}
                onSelect={() => setSelectedMesaId(prev => prev === info.mesa.id ? null : info.mesa.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Panel de detalle de mesa seleccionada */}
      {selectedInfo && (
        <div className={cn(
          "rounded-2xl border p-4 transition-all animate-fade-in",
          ESTADO_CONFIG[selectedInfo.estado].bg,
          ESTADO_CONFIG[selectedInfo.estado].border
        )}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shadow-inner",
                ESTADO_CONFIG[selectedInfo.estado].iconBg
              )}>
                {selectedInfo.mesa.nombre.charAt(0)}
              </div>
              <div>
                <p className="font-bold text-foreground">{selectedInfo.mesa.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {ESTADO_CONFIG[selectedInfo.estado].label}
                  {selectedInfo.totalItems > 0 && ` · ${selectedInfo.totalItems} ítems`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selectedInfo.comandasPendientes > 0 && (
                <Badge variant="outline" className={cn("text-xs gap-1", ESTADO_CONFIG.en_cocina.badgeClass)}>
                  <ChefHat className="h-3 w-3" />
                  {selectedInfo.comandasPendientes} en cocina
                </Badge>
              )}
              {selectedInfo.comandasListas > 0 && (
                <Badge variant="outline" className={cn("text-xs gap-1", ESTADO_CONFIG.lista.badgeClass)}>
                  <CheckCircle2 className="h-3 w-3" />
                  {selectedInfo.comandasListas} lista{selectedInfo.comandasListas !== 1 && 's'}
                </Badge>
              )}
              {onAbrirPedido && selectedInfo.pedidoActivo && (
                <button
                  onClick={() => onAbrirPedido(selectedInfo.pedidoActivo!.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors active:scale-95"
                >
                  <ShoppingCart className="h-3 w-3" />
                  Ir al pedido
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
