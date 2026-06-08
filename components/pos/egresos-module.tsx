"use client"

import { useState, useEffect } from "react"
import { useAuthContext } from "@/contexts/auth-context"
import { useUI } from "@/contexts/ui-context"
import { suscribirTurnoActivo, type Turno } from "@/lib/turnos-service"
import { guardarEgreso, suscribirEgresosPorTurno, eliminarEgreso, type Egreso } from "@/lib/egresos-service"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trash2, Plus, TrendingDown, Clock, AlertCircle } from "lucide-react"
import { formatCurrency } from "@/lib/demo-data"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function EgresosModule() {
  const { usuario } = useAuthContext()
  const { isTouchMode } = useUI()
  
  const [activeShift, setActiveShift] = useState<Turno | null>(null)
  const [egresos, setEgresos] = useState<Egreso[]>([])
  
  const [showAddModal, setShowAddModal] = useState(false)
  const [monto, setMonto] = useState("")
  const [motivo, setMotivo] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isAdmin = usuario?.rol === 'admin'

  useEffect(() => {
    if (!usuario?.uid) return
    const unsubscribe = suscribirTurnoActivo(usuario.uid, (turno) => {
      setActiveShift(turno)
    })
    return () => unsubscribe()
  }, [usuario?.uid])

  useEffect(() => {
    if (!activeShift?.id) {
      setEgresos([])
      return
    }
    const unsubscribe = suscribirEgresosPorTurno(activeShift.id, (data) => {
      setEgresos(data)
    })
    return () => unsubscribe()
  }, [activeShift?.id])

  const totalEgresos = egresos.reduce((sum, e) => sum + e.monto, 0)

  const handleRegistrarEgreso = async () => {
    if (!monto || !motivo.trim() || !activeShift || !usuario) return
    
    const montoNum = parseInt(monto.replace(/\D/g, ''))
    if (isNaN(montoNum) || montoNum <= 0) {
      toast.error("Ingrese un monto válido")
      return
    }

    setIsSubmitting(true)
    try {
      await guardarEgreso({
        monto: montoNum,
        motivo: motivo.trim(),
        turnoId: activeShift.id,
        cajeroId: usuario.uid,
        cajeroNombre: usuario.nombre
      })
      toast.success("Egreso registrado correctamente")
      setShowAddModal(false)
      setMonto("")
      setMotivo("")
    } catch (error) {
      console.error("Error al registrar egreso:", error)
      toast.error("No se pudo registrar el egreso")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEliminarEgreso = async (id: string) => {
    if (!isAdmin) {
      toast.error("No tienes permisos para eliminar egresos")
      return
    }
    if (confirm("¿Estás seguro de eliminar este egreso? Esta acción modificará el cuadre de caja.")) {
      try {
        await eliminarEgreso(id)
        toast.success("Egreso eliminado")
      } catch (error) {
        console.error("Error al eliminar egreso:", error)
        toast.error("Error al eliminar el egreso")
      }
    }
  }

  if (!activeShift) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in bg-background">
        <div className="max-w-md text-center space-y-4">
          <div className="w-20 h-20 bg-secondary/50 rounded-full flex items-center justify-center mx-auto mb-6">
            <TrendingDown className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Sin turno abierto</h2>
          <p className="text-muted-foreground text-lg">
            Para registrar gastos y salidas de dinero de la caja, primero debes abrir un turno.
          </p>
          <Alert className="mt-6 text-left border-warning/50 bg-warning/10 text-warning">
            <AlertCircle className="h-5 w-5 !text-warning" />
            <AlertTitle>Importante</AlertTitle>
            <AlertDescription>
              Todos los egresos se descuentan automáticamente del efectivo esperado en el cuadre de caja actual.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto animate-fade-in bg-background/50">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <TrendingDown className="h-8 w-8 text-destructive" />
              Gastos de Caja
            </h1>
            <p className="text-muted-foreground">
              Registra los egresos realizados durante tu turno actual
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right bg-secondary/30 px-4 py-2 rounded-lg border border-border">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Gastos del Turno</p>
              <p className="text-3xl font-black text-destructive">{formatCurrency(totalEgresos)}</p>
            </div>
            <Button 
              size={isTouchMode ? "lg" : "default"} 
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2 h-full py-4 px-6 text-lg"
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="h-6 w-6" />
              Registrar Gasto
            </Button>
          </div>
        </div>

        <Card className="border-border shadow-sm">
          <CardHeader>
            <CardTitle>Historial de Egresos</CardTitle>
            <CardDescription>
              Gastos registrados en el turno de {activeShift.cajeroNombre}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {egresos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
                <TrendingDown className="h-12 w-12 mb-4 opacity-20" />
                <p className="text-lg font-medium">No hay gastos registrados en este turno</p>
                <p className="text-sm">Si sacas dinero de la caja para un pago, regístralo aquí.</p>
              </div>
            ) : (
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader className="bg-secondary/30">
                    <TableRow>
                      <TableHead>Hora</TableHead>
                      <TableHead>Motivo / Concepto</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      {isAdmin && <TableHead className="w-[100px] text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {egresos.map((egreso) => (
                      <TableRow key={egreso.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            {(egreso.fecha instanceof Date ? egreso.fecha : new Date(egreso.fecha?.seconds ? egreso.fecha.seconds * 1000 : Date.now())).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-foreground font-medium block">{egreso.motivo}</span>
                        </TableCell>
                        <TableCell className="text-right font-bold text-destructive">
                          -{formatCurrency(egreso.monto)}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                              onClick={() => handleEliminarEgreso(egreso.id)}
                              title="Eliminar gasto"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2">
              <TrendingDown className="h-6 w-6 text-destructive" />
              Registrar Gasto
            </DialogTitle>
            <DialogDescription>
              Este dinero será descontado del saldo de caja esperado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="monto" className="text-sm uppercase tracking-wider font-medium">Monto Retirado</Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">$</span>
                <Input
                  id="monto"
                  value={monto}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '')
                    setMonto(val ? Number(val).toLocaleString('es-CO') : '')
                  }}
                  className="pl-10 h-16 text-3xl font-black bg-secondary/30 border-2"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="motivo" className="text-sm uppercase tracking-wider font-medium">Concepto / Motivo</Label>
              <Textarea
                id="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Pago servicio de agua, compra de hielo, recibo proveedor..."
                className="resize-none h-24 bg-secondary/30 border-2 text-lg"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setShowAddModal(false)} className="h-12 w-full sm:w-auto">
              Cancelar
            </Button>
            <Button 
              onClick={handleRegistrarEgreso} 
              disabled={isSubmitting || !monto || !motivo.trim()}
              className="h-12 w-full sm:w-auto bg-destructive hover:bg-destructive/90 text-destructive-foreground text-lg font-bold"
            >
              Confirmar Salida
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
