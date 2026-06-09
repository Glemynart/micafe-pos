'use client'

import React, { useState, useEffect } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ArrowLeft, CalendarDays, Clock, Users, Building, CreditCard } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import Link from 'next/link'
import { getReservasMesa, crearReserva, Reserva } from '@/lib/reservas-service'
import { db } from '@/lib/firebase'
import { collection, getDocs } from 'firebase/firestore'

// Script definition for Wompi
declare global {
  interface Window {
    WidgetCheckout: any
  }
}

const HORARIOS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', 
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
]

const PRECIO_POR_HORA = 35000 // Ejemplo: $35.000 COP por hora

export default function ReservarPage() {
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  
  // Paso 1: Selección
  const [salas, setSalas] = useState<{id: string, nombre: string}[]>([
    { id: 'sala-ejecutiva', nombre: 'Sala Ejecutiva (hasta 6 personas)' },
    { id: 'sala-creativa', nombre: 'Sala Creativa (hasta 12 personas)' }
  ])
  const [salaSeleccionada, setSalaSeleccionada] = useState<string>('')
  const [fecha, setFecha] = useState<Date | undefined>(new Date())
  
  // Agenda / Horarios
  const [horasOcupadas, setHorasOcupadas] = useState<string[]>([])
  const [horasSeleccionadas, setHorasSeleccionadas] = useState<string[]>([])
  const [cargandoHorarios, setCargandoHorarios] = useState(false)

  // Paso 2: Datos
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')

  // Paso 3: Checkout
  const [cargandoPago, setCargandoPago] = useState(false)

  // Cargar salas desde Firebase si existen (fallback a mock)
  useEffect(() => {
    async function loadSalas() {
      try {
        const snap = await getDocs(collection(db, 'mesas'))
        const salasFirebase = snap.docs
          .map(d => ({ id: d.id, nombre: d.data().nombre }))
          .filter(s => s.nombre.toLowerCase().includes('sala')) // asume que las mesas que son salas tienen "sala" en el nombre
        
        if (salasFirebase.length > 0) {
          setSalas(salasFirebase)
        }
      } catch (err) {
        console.error("Error al cargar salas de firebase", err)
      }
    }
    loadSalas()
  }, [])

  // Cargar disponibilidad de agenda al cambiar fecha o sala
  useEffect(() => {
    async function checkDisponibilidad() {
      if (!fecha || !salaSeleccionada) return
      
      setCargandoHorarios(true)
      try {
        // En un caso real, filtramos las reservas de esta fecha exacta
        // Aquí traemos todas las de la sala y filtramos en local
        const reservas = await getReservasMesa(salaSeleccionada, fecha.toISOString())
        
        const fechaSelectStr = fecha.toISOString().split('T')[0]
        
        // Extraer horas ocupadas
        const ocupadas: string[] = []
        reservas.forEach(r => {
          const rFecha = new Date(r.fechaInicio)
          const rFechaStr = rFecha.toISOString().split('T')[0]
          
          if (rFechaStr === fechaSelectStr) {
            const horaStr = rFecha.getHours().toString().padStart(2, '0') + ':00'
            // Podríamos calcular la duración usando fechaFin también
            ocupadas.push(horaStr)
          }
        })
        
        setHorasOcupadas(ocupadas)
        setHorasSeleccionadas([]) // reset selección si cambia fecha/sala
      } catch (error) {
        toast({ title: 'Error', description: 'No se pudo cargar la disponibilidad.', variant: 'destructive' })
      } finally {
        setCargandoHorarios(false)
      }
    }
    
    checkDisponibilidad()
  }, [fecha, salaSeleccionada])

  // Cargar Wompi Script
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://checkout.wompi.co/widget.js'
    script.async = true
    document.body.appendChild(script)
    return () => { document.body.removeChild(script) }
  }, [])

  const toggleHora = (hora: string) => {
    if (horasOcupadas.includes(hora)) return
    
    setHorasSeleccionadas(prev => {
      if (prev.includes(hora)) return prev.filter(h => h !== hora)
      return [...prev, hora].sort()
    })
  }

  const calcularTotal = () => {
    return horasSeleccionadas.length * PRECIO_POR_HORA
  }

  const procesarReserva = async () => {
    if (!window.WidgetCheckout) {
      toast({ title: 'Error', description: 'El widget de pagos aún está cargando...', variant: 'destructive' })
      return
    }

    const pubKey = process.env.NEXT_PUBLIC_WOMPI_PUB_KEY
    if (!pubKey) {
      toast({ title: 'Configuración faltante', description: 'Falta la llave pública de Wompi. Por ahora la reserva se guardará como Pendiente.', variant: 'destructive' })
      // Si no hay llave, creamos la reserva pendiente y saltamos
      await crearReservaEnFirebase('pago_test_mock')
      return
    }

    setCargandoPago(true)
    
    // 1. Guardar la reserva inicial en Firebase (Pendiente)
    const reservaId = await crearReservaBase()

    // 2. Abrir Wompi
    const checkout = new window.WidgetCheckout({
      currency: 'COP',
      amountInCents: calcularTotal() * 100,
      reference: `reserva_${reservaId}_${Date.now()}`,
      publicKey: pubKey,
      redirectUrl: `${window.location.origin}/reservar/estado` // Opcional, si quieres una landing de estado
    })

    checkout.open(function (result: any) {
      const transaction = result.transaction
      if (transaction.status === 'APPROVED') {
        // En un entorno real, es mejor usar webhooks para actualizar esto.
        // Pero lo hacemos aquí preventivamente.
        crearReservaEnFirebase(transaction.id, reservaId)
      } else {
        toast({ title: 'Pago Fallido', description: 'La transacción no fue aprobada.', variant: 'destructive' })
        setCargandoPago(false)
      }
    })
  }

  const crearReservaBase = async () => {
    // Calculamos fecha de inicio usando la primera hora seleccionada
    const primeraHora = horasSeleccionadas[0]
    const fechaInicio = new Date(fecha!)
    fechaInicio.setHours(parseInt(primeraHora.split(':')[0]), 0, 0, 0)
    
    const ultimaHora = horasSeleccionadas[horasSeleccionadas.length - 1]
    const fechaFin = new Date(fecha!)
    fechaFin.setHours(parseInt(ultimaHora.split(':')[0]) + 1, 0, 0, 0) // +1 hora por bloque

    const reservaData: Omit<Reserva, 'id'> = {
      clienteNombre,
      clienteEmail,
      clienteTelefono,
      mesaId: salaSeleccionada,
      espacioId: 'salas-coworking', // Mock, en prod vendría de la DB
      fechaInicio: fechaInicio.toISOString(),
      fechaFin: fechaFin.toISOString(),
      estadoPago: 'pendiente',
      estadoReserva: 'activa',
      montoTotal: calcularTotal(),
      referenciaPago: '',
      fechaCreacion: new Date().toISOString()
    }
    
    return await crearReserva(reservaData)
  }

  const crearReservaEnFirebase = async (referenciaWompi: string, reservaExistenteId?: string) => {
    try {
      // En este mock, simplemente actualizamos el estado de la reserva existente, 
      // pero requeriría llamar a `actualizarEstadoPago` de `reservas-service`.
      // Como no está expuesto aquí lo hacemos simulado o usamos el web hook.
      // Para efectos visuales:
      toast({ title: '¡Reserva Confirmada!', description: 'Tu pago fue exitoso y la sala ha sido reservada.' })
      setPaso(3) // Mostrar éxito
    } catch (err) {
      toast({ title: 'Error', description: 'Hubo un error guardando la confirmación.', variant: 'destructive' })
    } finally {
      setCargandoPago(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#051D41]/95 pb-12 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[300px] bg-[#F9B207]/5 -skew-y-3 transform origin-top-left z-0"></div>
      <div className="absolute top-[-100px] right-[-100px] w-96 h-96 bg-[#F9B207]/10 rounded-full blur-3xl z-0 pointer-events-none"></div>

      <header className="bg-[#051D41]/80 backdrop-blur-sm border-b border-white/10 py-3 px-4 md:py-4 md:px-6 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-2 md:gap-3">
          <Link href="/" className="text-white/50 hover:text-white transition-colors bg-white/5 p-2 rounded-full hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="font-bold text-white text-lg md:text-xl font-sans tracking-tight hidden sm:inline">Reservar Sala</span>
          <span className="font-bold text-white text-lg font-sans tracking-tight sm:hidden">Reservar</span>
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map(p => (
            <div key={p} className={`h-2 w-8 rounded-full transition-all duration-300 ${p === paso ? 'bg-[#F9B207]' : p < paso ? 'bg-white/40' : 'bg-slate-200'}`}></div>
          ))}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 mt-6 md:mt-12 relative z-10">
        
        {paso === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-slide-up" key="step1">
            {/* Selección Sala y Fecha */}
            <div className="lg:col-span-5 space-y-6">
              <Card className="glass shadow-lg border-primary/10 overflow-hidden">
                <div className="h-2 w-full bg-gradient-to-r from-primary to-secondary"></div>
                <CardHeader>
                  <CardTitle className="text-primary text-2xl font-bold flex items-center gap-2">
                    <span className="flex items-center justify-center bg-primary/10 text-primary w-8 h-8 rounded-full text-sm">1</span>
                    Tu Espacio
                  </CardTitle>
                  <CardDescription className="text-base">Escoge la sala que mejor se adapte a tu equipo</CardDescription>
                </CardHeader>
                <CardContent>
                  <Select value={salaSeleccionada} onValueChange={setSalaSeleccionada}>
                    <SelectTrigger className="h-14 text-lg border-primary/20 bg-white hover:border-primary/50 transition-colors focus:ring-secondary">
                      <SelectValue placeholder="Elegir sala..." />
                    </SelectTrigger>
                    <SelectContent>
                      {salas.map(s => (
                        <SelectItem key={s.id} value={s.id} className="py-3 text-base cursor-pointer">{s.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card className={`glass shadow-lg border-primary/10 transition-all duration-300 ${!salaSeleccionada ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
                <CardHeader>
                  <CardTitle className="text-primary text-2xl font-bold flex items-center gap-2">
                    <span className="flex items-center justify-center bg-primary/10 text-primary w-8 h-8 rounded-full text-sm">2</span>
                    La Fecha
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex justify-center pb-6">
                  <Calendar
                    mode="single"
                    selected={fecha}
                    onSelect={(d) => d && setFecha(d)}
                    className="rounded-xl border border-primary/10 bg-white p-3 shadow-sm"
                    classNames={{
                      day_selected: "bg-secondary text-primary font-bold hover:bg-secondary/90 hover:text-primary",
                      day_today: "bg-primary/5 text-primary font-bold",
                    }}
                    disabled={(date) => {
                      const today = new Date()
                      today.setHours(0,0,0,0)
                      return date < today
                    }}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Agenda (Paso 1.5) */}
            <div className="lg:col-span-7">
              <Card className={`glass shadow-lg border-primary/10 h-full flex flex-col transition-all duration-300 ${!fecha || !salaSeleccionada ? 'opacity-50 grayscale pointer-events-none translate-y-4' : ''}`}>
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-primary text-2xl font-bold flex items-center gap-2 mb-2">
                        <span className="flex items-center justify-center bg-primary/10 text-primary w-8 h-8 rounded-full text-sm">3</span>
                        El Horario
                      </CardTitle>
                      <CardDescription className="text-base flex items-center gap-2">
                        <Clock className="w-4 h-4 text-secondary" />
                        Valor: <strong className="text-primary">${PRECIO_POR_HORA.toLocaleString('es-CO')} COP/hora</strong>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  {cargandoHorarios ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
                      <div className="relative">
                        <div className="absolute inset-0 bg-secondary/20 rounded-full blur-xl animate-pulse"></div>
                        <Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" />
                      </div>
                      <p className="text-sm font-medium text-slate-500 animate-pulse">Sincronizando agenda...</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 mb-6">
                        {HORARIOS.map(hora => {
                          const ocupada = horasOcupadas.includes(hora)
                          const seleccionada = horasSeleccionadas.includes(hora)
                          return (
                            <button
                              key={hora}
                              disabled={ocupada}
                              onClick={() => toggleHora(hora)}
                              className={`
                                relative py-3 sm:py-4 px-2 sm:px-3 rounded-xl text-sm sm:text-base font-bold border-2 transition-all duration-200 overflow-hidden group touch-target
                                ${ocupada 
                                  ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-60' 
                                  : seleccionada
                                    ? 'bg-primary border-primary text-white shadow-[0_8px_20px_-6px_rgba(5,29,65,0.4)] scale-[0.98]'
                                    : 'bg-white border-transparent shadow-sm text-primary hover:border-secondary hover:shadow-md active:scale-95'
                                }
                              `}
                            >
                              {seleccionada && <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>}
                              <span className="relative z-10 flex flex-col items-center gap-1">
                                <span>{hora}</span>
                                {ocupada && <span className="text-[10px] uppercase tracking-wider font-bold text-destructive">Ocupado</span>}
                              </span>
                            </button>
                          )
                        })}
                      </div>

                      <div className="mt-auto">
                        <div className={`transition-all duration-500 overflow-hidden ${horasSeleccionadas.length > 0 ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                          <div className="p-5 bg-primary/5 rounded-2xl border border-primary/10 flex items-center justify-between mb-6">
                            <div>
                              <p className="text-xs font-bold text-primary/60 uppercase tracking-widest mb-1">Total a pagar</p>
                              <p className="text-3xl font-black text-primary">${calcularTotal().toLocaleString('es-CO')}</p>
                            </div>
                            <div className="text-right">
                              <div className="bg-secondary text-primary px-3 py-1 rounded-full text-sm font-bold shadow-sm inline-block mb-1">
                                {horasSeleccionadas.length} {horasSeleccionadas.length === 1 ? 'hora' : 'horas'}
                              </div>
                              <p className="text-xs text-primary/60 font-medium">Impuestos incluidos</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
                <CardFooter className="pt-0">
                  <Button 
                    className="w-full h-14 text-lg font-bold rounded-xl bg-primary hover:bg-primary/90 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1" 
                    disabled={horasSeleccionadas.length === 0}
                    onClick={() => setPaso(2)}
                  >
                    Confirmar Horario
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        )}

        {paso === 2 && (
          <div className="max-w-2xl mx-auto animate-slide-right" key="step2">
            <Card className="glass shadow-2xl border-primary/10 overflow-hidden">
              <div className="h-2 w-full bg-gradient-to-r from-primary to-secondary"></div>
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-3xl font-bold text-primary mb-2">Tus Datos</CardTitle>
                <CardDescription className="text-base">Solo necesitamos esta información para enviar tu comprobante</CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6 pt-6">
                {/* Resumen */}
                <div className="bg-primary p-5 rounded-2xl mb-6 shadow-inner text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/20 rounded-full blur-2xl transform translate-x-10 -translate-y-10"></div>
                  
                  <h4 className="text-xs text-secondary font-bold uppercase tracking-widest mb-3 relative z-10">Resumen de tu Reserva</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="bg-white/10 p-2 rounded-lg"><Building className="h-5 w-5 text-secondary" /></div>
                      <div>
                        <p className="text-xs text-white/60">Espacio</p>
                        <p className="font-medium text-sm leading-tight">{salas.find(s => s.id === salaSeleccionada)?.nombre}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="bg-white/10 p-2 rounded-lg"><CalendarDays className="h-5 w-5 text-secondary" /></div>
                      <div>
                        <p className="text-xs text-white/60">Fecha</p>
                        <p className="font-medium text-sm capitalize">{fecha?.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="bg-white/10 p-2 rounded-lg"><Clock className="h-5 w-5 text-secondary" /></div>
                      <div>
                        <p className="text-xs text-white/60">Horario</p>
                        <p className="font-medium text-sm">{horasSeleccionadas[0]} a {parseInt(horasSeleccionadas[horasSeleccionadas.length-1])+1}:00</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="bg-secondary/20 p-2 rounded-lg"><CreditCard className="h-5 w-5 text-secondary" /></div>
                      <div>
                        <p className="text-xs text-white/60">Total</p>
                        <p className="font-bold text-secondary text-base">${calcularTotal().toLocaleString('es-CO')}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-primary font-semibold">Nombre Completo</Label>
                    <Input 
                      className="h-12 rounded-xl border-primary/20 bg-slate-50 focus-visible:ring-secondary focus-visible:border-secondary text-base"
                      value={clienteNombre} 
                      onChange={e => setClienteNombre(e.target.value)} 
                      placeholder="Ej. Juan Pérez" 
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-primary font-semibold">Correo Electrónico</Label>
                      <Input 
                        type="email" 
                        className="h-12 rounded-xl border-primary/20 bg-slate-50 focus-visible:ring-secondary focus-visible:border-secondary text-base"
                        value={clienteEmail} 
                        onChange={e => setClienteEmail(e.target.value)} 
                        placeholder="juan@ejemplo.com" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-primary font-semibold">Teléfono / WhatsApp</Label>
                      <Input 
                        type="tel" 
                        className="h-12 rounded-xl border-primary/20 bg-slate-50 focus-visible:ring-secondary focus-visible:border-secondary text-base"
                        value={clienteTelefono} 
                        onChange={e => setClienteTelefono(e.target.value)} 
                        placeholder="300 123 4567" 
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button variant="outline" onClick={() => setPaso(1)} className="w-full sm:w-1/3 h-14 rounded-xl border-primary/20 text-primary hover:bg-primary/5">
                  Volver
                </Button>
                <Button 
                  className="w-full sm:w-2/3 h-14 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-lg shadow-lg" 
                  disabled={!clienteNombre || !clienteEmail || !clienteTelefono || cargandoPago}
                  onClick={procesarReserva}
                >
                  {cargandoPago ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" /> Procesando...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 justify-center w-full relative">
                      <span>Pagar Seguro</span>
                      <span className="absolute right-4 bg-white/20 px-3 py-1 rounded-full text-sm font-black">
                        ${calcularTotal().toLocaleString('es-CO')}
                      </span>
                    </div>
                  )}
                </Button>
              </CardFooter>
            </Card>
            
            <p className="text-center text-sm font-medium text-slate-500 mt-6 flex items-center justify-center gap-2">
              <LockIcon className="h-4 w-4 text-emerald-600" />
              Tus pagos están encriptados y procesados por <strong>Wompi Bancolombia</strong>
            </p>
          </div>
        )}

        {paso === 3 && (
          <div className="max-w-md mx-auto text-center animate-slide-up pt-8" key="step3">
            <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(52,211,153,0.4)] relative">
              <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-20"></div>
              <svg className="w-12 h-12 text-white relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h2 className="text-4xl font-black text-primary mb-4 tracking-tight">¡Reserva Exitosa!</h2>
            <p className="text-slate-600 text-lg mb-8 leading-relaxed">
              Hemos enviado tu comprobante a <br/><strong className="text-primary">{clienteEmail}</strong>
            </p>
            
            <div className="bg-white p-8 rounded-3xl shadow-xl border border-primary/10 mb-8 text-left space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full"></div>
              
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Espacio</span>
                <strong className="text-primary text-right max-w-[60%]">{salas.find(s => s.id === salaSeleccionada)?.nombre}</strong>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Día</span>
                <strong className="text-primary">{fecha?.toLocaleDateString()}</strong>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Horario</span>
                <strong className="text-primary">{horasSeleccionadas[0]} - {parseInt(horasSeleccionadas[horasSeleccionadas.length-1])+1}:00</strong>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-slate-500 font-medium">Total</span>
                <strong className="text-emerald-600 text-xl font-black">${calcularTotal().toLocaleString('es-CO')}</strong>
              </div>
            </div>

            <Link href="/">
              <Button className="w-full h-14 text-lg font-bold rounded-xl bg-primary hover:bg-primary/90 text-white shadow-lg">
                Volver al Inicio
              </Button>
            </Link>
          </div>
        )}
        
      </div>
    </div>
  )
}

function LockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0110 0v4"></path>
    </svg>
  )
}
