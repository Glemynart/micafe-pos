'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Calendar as CalendarIcon, Clock, User, Phone, CheckCircle2, XCircle, DollarSign } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { suscribirReservasActivas, completarReserva, cancelarReserva, Reserva } from '@/lib/reservas-service'
import { suscribirTurnoActivo, type Turno } from '@/lib/turnos-service'
import { useAuthContext } from '@/contexts/auth-context'

export function ReservasModule() {
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [turnoActivo, setTurnoActivo] = useState<Turno | null>(null)
  const { usuario } = useAuthContext()
  const initialLoadRef = useRef(true)

  useEffect(() => {
    if (!usuario?.uid) {
      setTurnoActivo(null)
      return
    }
    return suscribirTurnoActivo(usuario.uid, setTurnoActivo)
  }, [usuario?.uid])

  useEffect(() => {
    const unsub = suscribirReservasActivas((data, nuevas) => {
      setReservas(data)
      setCargando(false)

      if (initialLoadRef.current) {
        initialLoadRef.current = false
      } else if (nuevas && nuevas.length > 0) {
        // Reproducir sonido "ding"
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.type = 'sine'
          osc.frequency.setValueAtTime(880, ctx.currentTime) // Tono A5
          gain.gain.setValueAtTime(0.1, ctx.currentTime) // Volumen
          osc.start()
          gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5)
          osc.stop(ctx.currentTime + 0.5)
        } catch (err) {
          console.error("Audio no soportado o bloqueado", err)
        }

        // Mostrar notificación visual
        nuevas.forEach(n => {
          toast({
            title: '🔔 ¡NUEVA RESERVA WEB!',
            description: `${n.clienteNombre} ha reservado una sala.`,
            className: 'bg-emerald-500 text-white font-bold border-none'
          })
        })
      }
    })
    return () => unsub()
  }, [])

  const handleCompletar = async (reserva: Reserva) => {
    // MODELO B: cobrar una reserva pendiente exige un turno real abierto.
    const necesitaCobro = reserva.estadoPago !== 'pagado'
    if (necesitaCobro && !turnoActivo) {
      toast({
        title: 'Turno requerido',
        description: 'Abre un turno de caja para cobrar y completar esta reserva.',
        variant: 'destructive',
      })
      return
    }

    setProcesando(reserva.id)
    try {
      await completarReserva({
        reservaId: reserva.id,
        turnoId: turnoActivo?.id,
      })

      toast({
        title: '✅ Reserva completada',
        description: reserva.estadoPago === 'pagado'
          ? 'Reserva marcada como completada (pago ya registrado).'
          : `Ingreso de $${reserva.montoTotal.toLocaleString('es-CO')} registrado en caja.`,
      })
    } catch (err) {
      console.error('Error completando reserva:', err)
      toast({ title: 'Error', description: 'No se pudo completar la reserva.', variant: 'destructive' })
    } finally {
      setProcesando(null)
    }
  }

  const handleCancelar = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas cancelar esta reserva?')) return
    setProcesando(id)
    try {
      await cancelarReserva(id)
      toast({ title: 'Reserva cancelada', description: 'El horario quedó disponible nuevamente.' })
    } catch (err) {
      toast({ title: 'Error', description: 'No se pudo cancelar la reserva.', variant: 'destructive' })
    } finally {
      setProcesando(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Gestión de Reservas Web</h2>
        <p className="text-muted-foreground">Controla las salas reservadas por los clientes a través del portal de Wompi.</p>
      </div>

      {cargando ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : reservas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
              <CalendarIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-lg font-medium text-foreground">No hay reservas activas</p>
            <p className="text-sm text-muted-foreground">Las nuevas reservas aparecerán aquí automáticamente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reservas.map(reserva => (
            <Card key={reserva.id} className="overflow-hidden flex flex-col">
              <div className={`h-2 w-full ${reserva.estadoPago === 'pagado' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{reserva.clienteNombre}</CardTitle>
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <Phone className="h-3.5 w-3.5" /> {reserva.clienteTelefono}
                    </CardDescription>
                  </div>
                  <Badge variant={reserva.estadoPago === 'pagado' ? 'default' : 'secondary'} 
                    className={reserva.estadoPago === 'pagado' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-500 text-white hover:bg-amber-600'}>
                    {reserva.estadoPago === 'pagado' ? 'Pagado' : 'Pendiente'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm flex-1">
                <div className="flex justify-between items-center bg-muted/50 p-2 rounded-md">
                  <span className="text-muted-foreground">Sala/Mesa</span>
                  <span className="font-medium">{reserva.mesaId}</span>
                </div>
                <div className="flex justify-between items-center bg-muted/50 p-2 rounded-md">
                  <span className="text-muted-foreground">Fecha</span>
                  <span className="font-medium">{new Date(reserva.fechaInicio).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between items-center bg-muted/50 p-2 rounded-md">
                  <span className="text-muted-foreground">Horario</span>
                  <span className="font-medium">
                    {new Date(reserva.fechaInicio).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - 
                    {new Date(reserva.fechaFin).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="text-muted-foreground font-medium">Total</span>
                  <span className="font-bold text-lg">${reserva.montoTotal.toLocaleString('es-CO')}</span>
                </div>
              </CardContent>
              <div className="p-4 border-t bg-muted/20 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 bg-white hover:bg-red-50 hover:text-red-600 border-red-200"
                  disabled={procesando === reserva.id}
                  onClick={() => handleCancelar(reserva.id)}
                >
                  {procesando === reserva.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><XCircle className="h-4 w-4 mr-2" /> Cancelar</>
                  }
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  disabled={procesando === reserva.id}
                  onClick={() => handleCompletar(reserva)}
                >
                  {procesando === reserva.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><CheckCircle2 className="h-4 w-4 mr-2" /> Listo</>
                  }
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
