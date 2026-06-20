"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Square, Banknote, TrendingDown, CreditCard, CheckCircle, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { billDenominations } from "@/lib/demo-data"
import { Turno, calcularVentasTurno, cerrarTurno, suscribirTurnoActivo } from "@/lib/turnos-service"
import { calcularEgresosTurno } from "@/lib/egresos-service"
import { toast } from "sonner"

const formatCurrency = (val: number) => 
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val)

interface GlobalCloseShiftProps {
  usuario: any
  onCloseSuccess: () => void
}

export function GlobalCloseShift({ usuario, onCloseSuccess }: GlobalCloseShiftProps) {
  const [open, setOpen] = useState(false)
  const [activeShift, setActiveShift] = useState<Turno | null>(null)
  
  const [ventasTurno, setVentasTurno] = useState({ total: 0, efectivo: 0, transferencia: 0, tarjeta: 0, otros: 0 })
  const [egresosTurno, setEgresosTurno] = useState(0)
  const [cashCount, setCashCount] = useState<Record<string, number>>({})
  const [closeNotes, setCloseNotes] = useState('')
  const [handoverTo, setHandoverTo] = useState('none')
  const [isClosing, setIsClosing] = useState(false)
  const [isLoadingTotals, setIsLoadingTotals] = useState(false)

  // Suscribirse al turno activo para tenerlo listo
  useEffect(() => {
    if (!usuario) return
    const unsub = suscribirTurnoActivo(usuario.uid, (doc) => {
      setActiveShift(doc)
    })
    return () => unsub()
  }, [usuario])

  // Escuchar el evento global
  useEffect(() => {
    const handleRequest = async () => {
      if (!activeShift) {
        // Si no tiene turno activo, permitir salir directo
        onCloseSuccess()
        return
      }
      
      // ABRIR INMEDIATAMENTE para que el usuario no espere
      setOpen(true)
      setIsLoadingTotals(true)
      
      try {
        const ventas = await calcularVentasTurno(activeShift.id)
        const egresos = await calcularEgresosTurno(activeShift.id)
        setVentasTurno(ventas)
        setEgresosTurno(egresos)
      } catch (err) {
        console.error("Error cargando totales del turno", err)
      } finally {
        setIsLoadingTotals(false)
      }
    }

    window.addEventListener('request_close_shift', handleRequest)
    return () => window.removeEventListener('request_close_shift', handleRequest)
  }, [activeShift, onCloseSuccess])

  const totalCashCount = Object.entries(cashCount).reduce((total, [denom, cant]) => {
    if (denom === 'monedas') return total + cant;
    return total + (Number(denom) * cant)
  }, 0)

  const expectedCash = activeShift ? (activeShift.baseApertura + ventasTurno.efectivo - egresosTurno) : 0
  const cashDifference = totalCashCount - expectedCash

  const formatTime = (date: any) => {
    if (!date) return '-'
    return date.toDate().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  }

  const handleCloseShift = async () => {
    if (!activeShift) return
    setIsClosing(true)
    try {
      await cerrarTurno({
        turnoId: activeShift.id,
        ventasEfectivo: ventasTurno.efectivo,
        ventasOtrosMetodos: ventasTurno.transferencia + ventasTurno.tarjeta + ventasTurno.otros,
        totalEgresos: egresosTurno,
        totalEsperadoEfectivo: expectedCash,
        totalReportadoEfectivo: totalCashCount,
        diferenciaEfectivo: cashDifference,
        notasCierre: closeNotes
      })
      setOpen(false)
      toast.success("Turno cerrado correctamente")
      // Llamamos a logout
      onCloseSuccess()
    } catch (err) {
      console.error(err)
      toast.error("Hubo un error al cerrar el turno")
    } finally {
      setIsClosing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-background border-border shadow-2xl max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden sm:rounded-2xl">
        {/* Header con gradiente sutil */}
        <div className="bg-gradient-to-r from-primary/10 via-background to-background p-6 border-b border-border/50">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-foreground flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-xl">
                <Square className="h-5 w-5 text-destructive" />
              </div>
              Cierre de Turno
            </DialogTitle>
            <DialogDescription className="text-muted-foreground mt-1 text-base">
              Verifica los montos de caja y finaliza tu turno de trabajo.
            </DialogDescription>
          </DialogHeader>
        </div>
        
        <div className="px-6 py-5 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          {/* Tarjeta de Resumen del Turno */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col p-4 rounded-xl border border-border/50 bg-card shadow-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <p className="text-sm font-medium text-muted-foreground mb-1">Entrada</p>
              <p className="text-2xl font-bold text-foreground">{formatTime(activeShift?.fechaApertura)}</p>
            </div>
            <div className="flex flex-col p-4 rounded-xl border border-border/50 bg-card shadow-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <p className="text-sm font-medium text-muted-foreground mb-1">Base Inicial</p>
              <p className="text-2xl font-bold text-foreground">{formatCurrency(activeShift?.baseApertura || 0)}</p>
            </div>
            <div className="flex flex-col p-4 rounded-xl border border-primary/20 bg-primary/5 shadow-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <p className="text-sm font-medium text-primary/80 mb-1">Ventas del Turno</p>
              <p className="text-2xl font-bold text-primary">
                {isLoadingTotals ? <span className="text-lg animate-pulse">Calculando...</span> : (usuario?.rol === 'admin' ? formatCurrency(ventasTurno.total) : '***')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Sección Izquierda: Entradas de dinero */}
            <div className="space-y-6">
              {/* Conteo de Billetes */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-base font-semibold">Billetes</Label>
                </div>
                <div className="space-y-1.5">
                  {billDenominations.map(bill => {
                    const qty = cashCount[bill.value] || 0
                    return (
                      <div key={bill.value} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors">
                        <span className="text-sm font-bold text-foreground w-[4.5rem] shrink-0">{bill.label}</span>
                        <span className="text-muted-foreground/40 text-sm select-none">×</span>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={cashCount[bill.value] || ''}
                          onChange={(e) => setCashCount(prev => ({
                            ...prev,
                            [bill.value]: parseInt(e.target.value) || 0
                          }))}
                          placeholder="0"
                          className="w-20 h-10 text-center font-mono font-bold text-base bg-background border-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <span className="text-xs text-muted-foreground ml-auto shrink-0 min-w-[5rem] text-right tabular-nums">
                          {qty > 0 ? formatCurrency(qty * bill.value) : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Total en Monedas */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-border/50">
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/60" />
                  <Label className="text-base font-semibold">Monedas</Label>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Total en monedas sin contar por denominación</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={cashCount['monedas'] || ''}
                      onChange={(e) => setCashCount(prev => ({
                        ...prev,
                        monedas: parseInt(e.target.value) || 0
                      }))}
                      placeholder="Ej: 20000"
                      className="flex-1 h-11 font-mono text-base bg-background border-muted [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    {(cashCount['monedas'] || 0) > 0 && (
                      <span className="text-sm font-bold text-foreground shrink-0">
                        = {formatCurrency(cashCount['monedas'] || 0)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Sección Derecha: Resultados y Observaciones */}
            <div className="space-y-6 flex flex-col">
              
              {/* Bloque de Resultados */}
              <div className="bg-card rounded-2xl border border-border shadow-sm p-1 space-y-1">
                <div className="flex justify-between items-center p-3 px-4 rounded-xl bg-background/50">
                  <span className="text-sm font-medium text-muted-foreground">Total Contado en Caja</span>
                  <span className="text-xl font-bold text-foreground">{formatCurrency(totalCashCount)}</span>
                </div>
                
                <div className="flex justify-between items-center p-3 px-4 rounded-xl bg-background/50">
                  <span className="text-sm font-medium text-muted-foreground">Efectivo Esperado</span>
                  <span className="text-xl font-bold text-foreground">
                    {isLoadingTotals ? <span className="text-sm animate-pulse">...</span> : (usuario?.rol === 'admin' ? formatCurrency(expectedCash) : '***')}
                  </span>
                </div>

                <div className={cn(
                  "flex justify-between items-center p-4 px-4 rounded-xl mt-2 border",
                  isLoadingTotals ? "bg-muted border-border/50" : (
                    usuario?.rol !== 'admin' 
                      ? "bg-muted border-border/50"
                      : cashDifference === 0 
                        ? "bg-success/10 border-success/20" 
                        : cashDifference > 0 
                          ? "bg-success/10 border-success/20" 
                          : "bg-destructive/10 border-destructive/20"
                  )
                )}>
                  <span className="text-sm font-semibold text-foreground">Diferencia Final</span>
                  <span className={cn(
                    "text-xl font-black flex items-center gap-2",
                    isLoadingTotals ? "text-muted-foreground" : (
                      usuario?.rol !== 'admin'
                        ? "text-foreground"
                        : cashDifference === 0 
                          ? "text-success" 
                          : cashDifference > 0 
                            ? "text-success" 
                            : "text-destructive"
                    )
                  )}>
                    {isLoadingTotals ? <span className="text-sm font-medium animate-pulse">Calculando...</span> : (
                      usuario?.rol === 'admin' ? (
                        cashDifference === 0 ? (
                          <><CheckCircle className="h-5 w-5" /> Cuadrado</>
                        ) : cashDifference > 0 ? (
                          <>+{formatCurrency(cashDifference)} <span className="text-xs uppercase tracking-wider font-bold">Sobrante</span></>
                        ) : (
                          <><AlertTriangle className="h-5 w-5" /> {formatCurrency(Math.abs(cashDifference))} <span className="text-xs uppercase tracking-wider font-bold">Faltante</span></>
                        )
                      ) : '***'
                    )}
                  </span>
                </div>
              </div>

              {/* Observaciones y Entregas */}
              <div className="space-y-4 flex-1">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Observaciones de Cierre</Label>
                  <Textarea
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    placeholder="Escribe aquí si hubo algún inconveniente, gasto extra o nota importante..."
                    className="bg-background border-muted shadow-sm resize-none h-24 focus:ring-primary focus:border-primary transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Entregar turno a</Label>
                  <Select value={handoverTo} onValueChange={setHandoverTo}>
                    <SelectTrigger className="bg-background border-muted shadow-sm h-11">
                      <SelectValue placeholder="Seleccionar cajero de relevo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="carlos">Operador Demo 01</SelectItem>
                      <SelectItem value="ana">Operador Demo 02</SelectItem>
                      <SelectItem value="none" className="font-medium">Cierre definitivo (Fin de día)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-border bg-muted/30 flex items-center justify-end gap-3">
          <Button variant="ghost" className="hover:bg-muted font-medium" onClick={() => setOpen(false)} disabled={isClosing}>
            Cancelar
          </Button>
          <Button 
            onClick={handleCloseShift} 
            variant="destructive" 
            disabled={isClosing}
            className="px-6 font-bold shadow-md hover:shadow-lg transition-all"
          >
            <Square className="h-4 w-4 mr-2" fill="currentColor" />
            {isClosing ? 'Cerrando...' : 'Confirmar Cierre'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
