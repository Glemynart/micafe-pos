'use client'

import { useState, useEffect } from 'react'
import {
  ClipboardList,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Banknote,
  Smartphone,
  X,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatCurrency } from '@/lib/demo-data'
import {
  suscribirCuentasPorCobrar,
  marcarComoPagada,
  calcularEstadoDIAN,
  tiempoRestanteDIAN,
  type CuentaCobro,
} from '@/lib/cuentas-cobro-service'

export function CuentasCobroModule() {
  const [cuentas, setCuentas] = useState<CuentaCobro[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<CuentaCobro | null>(null)
  const [showPagarDialog, setShowPagarDialog] = useState(false)
  const [metodoPagoFinal, setMetodoPagoFinal] = useState<'efectivo' | 'transferencia' | 'mixto'>('efectivo')
  const [procesando, setProcesando] = useState(false)
  // Timer para refrescar el semáforo DIAN cada minuto
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const unsub = suscribirCuentasPorCobrar((data) => {
      setCuentas(data)
      setCargando(false)
    })
    return unsub
  }, [])

  // Refresca el semáforo cada 60 segundos
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const cuentasFiltradas = cuentas.filter(c =>
    c.clienteNombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    c.id.includes(busqueda)
  )

  const totalPendiente = cuentas.reduce((acc, c) => acc + c.totales.total, 0)
  const countDanger = cuentas.filter(c => calcularEstadoDIAN(c.fecha) === 'danger').length
  const countWarning = cuentas.filter(c => calcularEstadoDIAN(c.fecha) === 'warning').length

  const handlePagar = async () => {
    if (!cuentaSeleccionada) return
    setProcesando(true)
    try {
      await marcarComoPagada(cuentaSeleccionada.id, metodoPagoFinal)
      setShowPagarDialog(false)
      setCuentaSeleccionada(null)
    } catch (e) {
      console.error(e)
      alert('Error al registrar el pago. Intenta de nuevo.')
    } finally {
      setProcesando(false)
    }
  }

  const EstadoBadge = ({ cuenta }: { cuenta: CuentaCobro }) => {
    // tick se usa para re-renderizar cada minuto
    void tick
    const estado = calcularEstadoDIAN(cuenta.fecha)
    if (estado === 'danger') return (
      <Badge className="bg-destructive/20 text-destructive border-destructive/30 gap-1">
        <AlertCircle className="h-3 w-3" /> DIAN vencida
      </Badge>
    )
    if (estado === 'warning') return (
      <Badge className="bg-warning/20 text-warning border-warning/30 gap-1">
        <AlertTriangle className="h-3 w-3" /> Facturar pronto
      </Badge>
    )
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" /> A tiempo
      </Badge>
    )
  }

  const formatFecha = (ts: { toDate: () => Date } | null) => {
    if (!ts) return '—'
    return ts.toDate().toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Cuentas por Cobrar
          </h1>
          <p className="text-muted-foreground text-sm">Cuentas de cobro y pagos pendientes</p>
        </div>
        <div className="flex gap-3">
          {countDanger > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-semibold text-destructive">{countDanger} DIAN vencida{countDanger > 1 ? 's' : ''}</span>
            </div>
          )}
          {countWarning > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-sm font-semibold text-warning">{countWarning} por vencer</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <ClipboardList className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Cuentas pendientes</p>
              <p className="text-2xl font-bold text-foreground">{cuentas.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Total pendiente</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(totalPendiente)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center",
              countDanger > 0 ? "bg-destructive/10" : countWarning > 0 ? "bg-warning/10" : "bg-success/10"
            )}>
              <Clock className={cn(
                "h-6 w-6",
                countDanger > 0 ? "text-destructive" : countWarning > 0 ? "text-warning" : "text-success"
              )} />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Estado DIAN</p>
              <p className={cn(
                "text-lg font-bold",
                countDanger > 0 ? "text-destructive" : countWarning > 0 ? "text-warning" : "text-success"
              )}>
                {countDanger > 0 ? 'Urgente' : countWarning > 0 ? 'Atención' : 'Al día'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre del cliente..."
          className="pl-9 bg-card border-border"
        />
      </div>

      {/* Table */}
      <Card className="flex-1 bg-card border-border overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base text-foreground">Listado de cuentas pendientes</CardTitle>
        </CardHeader>
        <ScrollArea className="flex-1 h-[calc(100%-60px)]">
          {cargando ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-3">
              <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              Cargando cuentas...
            </div>
          ) : cuentasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <CheckCircle2 className="h-12 w-12 text-success/60" />
              <p className="font-medium">
                {busqueda ? 'Sin resultados para esa búsqueda' : '¡Sin cuentas pendientes!'}
              </p>
              <p className="text-sm">
                {!busqueda && 'Todos los clientes están al día 🎉'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {cuentasFiltradas.map(cuenta => {
                void tick // trigger re-render
                const estadoDIAN = calcularEstadoDIAN(cuenta.fecha)
                return (
                  <div
                    key={cuenta.id}
                    className={cn(
                      "flex items-center gap-4 px-4 py-3 hover:bg-secondary/30 transition-colors cursor-pointer",
                      estadoDIAN === 'danger' && "bg-destructive/5",
                      estadoDIAN === 'warning' && "bg-warning/5"
                    )}
                    onClick={() => { setCuentaSeleccionada(cuenta); setShowPagarDialog(true); setMetodoPagoFinal('efectivo') }}
                  >
                    {/* Semáforo lateral */}
                    <div className={cn(
                      "w-1.5 self-stretch rounded-full flex-shrink-0",
                      estadoDIAN === 'danger' ? "bg-destructive" :
                      estadoDIAN === 'warning' ? "bg-warning" : "bg-success"
                    )} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-foreground text-base truncate">
                          {cuenta.clienteNombre || 'Sin nombre'}
                        </p>
                        <EstadoBadge cuenta={cuenta} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatFecha(cuenta.fecha)}
                        {cuenta.notasFiado && ` · ${cuenta.notasFiado}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {tiempoRestanteDIAN(cuenta.fecha)}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className="text-xl font-bold text-primary">{formatCurrency(cuenta.totales.total)}</p>
                      <p className="text-xs text-muted-foreground">
                        {cuenta.items.length} ítem{cuenta.items.length !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <Button size="sm" className="bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/30 flex-shrink-0">
                      Cobrar
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </Card>

      {/* Pagar Dialog */}
      <Dialog open={showPagarDialog} onOpenChange={open => { if (!open) { setShowPagarDialog(false); setCuentaSeleccionada(null) } }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-success" />
              Registrar Pago
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {cuentaSeleccionada?.clienteNombre} — {cuentaSeleccionada && formatCurrency(cuentaSeleccionada.totales.total)}
            </DialogDescription>
          </DialogHeader>

          {cuentaSeleccionada && (
            <div className="py-4 space-y-4">
              {/* Detalle de ítems */}
              <div className="space-y-1 bg-secondary/30 rounded-lg p-3">
                {cuentaSeleccionada.items.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-foreground">{item.cantidad}× {item.nombre}</span>
                    <span className="text-muted-foreground">{formatCurrency(item.subtotal)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-base pt-2 border-t border-border mt-2">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(cuentaSeleccionada.totales.total)}</span>
                </div>
              </div>

              {/* Notas si existen */}
              {cuentaSeleccionada.notasFiado && (
                <div className="text-sm text-muted-foreground bg-secondary/20 rounded-lg px-3 py-2">
                  📝 {cuentaSeleccionada.notasFiado}
                </div>
              )}

              {/* Alerta DIAN si aplica */}
              {calcularEstadoDIAN(cuentaSeleccionada.fecha) !== 'ok' && (
                <div className={cn(
                  "flex items-start gap-2 p-3 rounded-lg border text-xs font-medium",
                  calcularEstadoDIAN(cuentaSeleccionada.fecha) === 'danger'
                    ? "bg-destructive/10 border-destructive/30 text-destructive"
                    : "bg-warning/10 border-warning/30 text-warning"
                )}>
                  {calcularEstadoDIAN(cuentaSeleccionada.fecha) === 'danger'
                    ? <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    : <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  }
                  <span>
                    {tiempoRestanteDIAN(cuentaSeleccionada.fecha)} — Recuerda emitir la factura DIAN.
                  </span>
                </div>
              )}

              {/* Método de pago */}
              <div className="space-y-2">
                <Label>¿Cómo pagó el cliente?</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'efectivo', label: 'Efectivo', icon: Banknote },
                    { id: 'transferencia', label: 'Transferencia', icon: Smartphone },
                    { id: 'mixto', label: 'Mixto', icon: X },
                  ] as const).map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMetodoPagoFinal(m.id)}
                      className={cn(
                        "flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all text-sm",
                        metodoPagoFinal === m.id
                          ? "border-success bg-success/10 text-success"
                          : "border-border text-muted-foreground hover:border-success/50"
                      )}
                    >
                      <m.icon className="h-5 w-5" />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPagarDialog(false); setCuentaSeleccionada(null) }}>
              Cancelar
            </Button>
            <Button
              onClick={handlePagar}
              disabled={procesando}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {procesando ? (
                <div className="h-4 w-4 mr-2 rounded-full border-2 border-success-foreground border-t-transparent animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Confirmar Pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
