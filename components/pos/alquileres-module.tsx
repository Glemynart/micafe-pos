'use client'

import { useState, useEffect } from 'react'
import {
  Timer,
  Play,
  Square,
  Monitor,
  CheckCircle2,
  Clock,
  LogOut,
  AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { useEspacios } from '@/contexts/espacios-context'
import { formatCurrency } from '@/lib/demo-data'

import { suscribirMesas, type Mesa } from '@/lib/mesas-service'
import {
  suscribirPedidosActivos,
  guardarPedido,
  agregarItemPedido,
  detenerCronometroAlquiler,
  type PedidoActivo,
  type PedidoItem
} from '@/lib/pedidos-service'
import { suscribirProductos, type Producto } from '@/lib/productos-service'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

export function AlquileresModule() {
  const { espacioActivo } = useEspacios()
  const [recursos, setRecursos] = useState<Mesa[]>([])
  const [pedidos, setPedidos] = useState<PedidoActivo[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  
  const [cargando, setCargando] = useState(true)
  const [tick, setTick] = useState(0)

  // Modals
  const [recursoSeleccionado, setRecursoSeleccionado] = useState<{ mesa: Mesa, pedido: PedidoActivo | null } | null>(null)
  const [showStopDialog, setShowStopDialog] = useState(false)
  const [productoSeleccionadoId, setProductoSeleccionadoId] = useState<string>('')

  // Efecto para que los cronómetros se actualicen cada segundo
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!espacioActivo) return
    const unsubs = [
      suscribirMesas(espacioActivo.id, data => {
        setRecursos(data)
        setCargando(false)
      }),
      suscribirPedidosActivos(espacioActivo.id, data => setPedidos(data)),
      suscribirProductos(espacioActivo.id, data => setProductos(data))
    ]
    return () => unsubs.forEach(unsub => unsub())
  }, [espacioActivo])

  const formatearTiempo = (inicioMs: number) => {
    const ahora = Date.now()
    const diff = Math.max(0, ahora - inicioMs)
    
    const horas = Math.floor(diff / 3600000)
    const min = Math.floor((diff % 3600000) / 60000)
    const sec = Math.floor((diff % 60000) / 1000)
    
    return `${horas.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  const calcularHorasDecimales = (inicioMs: number) => {
    const ahora = Date.now()
    const diff = Math.max(0, ahora - inicioMs)
    return diff / 3600000 // Horas exactas en decimal
  }

  const iniciarTiempo = async (mesa: Mesa) => {
    if (!espacioActivo) return
    const nuevoPedido: Omit<PedidoActivo, 'actualizadoEn' | 'id' | 'activo'> = {
      mesaId: mesa.id,
      nombreMesa: mesa.nombre,
      espacioId: espacioActivo.id,
      cajeroId: 'demo-user', // En el futuro saldrá del auth
      items: [],
      estado: 'abierto',
      inicioAlquiler: Date.now()
    }
    await guardarPedido(nuevoPedido)
  }

  const detenerTiempo = async () => {
    if (!recursoSeleccionado?.pedido || !recursoSeleccionado.pedido.inicioAlquiler) return
    const producto = productos.find(p => p.id === productoSeleccionadoId)
    if (!producto) return

    const horasDecimales = calcularHorasDecimales(recursoSeleccionado.pedido.inicioAlquiler)
    const minutosExactos = Math.floor(horasDecimales * 60)

    const cobraPorMinuto = (producto as any).precioFraccion && (producto as any).precioFraccion > 0

    const cantidad = cobraPorMinuto ? Math.max(1, minutosExactos) : Number(Math.max(0.1, horasDecimales).toFixed(2))
    const precio = cobraPorMinuto ? (producto as any).precioFraccion : producto.precio

    const itemAlquiler: PedidoItem = {
      id: crypto.randomUUID(),
      uid: crypto.randomUUID(),
      name: cobraPorMinuto ? `${producto.nombre} (${minutosExactos} min)` : producto.nombre,
      code: '',
      price: precio,
      cost: producto.costo || 0,
      category: producto.categoriaId || '',
      emoji: producto.imagenUrl || '⏱️',
      stock: 999,
      iva: 0,
      impoconsumo: 0,
      hasRecipe: false,
      quantity: cantidad
    }

    await agregarItemPedido(recursoSeleccionado.pedido.id, itemAlquiler)
    await detenerCronometroAlquiler(recursoSeleccionado.pedido.id)
    setShowStopDialog(false)
    setRecursoSeleccionado(null)
    setProductoSeleccionadoId('')
  }

  // Dashboard Stats
  const activosCount = pedidos.filter(p => p.inicioAlquiler).length
  const disponiblesCount = recursos.length - activosCount

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Timer className="h-6 w-6 text-primary" />
            Dashboard de Alquileres
          </h1>
          <p className="text-muted-foreground text-sm">Control de tiempos para PCs y Espacios</p>
        </div>
        <div className="flex gap-3">
          <Badge variant="outline" className="bg-success/10 text-success border-success/30 gap-1 px-3 py-1">
            <CheckCircle2 className="h-4 w-4" /> {disponiblesCount} Disponibles
          </Badge>
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 gap-1 px-3 py-1">
            <Monitor className="h-4 w-4" /> {activosCount} En uso
          </Badge>
        </div>
      </div>

      {cargando ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : recursos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-card rounded-xl border border-border border-dashed">
          <Monitor className="h-12 w-12 mb-4 opacity-50" />
          <p>No hay recursos (Mesas/PCs) creados en este espacio.</p>
          <p className="text-sm">Ve a Configuración &gt; Mesas y Zonas para crear tus PCs o Salones.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {recursos.map(recurso => {
            void tick // trigger render
            const pedido = pedidos.find(p => p.mesaId === recurso.id)
            const isActivo = !!pedido?.inicioAlquiler

            return (
              <Card 
                key={recurso.id} 
                className={cn(
                  "overflow-hidden transition-all",
                  isActivo 
                    ? "border-destructive shadow-[0_0_15px_rgba(239,68,68,0.2)]" 
                    : "border-success/50 hover:border-success"
                )}
              >
                <CardHeader className={cn(
                  "py-3 px-4",
                  isActivo ? "bg-destructive/10" : "bg-success/5"
                )}>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="truncate" title={recurso.nombre}>{recurso.nombre}</span>
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      isActivo ? "bg-destructive animate-pulse" : "bg-success"
                    )} />
                  </CardTitle>
                </CardHeader>
                
                <CardContent className="p-4 flex flex-col items-center justify-center gap-3">
                  {isActivo ? (
                    <>
                      <div className="text-3xl font-mono font-bold text-foreground tabular-nums tracking-tight">
                        {formatearTiempo(pedido.inicioAlquiler!)}
                      </div>
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="w-full gap-2"
                        onClick={() => {
                          setRecursoSeleccionado({ mesa: recurso, pedido })
                          setShowStopDialog(true)
                        }}
                      >
                        <Square className="h-4 w-4" fill="currentColor" />
                        Detener
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="text-muted-foreground text-sm font-medium h-[36px] flex items-center">
                        Libre
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full gap-2 text-success border-success/30 hover:bg-success hover:text-success-foreground"
                        onClick={() => iniciarTiempo(recurso)}
                      >
                        <Play className="h-4 w-4" fill="currentColor" />
                        Iniciar
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog Detener Tiempo */}
      <Dialog open={showStopDialog} onOpenChange={setShowStopDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Finalizar Alquiler</DialogTitle>
            <DialogDescription>
              {recursoSeleccionado?.mesa.nombre}
            </DialogDescription>
          </DialogHeader>

          {recursoSeleccionado?.pedido?.inicioAlquiler && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-secondary/30 rounded-xl flex items-center justify-between">
                <span className="text-sm font-medium">Tiempo transcurrido:</span>
                <span className="text-2xl font-mono font-bold tabular-nums">
                  {formatearTiempo(recursoSeleccionado.pedido.inicioAlquiler)}
                </span>
              </div>
              
              <div className="text-sm text-muted-foreground text-center">
                Si el producto tiene precio por minuto, se cobrará exactamente por los minutos transcurridos. Si no, por fracciones de hora.
              </div>

              <div className="space-y-2">
                <Label>Producto a cobrar</Label>
                <Select value={productoSeleccionadoId} onValueChange={setProductoSeleccionadoId}>
                  <SelectTrigger className="bg-input">
                    <SelectValue placeholder="Selecciona la tarifa (ej: Alquiler PC)" />
                  </SelectTrigger>
                  <SelectContent>
                    {productos.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre} — {(p as any).precioFraccion > 0 ? `${formatCurrency((p as any).precioFraccion)} / min` : `${formatCurrency(p.precio)} / hr`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {productoSeleccionadoId && (() => {
                const p = productos.find(p => p.id === productoSeleccionadoId)
                if (!p) return null
                const cobraPorMinuto = (p as any).precioFraccion > 0
                const horasDecimales = calcularHorasDecimales(recursoSeleccionado.pedido.inicioAlquiler)
                const minutos = Math.floor(horasDecimales * 60)
                const total = cobraPorMinuto ? Math.max(1, minutos) * (p as any).precioFraccion : horasDecimales * p.precio
                return (
                  <div className="p-3 bg-primary/10 rounded-lg flex items-center justify-between border border-primary/20">
                    <span className="text-sm text-primary font-medium">Total estimado:</span>
                    <span className="font-bold text-primary">
                      {formatCurrency(total)}
                    </span>
                  </div>
                )
              })()}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStopDialog(false)}>
              Cancelar
            </Button>
            <Button 
              disabled={!productoSeleccionadoId}
              onClick={detenerTiempo}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Detener y Enviar a Caja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
