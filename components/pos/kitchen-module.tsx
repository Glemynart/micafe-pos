'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Clock, CheckCircle2, ChefHat, AlertTriangle, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { 
  type ComandaCocina, 
  obtenerModificadoresComandaCocina,
  suscribirComandasCocina, 
  actualizarEstadoComanda 
} from '@/lib/pedidos-service'
import { useAuthContext } from '@/contexts/auth-context'
import { useEspacios } from '@/contexts/espacios-context'
import { toast } from 'sonner'

export function KitchenModule() {
  const { usuario } = useAuthContext()
  const { espacioActivo } = useEspacios()
  const [comandas, setComandas] = useState<ComandaCocina[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!espacioActivo) return
    const unsub = suscribirComandasCocina(espacioActivo.id, (data) => {
      setComandas(data)
      setCargando(false)
    })
    return () => unsub()
  }, [espacioActivo])

  // Sonido de alerta para cancelaciones (opcional, requeriría interacción del usuario antes)
  useEffect(() => {
    const tieneCancelaciones = comandas.some(c => c.tipo === 'cancelacion' && c.estado === 'pendiente')
    if (tieneCancelaciones) {
      // Podrías reproducir un sonido de alerta aquí si quisieras
    }
  }, [comandas])

  const handleCompletar = async (comandaId: string, tipo: string) => {
    try {
      if (tipo === 'cancelacion') {
        // Para una cancelación, simplemente la marcamos como entregada/resuelta para sacarla del KDS
        await actualizarEstadoComanda(comandaId, 'entregado')
        toast.success('Cancelación atendida')
      } else {
        await actualizarEstadoComanda(comandaId, 'listo')
        toast.success('Comanda lista para entregar')
      }
    } catch (e) {
      console.error(e)
      toast.error('Error al actualizar comanda')
    }
  }

  const handlePreparar = async (comandaId: string) => {
    try {
      await actualizarEstadoComanda(comandaId, 'en_preparacion')
    } catch (e) {
      console.error(e)
      toast.error('Error al actualizar comanda')
    }
  }

  if (cargando) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <ChefHat className="h-12 w-12 animate-pulse" />
          <p>Cargando comandas...</p>
        </div>
      </div>
    )
  }

  if (comandas.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground opacity-50">
          <ChefHat className="h-24 w-24" />
          <p className="text-xl font-medium">Cocina al día</p>
          <p className="text-sm">No hay pedidos pendientes por preparar.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col space-y-4 overflow-hidden">
      <div className="flex justify-between items-center px-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Cocina (KDS)</h2>
          <p className="text-muted-foreground">
            {comandas.length} ticket(s) activo(s)
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="px-4 py-1.5 text-base bg-card">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse mr-2" />
            En vivo
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto pb-4 custom-scrollbar">
        <div className="flex gap-4 h-full min-w-max px-2">
          {comandas.map(comanda => (
            <ComandaCard 
              key={comanda.id} 
              comanda={comanda} 
              onPreparar={() => handlePreparar(comanda.id)}
              onCompletar={() => handleCompletar(comanda.id, comanda.tipo)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ComandaCard({ comanda, onPreparar, onCompletar }: { 
  comanda: ComandaCocina, 
  onPreparar: () => void,
  onCompletar: () => void 
}) {
  const isCancelacion = comanda.tipo === 'cancelacion'
  const isAdicion = comanda.tipo === 'adicion'
  const isPreparando = comanda.estado === 'en_preparacion'
  
  // Calcular tiempo transcurrido
  const fecha = comanda.creadoEn?.toDate() || new Date()
  const horaTexto = format(fecha, 'hh:mm a', { locale: es })
  
  const [minutos, setMinutos] = useState(0)
  
  useEffect(() => {
    const calcMinutos = () => {
      const diff = new Date().getTime() - fecha.getTime()
      setMinutos(Math.floor(diff / 60000))
    }
    calcMinutos()
    const interval = setInterval(calcMinutos, 30000)
    return () => clearInterval(interval)
  }, [fecha])

  const colorBase = isCancelacion 
    ? 'border-destructive bg-destructive/10' 
    : isAdicion 
      ? 'border-warning bg-warning/5' 
      : 'border-border bg-card'
      
  const headerColor = isCancelacion
    ? 'bg-destructive text-destructive-foreground'
    : isAdicion
      ? 'bg-warning text-warning-foreground'
      : isPreparando
        ? 'bg-primary text-primary-foreground'
        : 'bg-muted text-foreground'

  return (
    <Card className={cn("w-80 flex flex-col h-full overflow-hidden flex-shrink-0 border-2 transition-all", colorBase, isCancelacion && "animate-pulse")}>
      <div className={cn("px-4 py-3 flex justify-between items-start", headerColor)}>
        <div>
          <h3 className="font-black text-xl leading-none mb-1">
            {comanda.nombreMesa}
          </h3>
          <p className="text-xs opacity-90 font-medium">
            {isCancelacion ? 'ALERTA: CANCELACIÓN' : isAdicion ? 'ADICIÓN' : 'NUEVA ORDEN'}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-1 font-mono font-bold">
            <Clock className="w-4 h-4" />
            <span>{minutos}m</span>
          </div>
          <span className="text-xs opacity-80">{horaTexto}</span>
        </div>
      </div>
      
      <CardContent className="flex-1 p-0 overflow-y-auto custom-scrollbar flex flex-col">
        <ul className="divide-y divide-border/50 flex-1">
          {comanda.items.map((item, i) => (
            <li key={i} className="p-4 flex gap-3 items-start hover:bg-black/5 dark:hover:bg-white/5">
              <div className={cn(
                "w-8 h-8 rounded font-black flex items-center justify-center text-lg flex-shrink-0",
                isCancelacion ? "bg-destructive/20 text-destructive" : "bg-primary/10 text-primary"
              )}>
                {item.quantity}
              </div>
              <div className="flex-1">
                <p className={cn("font-bold text-lg leading-tight", isCancelacion && "line-through text-destructive")}>
                  {item.name}
                </p>
                {obtenerModificadoresComandaCocina(item).map((modificador, modifierIndex) => (
                  <p key={`${modifierIndex}-${modificador}`} className={cn("mt-1 pl-2 text-sm font-semibold leading-tight", isCancelacion && "line-through text-destructive")}>
                    + {modificador}
                  </p>
                ))}
                {item.notas && (
                  <p className="text-sm text-muted-foreground mt-1 flex items-start gap-1">
                    <span className="text-xs font-bold uppercase text-warning">Notas:</span> {item.notas}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        
        <div className="p-4 bg-background/50 border-t mt-auto">
          {isCancelacion ? (
            <Button 
              className="w-full h-14 text-lg font-bold bg-destructive hover:bg-destructive/90" 
              onClick={onCompletar}
            >
              <CheckCircle2 className="mr-2 h-6 w-6" />
              Entendido
            </Button>
          ) : (
            <div className="flex gap-2">
              {!isPreparando ? (
                <Button 
                  className="flex-1 h-14 text-lg font-bold bg-secondary text-foreground hover:bg-secondary/80 border"
                  onClick={onPreparar}
                >
                  <ChefHat className="mr-2 h-5 w-5" />
                  Preparar
                </Button>
              ) : (
                <Button 
                  className="flex-1 h-14 text-lg font-bold bg-success hover:bg-success/90"
                  onClick={onCompletar}
                >
                  <CheckCircle2 className="mr-2 h-6 w-6" />
                  Terminado
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
