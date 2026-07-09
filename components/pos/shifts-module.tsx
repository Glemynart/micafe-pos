'use client'

import { useState, useEffect } from 'react'
import { useAuthContext } from '@/contexts/auth-context'
import { useEspacios } from '@/contexts/espacios-context'
import { 
  suscribirTurnoActivo, 
  suscribirHistorialTurnos, 
  abrirTurno, 
  cerrarTurno, 
  calcularVentasTurno,
  type Turno 
} from '@/lib/turnos-service'
import { calcularEgresosTurno } from '@/lib/egresos-service'
import { 
  Clock,
  Play,
  Square,
  Eye,
  Calendar,
  Banknote,
  CreditCard,
  Smartphone,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  User
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatTime, formatCurrency } from '@/lib/format-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  billDenominations,
} from '@/lib/demo-data'
import { toast } from 'sonner'
import { CloseShiftForm } from '@/components/pos/close-shift-form'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { suscribirConfiguracion, type ConfiguracionGlobal } from '@/lib/configuracion-service'

export function ShiftsModule() {
  const { usuario } = useAuthContext()
  
  const [showOpenShift, setShowOpenShift] = useState(false)
  const [showCloseShift, setShowCloseShift] = useState(false)
  const [showShiftDetail, setShowShiftDetail] = useState(false)
  const [selectedShift, setSelectedShift] = useState<Turno | null>(null)
  
  // Real data state
  const [activeShift, setActiveShift] = useState<Turno | null>(null)
  const [historial, setHistorial] = useState<Turno[]>([])
  const [ventasTurno, setVentasTurno] = useState({ efectivo: 0, transferencia: 0, tarjeta: 0, otros: 0, total: 0 })
  const [egresosTurno, setEgresosTurno] = useState(0)
  
  // Shift open form
  const [initialCash, setInitialCash] = useState('')
  const [openNotes, setOpenNotes] = useState('')
  
  // Cash count
  const [cashCount, setCashCount] = useState<Record<string, string>>({})
  const [closeNotes, setCloseNotes] = useState('')
  const [handoverTo, setHandoverTo] = useState('none')
  const [cajeros, setCajeros] = useState<{ uid: string; nombre: string }[]>([])
  const [config, setConfig] = useState<ConfiguracionGlobal | null>(null)

  // Suscribir configuración
  useEffect(() => {
    const unsub = suscribirConfiguracion(setConfig)
    return unsub
  }, [])

  // Fetch real data
  useEffect(() => {
    if (!usuario) return
    const unsubActivo = suscribirTurnoActivo(usuario.uid, setActiveShift)
    const unsubHistorial = suscribirHistorialTurnos(setHistorial)
    return () => { unsubActivo(); unsubHistorial() }
  }, [usuario?.uid])

  // FASE-10C: cargar cajeros/supervisores reales para el relevo (no hardcodear).
  useEffect(() => {
    if (!usuario) return
    getDocs(query(collection(db, 'usuarios'), where('rol', 'in', ['cajero', 'supervisor'])))
      .then(snap => {
        setCajeros(
          snap.docs
            .map(d => ({ uid: d.id, nombre: (d.data().nombre as string) || d.id }))
            .filter(c => c.uid !== usuario.uid)
        )
      })
      .catch(() => {})
  }, [usuario?.uid])

  // Auto-open modal if redirected from logout or event
  useEffect(() => {
    const checkAndOpen = () => {
      if (activeShift && sessionStorage.getItem('pending_close_shift') === 'true') {
        sessionStorage.removeItem('pending_close_shift')
        handleOpenCloseModal()
      }
    }
    checkAndOpen()
    
    const handleEvent = () => {
      if (activeShift) {
        handleOpenCloseModal()
      }
    }
    window.addEventListener('request_close_shift', handleEvent)
    return () => window.removeEventListener('request_close_shift', handleEvent)
  }, [activeShift])

  const totalCashCount = Object.entries(cashCount).reduce((total, [denom, raw]) => {
    const cant = parseInt(raw, 10) || 0
    if (denom === 'monedas') return total + cant
    return total + (Number(denom) * cant)
  }, 0)

  // Expected cash = Base + Ventas en Efectivo - Gastos
  const expectedCash = activeShift ? (activeShift.baseApertura + ventasTurno.efectivo - egresosTurno) : 0
  const cashDifference = totalCashCount - expectedCash

  // FASE-10C: no se permite cerrar con conteo vacío, salvo cierre forzado del admin.
  const puedeCerrar = totalCashCount > 0 || usuario?.rol === 'admin'

  const handleOpenShift = async () => {
    if (!usuario) return
    const base = parseInt(initialCash) || 0
    // Optimistic UI
    setShowOpenShift(false)
    setInitialCash('')
    setOpenNotes('')
    
    abrirTurno({
      cajeroId: usuario.uid,
      cajeroNombre: usuario.nombre || 'Cajero',
      baseApertura: base,
      notasApertura: openNotes
    }).catch(console.error)
  }

  const handleOpenCloseModal = async () => {
    if (!activeShift) return
    try {
      const ventas = await calcularVentasTurno(activeShift.id)
      const egresos = await calcularEgresosTurno(activeShift.id)
      setVentasTurno(ventas)
      setEgresosTurno(egresos)
      setShowCloseShift(true)
    } catch (err) {
      console.error("Error al calcular datos para cierre de turno", err)
      // Aun así abrir el modal para que el usuario pueda cerrar el turno manualmente
      setShowCloseShift(true)
    }
  }

  const handleCloseShift = async () => {
    if (!activeShift) return
    if (!puedeCerrar) {
      toast.error("Debes contar el efectivo de la caja antes de cerrar el turno.")
      return
    }
    const cajeroRelevo = cajeros.find(c => c.uid === handoverTo)
    const esRelevo = !!cajeroRelevo

    if (!esRelevo) {
      // Cierre definitivo: optimistic UI (sin riesgo de turno B)
      setShowCloseShift(false)
      setCashCount({})
      setCloseNotes('')
    }

    try {
      await cerrarTurno({
        turnoId: activeShift.id,
        ventasEfectivo: ventasTurno.efectivo,
        ventasOtrosMetodos: ventasTurno.transferencia + ventasTurno.tarjeta + ventasTurno.otros,
        totalEgresos: egresosTurno,
        totalEsperadoEfectivo: expectedCash,
        totalReportadoEfectivo: totalCashCount,
        diferenciaEfectivo: cashDifference,
        notasCierre: closeNotes,
        esCierreDefinitivo: handoverTo === 'none',
        conteoDetalle: Object.fromEntries(Object.entries(cashCount).map(([k, v]) => [k, parseInt(v, 10) || 0])),
        umbralAlertaFaltante: config?.umbralAlertaFaltante,
        ...(cajeroRelevo ? { relevoCajeroId: cajeroRelevo.uid, relevoCajeroNombre: cajeroRelevo.nombre } : {}),
      })
      if (esRelevo) {
        toast.success(`Turno entregado a ${cajeroRelevo.nombre}`)
        setShowCloseShift(false)
        setCashCount({})
        setCloseNotes('')
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error al cerrar el turno')
      if (!esRelevo) {
        // Reabrir modal si falla un cierre definitivo (UI optimista)
        setShowCloseShift(true)
      }
    }
  }

  const handleViewDetail = async (shift: Turno) => {
    let detailShift = { ...shift }
    if (shift.estado === 'abierto') {
      const ventas = await calcularVentasTurno(shift.id)
      const egresos = await calcularEgresosTurno(shift.id)
      detailShift.ventasEfectivo = ventas.efectivo
      detailShift.ventasOtrosMetodos = ventas.transferencia + ventas.tarjeta + ventas.otros
      detailShift.totalEgresos = egresos
    }
    setSelectedShift(detailShift)
    setShowShiftDetail(true)
  }


  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            Turnos
          </h1>
          <p className="text-muted-foreground">Gestiona la apertura y cierre de turnos</p>
        </div>
        <div className="flex items-center gap-3">
          {activeShift ? (
            <Button onClick={handleOpenCloseModal} variant="destructive">
              <Square className="h-4 w-4 mr-2" />
              Cerrar Turno
            </Button>
          ) : (
            <Button onClick={() => { if (config?.baseCajaSugerida && !initialCash) setInitialCash(config.baseCajaSugerida.toString()); setShowOpenShift(true) }} className="bg-primary text-primary-foreground">
              <Play className="h-4 w-4 mr-2" />
              Abrir Turno
            </Button>
          )}
        </div>
      </div>

      {/* Active Shift Card */}
      {activeShift && (
        <Card className="bg-primary/10 border-primary/30 animate-pulse-amber">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Turno activo</p>
                  <p className="text-xl font-bold text-foreground">{activeShift.cajeroNombre}</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Inicio</p>
                <p className="text-lg font-bold text-foreground">{formatTime(activeShift.fechaApertura)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Base</p>
                <p className="text-lg font-bold text-foreground">{formatCurrency(activeShift.baseApertura)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Estado</p>
                <p className="text-lg font-bold text-success flex items-center gap-1 justify-end">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
                  </span>
                  Abierto
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shifts History Table */}
      <Card className="flex-1 flex flex-col bg-card border-border">
        <CardHeader className="border-b border-border py-3">
          <CardTitle className="text-foreground">Historial de Turnos</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">Cajero</TableHead>
                <TableHead className="text-muted-foreground">Fecha</TableHead>
                <TableHead className="text-muted-foreground">Entrada</TableHead>
                <TableHead className="text-muted-foreground">Salida</TableHead>
                <TableHead className="text-muted-foreground">Duración</TableHead>
                <TableHead className="text-muted-foreground text-right">Ventas</TableHead>
                <TableHead className="text-muted-foreground text-right">Diferencia</TableHead>
                <TableHead className="text-muted-foreground text-center">Estado</TableHead>
                <TableHead className="text-muted-foreground text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historial.map((shift, idx) => (
                <TableRow 
                  key={shift.id}
                  className="border-border hover:bg-secondary/30 animate-fade-in"
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-xs font-medium text-primary">
                          {shift.cajeroNombre?.substring(0, 2).toUpperCase() || 'CA'}
                        </span>
                      </div>
                      <span className="font-medium text-foreground">{shift.cajeroNombre}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {formatDate(shift.fechaApertura)}
                    </div>
                  </TableCell>
                  <TableCell className="text-foreground">{formatTime(shift.fechaApertura)}</TableCell>
                  <TableCell className="text-foreground">{formatTime(shift.fechaCierre)}</TableCell>
                  <TableCell className="text-muted-foreground">-</TableCell>
                  <TableCell className="text-right font-bold text-primary">
                    {usuario?.rol === 'admin' ? formatCurrency(shift.ventasEfectivo + shift.ventasOtrosMetodos) : '***'}
                  </TableCell>
                  <TableCell className="text-right">
                    {shift.estado === 'cerrado' && (
                      <span className={cn(
                        "font-medium",
                        shift.diferenciaEfectivo === 0 
                          ? "text-success" 
                          : shift.diferenciaEfectivo > 0 
                            ? "text-success" 
                            : "text-destructive"
                      )}>
                        {usuario?.rol === 'admin' ? (
                          shift.diferenciaEfectivo === 0 
                            ? '✓ Cuadrado' 
                            : formatCurrency(shift.diferenciaEfectivo)
                        ) : '***'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={cn(
                      shift.estado === 'abierto'
                        ? "bg-success/20 text-success border-success/30"
                        : "bg-secondary text-muted-foreground"
                    )}>
                      {shift.estado === 'abierto' ? 'Activo' : 'Cerrado'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleViewDetail(shift)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Open Shift Dialog */}
      <Dialog open={showOpenShift} onOpenChange={setShowOpenShift}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Play className="h-5 w-5 text-primary" />
              Apertura de Turno
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Ingresa la base de caja para iniciar tu turno
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Base de caja inicial</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={initialCash ? new Intl.NumberFormat('es-CO').format(parseInt(initialCash, 10)) : ''}
                onChange={(e) => setInitialCash(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="h-14 text-2xl text-center font-bold bg-input"
              />
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[100000, 200000, 300000, 500000].map(amount => (
                  <Button
                    key={amount}
                    variant="outline"
                    onClick={() => setInitialCash(amount.toString())}
                    className="text-xs"
                  >
                    {formatCurrency(amount)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas (opcional)</Label>
              <Textarea
                value={openNotes}
                onChange={(e) => setOpenNotes(e.target.value)}
                placeholder="Observaciones al iniciar el turno..."
                className="bg-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOpenShift(false)}>
              Cancelar
            </Button>
            <Button onClick={handleOpenShift} className="bg-primary text-primary-foreground">
              <Play className="h-4 w-4 mr-2" />
              Iniciar Turno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCloseShift} onOpenChange={setShowCloseShift}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[95vh] flex flex-col p-0 gap-0">
          <div className="p-6 pb-4">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2">
                <Square className="h-5 w-5 text-destructive" />
                Cierre de Turno
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Realiza el conteo de caja y cierra tu turno
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="space-y-4 px-6 overflow-y-auto custom-scrollbar flex-1 pb-4">
            {/* Shift summary */}
            <Card className="bg-secondary/30 border-border">
              <CardContent className="pt-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Entrada</p>
                    <p className="text-lg font-bold text-foreground">{formatTime(activeShift?.fechaApertura)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Base</p>
                    <p className="text-lg font-bold text-foreground">{formatCurrency(activeShift?.baseApertura || 0)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Ventas</p>
                    <p className="text-lg font-bold text-primary">{usuario?.rol === 'admin' ? formatCurrency(ventasTurno.total) : '***'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sales breakdown */}
            {usuario?.rol === 'admin' && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="p-3 bg-secondary/30 rounded-lg text-center">
                  <Banknote className="h-5 w-5 mx-auto mb-1 text-success" />
                  <p className="text-xs text-muted-foreground">Ventas Efectivo</p>
                  <p className="font-bold text-foreground">{formatCurrency(ventasTurno.efectivo)}</p>
                </div>
                <div className="p-3 bg-secondary/30 rounded-lg text-center">
                  <TrendingDown className="h-5 w-5 mx-auto mb-1 text-destructive" />
                  <p className="text-xs text-muted-foreground">Gastos (Egresos)</p>
                  <p className="font-bold text-foreground">-{formatCurrency(egresosTurno)}</p>
                </div>
                <div className="p-3 bg-secondary/30 rounded-lg text-center col-span-2 md:col-span-1">
                  <CreditCard className="h-5 w-5 mx-auto mb-1 text-primary" />
                  <p className="text-xs text-muted-foreground">Otros Medios</p>
                  <p className="font-bold text-foreground">{formatCurrency(ventasTurno.otros)}</p>
                </div>
              </div>
            )}

            <CloseShiftForm
              variant="compact"
              cashCount={cashCount}
              setCashCount={setCashCount}
              totalCashCount={totalCashCount}
              expectedCash={expectedCash}
              cashDifference={cashDifference}
              closeNotes={closeNotes}
              setCloseNotes={setCloseNotes}
              handoverTo={handoverTo}
              setHandoverTo={setHandoverTo}
              cajeros={cajeros}
              usuario={usuario}
              puedeCerrar={puedeCerrar}
              onSubmit={handleCloseShift}
              onCancel={() => setShowCloseShift(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Shift Detail Dialog */}
      <Dialog open={showShiftDetail} onOpenChange={setShowShiftDetail}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">Detalle del Turno</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {selectedShift?.cajeroNombre} - {formatDate(selectedShift?.fechaApertura)}
            </DialogDescription>
          </DialogHeader>
          
          {selectedShift && (
            <div className="space-y-4 py-4">
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-secondary/30 rounded-lg text-center flex flex-col justify-center">
                    <p className="text-xs text-muted-foreground mb-1">Base</p>
                    <p className="text-lg font-bold text-foreground">{formatCurrency(selectedShift.baseApertura)}</p>
                  </div>
                  <div className="p-3 bg-secondary/30 rounded-lg text-center flex flex-col justify-center">
                    <p className="text-xs text-muted-foreground mb-1">Vendido (Efectivo)</p>
                    <p className="text-lg font-bold text-success">{usuario?.rol === 'admin' ? `+${formatCurrency(selectedShift.ventasEfectivo)}` : '***'}</p>
                  </div>
                  <div className="p-3 bg-secondary/30 rounded-lg text-center flex flex-col justify-center">
                    <p className="text-xs text-muted-foreground mb-1">Gastos (Egresos)</p>
                    <p className="text-lg font-bold text-destructive">{usuario?.rol === 'admin' ? `-${formatCurrency(selectedShift.totalEgresos || 0)}` : '***'}</p>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-lg text-center flex flex-col justify-center">
                    <p className="text-xs text-primary/80 mb-1">Total Ventas</p>
                    <p className="text-lg font-bold text-primary">{usuario?.rol === 'admin' ? formatCurrency(selectedShift.ventasEfectivo + selectedShift.ventasOtrosMetodos) : '***'}</p>
                  </div>
                </div>
  
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-secondary/30 rounded-lg text-center">
                    <Banknote className="h-5 w-5 mx-auto mb-1 text-success" />
                    <p className="text-xs text-muted-foreground">Efectivo Esperado en Caja</p>
                    <p className="font-bold text-foreground text-lg">{usuario?.rol === 'admin' ? formatCurrency(selectedShift.baseApertura + selectedShift.ventasEfectivo - (selectedShift.totalEgresos || 0)) : '***'}</p>
                  </div>
                  <div className="p-3 bg-secondary/30 rounded-lg text-center">
                    <CreditCard className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <p className="text-xs text-muted-foreground">Otros Medios (Tarjetas, Transf)</p>
                    <p className="font-bold text-foreground text-lg">{usuario?.rol === 'admin' ? formatCurrency(selectedShift.ventasOtrosMetodos) : '***'}</p>
                  </div>
                </div>
              </CardContent>

              {/* Sales timeline */}
              <div className="space-y-2">
                <Label className="text-muted-foreground">Ventas por hora</Label>
                <div className="space-y-1">
                  {['8:00', '9:00', '10:00', '11:00', '12:00', '13:00'].map((hour, idx) => {
                    const percentage = [30, 65, 100, 85, 70, 45][idx]
                    return (
                      <div key={hour} className="flex items-center gap-2">
                        <span className="w-12 text-xs text-muted-foreground">{hour}</span>
                        <div className="flex-1 h-4 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => setShowShiftDetail(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
