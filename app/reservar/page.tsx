'use client'

import React, { useState, useEffect } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ArrowLeft, CalendarDays, Clock, Users, Building, CreditCard } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import Link from 'next/link'
import Script from 'next/script'
import { getReservasMesa, crearReserva, Reserva } from '@/lib/reservas-service'
import { db } from '@/lib/firebase'
import { collection, getDocs } from 'firebase/firestore'
import { es } from 'date-fns/locale'

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

// Cada slot representa un BLOQUE de 1 hora.
// - Seleccionar solo 08:00 = reserva de 8:00 a 9:00 (1 hora).
// - Seleccionar 08:00 y 09:00 = reserva de 8:00 a 10:00 (2 horas).
const PRECIO_POR_HORA = 35000 // Ejemplo: $35.000 COP por hora

// Duración en horas: para N bloques seleccionados, la duración es N.
function duracionHoras(seleccionadas: string[]): number {
  if (seleccionadas.length === 0) return 0
  const indices = seleccionadas
    .map(h => HORARIOS.indexOf(h))
    .filter(i => i !== -1)
  if (indices.length === 0) return 0
  return Math.max(...indices) - Math.min(...indices) + 1
}

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
        // Extraer 'YYYY-MM-DD' en hora local para evitar desfases de UTC
        const year = fecha.getFullYear()
        const month = String(fecha.getMonth() + 1).padStart(2, '0')
        const day = String(fecha.getDate()).padStart(2, '0')
        const fechaLocalStr = `${year}-${month}-${day}`
        
        const reservas = await getReservasMesa(salaSeleccionada, fechaLocalStr)
        
        // Extraer horas ocupadas considerando el rango de tiempo
        const ocupadas: string[] = []
        reservas.forEach(r => {
          const rInicio = new Date(r.fechaInicio)
          const rFin = new Date(r.fechaFin)
          
          // Comparación local para no tener desfase de zona horaria con las 20:00 (que en UTC es el día siguiente)
          const esMismoDia = 
            rInicio.getFullYear() === fecha.getFullYear() &&
            rInicio.getMonth() === fecha.getMonth() &&
            rInicio.getDate() === fecha.getDate()
          
          if (esMismoDia) {
            const horaInicio = rInicio.getHours()
            const horaFin = rFin.getHours()
            
            // Si la reserva es de 08:00 a 10:00 (horaInicio 8, horaFin 10), 
            // los bloques ocupados son 08:00 y 09:00.
            for (let h = horaInicio; h < horaFin; h++) {
              const horaStr = h.toString().padStart(2, '0') + ':00'
              ocupadas.push(horaStr)
            }
          }
        })
        
        setHorasOcupadas(ocupadas)
        setHorasSeleccionadas([]) // reset selección si cambia fecha/sala
      } catch (error) {
        toast.error('Error', { description: 'No se pudo cargar la disponibilidad.' })
      } finally {
        setCargandoHorarios(false)
      }
    }
    
    checkDisponibilidad()
  }, [fecha, salaSeleccionada])

  // Wompi script is now loaded via next/script

  const toggleHora = (hora: string) => {
    if (horasOcupadas.includes(hora)) return

    setHorasSeleccionadas(prev => {
      // Estado 1: vacío → empezar
      if (prev.length === 0) return [hora]

      // Estado 2: un solo bloque seleccionado y el usuario hace clic en otro
      // → crear el rango entre los dos (si no pisa horas ocupadas)
      if (prev.length === 1) {
        if (prev[0] === hora) return [] // deseleccionar el único
        const todas = [...HORARIOS]
        const idxA = todas.indexOf(prev[0])
        const idxB = todas.indexOf(hora)
        if (idxA === -1 || idxB === -1) return prev
        const inicio = Math.min(idxA, idxB)
        const fin = Math.max(idxA, idxB)
        const rango = todas.slice(inicio, fin + 1)
        if (rango.some(h => horasOcupadas.includes(h))) return [hora]
        return rango
      }

      // Estado 3: ya hay un rango (length >= 2)
      //  - Si el usuario hace clic en una hora fuera del rango → reset a [hora]
      //  - Si hace clic en una hora dentro del rango → quitarla del rango
      if (prev.includes(hora)) {
        const next = prev.filter(h => h !== hora)
        // Si el rango queda con un solo bloque, lo dejamos así (1 seleccionado).
        // Si queda vacío, también está bien.
        return next
      }
      // Click fuera del rango actual → reemplazar
      return [hora]
    })
  }

  const calcularTotal = () => {
    return duracionHoras(horasSeleccionadas) * PRECIO_POR_HORA
  }

  // Calcula el rango visual (inicio / fin) basado en los bloques seleccionados.
  // Ej: si selecciona 08:00 y 09:00, el rango visual es 08:00 - 10:00.
  const calcularRangoVisual = (): { inicio: string; fin: string; duracion: number } | null => {
    if (horasSeleccionadas.length === 0) return null
    const todas = [...HORARIOS]
    const indices = horasSeleccionadas
      .map(h => todas.indexOf(h))
      .filter(i => i !== -1)
    if (indices.length === 0) return null
    
    const minIdx = Math.min(...indices)
    const maxIdx = Math.max(...indices)
    const duracion = maxIdx - minIdx + 1
    
    const inicioStr = todas[minIdx]
    // Para el fin, sumamos 1 hora a la última hora seleccionada
    const [horaMax] = todas[maxIdx].split(':')
    const finHoraNum = parseInt(horaMax, 10) + 1
    const finStr = `${finHoraNum.toString().padStart(2, '0')}:00`

    return {
      inicio: inicioStr,
      fin: finStr,
      duracion
    }
  }

  const procesarReserva = async () => {
    if (clienteNombre.trim().length < 3) {
      toast.error('Datos Inválidos', { description: 'Por favor ingresa tu nombre completo.' })
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(clienteEmail)) {
      toast.error('Datos Inválidos', { description: 'Por favor ingresa un correo electrónico válido.' })
      return
    }

    const phoneRegex = /^\+?[\d\s-]{7,15}$/
    if (!phoneRegex.test(clienteTelefono.trim())) {
      toast.error('Datos Inválidos', { description: 'Por favor ingresa un número de teléfono o WhatsApp válido.' })
      return
    }
    if (!window.WidgetCheckout) {
      toast.error('Error', { description: 'El widget de pagos aún está cargando...' })
      return
    }

    const pubKey = process.env.NEXT_PUBLIC_WOMPI_PUB_KEY
    if (!pubKey) {
      toast.success('Modo de Prueba', { description: 'No hay llave Wompi. Simulando pago y guardando la reserva (estado: Pendiente).' })
      setCargandoPago(true)
      try {
        await crearReservaBase()
        toast.success('Reserva Confirmada', { description: 'Tu espacio ha sido reservado con éxito.' })
        setPaso(3)
      } catch (err) {
        console.error('Error guardando reserva mock:', err)
        toast.error('Error', { description: 'Hubo un problema guardando la reserva.' })
      } finally {
        setCargandoPago(false)
      }
      return
    }

    setCargandoPago(true)
    
    // 1. Guardar la reserva inicial en Firebase (Pendiente)
    const reservaId = await crearReservaBase()

    // 2. Abrir Wompi
    const checkout = new window.WidgetCheckout({
      currency: 'COP',
      amountInCents: calcularTotal() * 100,
      reference: reservaId, // ID del doc en Firestore para que el webhook lo encuentre
      publicKey: pubKey,
      redirectUrl: `${window.location.origin}/reservar/estado`
    })

    checkout.open(function (result: any) {
      const transaction = result.transaction
      if (transaction.status === 'APPROVED') {
        crearReservaEnFirebase(transaction.id, reservaId)
      } else {
        toast.error('Pago Fallido', { description: 'La transacción no fue aprobada.' })
        setCargandoPago(false)
      }
    })
  }

  const crearReservaBase = async () => {
    // Modelo de bloques: cada slot es un BLOQUE de 1 hora.
    // Si el usuario seleccionó [08:00, 09:00], la reserva es de 8:00 a 10:00 (2h).
    const rango = calcularRangoVisual()
    if (!rango) throw new Error('Debe seleccionar al menos un horario.')

    const fechaInicio = new Date(fecha!)
    fechaInicio.setHours(parseInt(rango.inicio.split(':')[0], 10), 0, 0, 0)

    // La hora de fin ya viene calculada correctamente en el rango (+1 hora)
    const fechaFin = new Date(fecha!)
    fechaFin.setHours(parseInt(rango.fin.split(':')[0], 10), 0, 0, 0)

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
      if (reservaExistenteId) {
        const { actualizarEstadoPago } = await import('@/lib/reservas-service')
        await actualizarEstadoPago(reservaExistenteId, 'pagado', referenciaWompi)
      }
      toast.success('Reserva Confirmada', { description: 'Tu pago fue exitoso y la sala ha sido reservada.' })
      setPaso(3)
    } catch (err) {
      console.error('Error confirmando reserva:', err)
      toast.error('Error', { description: 'El pago se procesó pero hubo un error guardando la confirmación. Te contactaremos.' })
    } finally {
      setCargandoPago(false)
    }
  }

  return (
    <div className="reservar-page min-h-screen pb-12 relative overflow-hidden">
      <Script src="https://checkout.wompi.co/widget.js" strategy="lazyOnload" />
      {/* Botón flotante mobile: aparece cuando sala+fecha seleccionados, invita a ver agenda */}
      {paso === 1 && salaSeleccionada && fecha && (
        <div
          className="lg:hidden fixed bottom-6 left-1/2 z-50 animate-bounce"
          style={{ transform: 'translateX(-50%)' }}
        >
          <button
            onClick={() => {
              document.getElementById('horarios-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            style={{
              background: 'linear-gradient(135deg, #051D41 0%, #0a2659 100%)',
              color: '#F9B207',
              padding: '0.75rem 1.5rem',
              borderRadius: '9999px',
              fontWeight: 800,
              fontSize: '0.9rem',
              boxShadow: '0 8px 24px -4px rgba(5,29,65,0.5)',
              border: '2px solid rgba(249,178,7,0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            Ver horarios disponibles ↓
          </button>
        </div>
      )}

      {/* Background decorations for a premium look */}
      <div className="absolute top-0 left-0 w-full h-[300px] bg-[#051D41]/5 -skew-y-3 transform origin-top-left z-0"></div>
      <div className="absolute top-[-100px] right-[-100px] w-96 h-96 bg-[#F9B207]/15 rounded-full blur-3xl z-0 pointer-events-none"></div>
      <div className="absolute bottom-[-150px] left-[-100px] w-96 h-96 bg-[#051D41]/8 rounded-full blur-3xl z-0 pointer-events-none"></div>

      {/* Header simple */}
      <header className="bg-white/90 backdrop-blur-md border-b border-[#051D41]/10 py-3 px-4 md:py-4 md:px-6 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-2 md:gap-3">
          <Link href="/" className="text-[#051D41]/70 hover:text-[#051D41] transition-colors bg-[#051D41]/5 p-2 rounded-full hover:bg-[#F9B207]/15">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="font-bold text-[#051D41] text-lg md:text-xl font-sans tracking-tight hidden sm:inline">Reservar Sala</span>
          <span className="font-bold text-[#051D41] text-lg font-sans tracking-tight sm:hidden">Reservar</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Progress indicators */}
          {[1, 2, 3].map(p => (
            <div
              key={p}
              className={`h-2 w-8 rounded-full transition-all duration-300 ${p === paso ? 'reservar-progress-active' : p < paso ? 'reservar-progress-done' : 'reservar-progress-pending'}`}
            ></div>
          ))}
        </div>
      </header>

      <div className="reservar-container">
        {paso === 1 && (
          <div key="step1" className="reservar-step1-grid">
            {/* Selección Sala y Fecha */}
            <div className="reservar-step1-col">
              <Card className="reservar-card overflow-hidden">
                <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #051D41 0%, #F9B207 100%)' }}></div>
                <CardHeader style={{ padding: 0 }}>
                  <CardTitle className="reservar-title">
                    <span className="reservar-num">1</span>
                    Tu Espacio
                  </CardTitle>
                  <CardDescription className="reservar-desc">Escoge la sala que mejor se adapte a tu equipo</CardDescription>
                </CardHeader>
                <CardContent style={{ padding: 0 }}>
                  <Select value={salaSeleccionada} onValueChange={setSalaSeleccionada}>
                    <SelectTrigger
                      className={salaSeleccionada ? 'reservar-trigger-selected' : 'reservar-trigger-empty'}
                    >
                      <SelectValue placeholder="Elegir sala..." />
                    </SelectTrigger>
                    <SelectContent>
                      {salas.map(s => (
                        <SelectItem key={s.id} value={s.id} className="py-3 text-base cursor-pointer">
                          {s.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card
                className={`reservar-card transition-all duration-300 ${!salaSeleccionada ? 'opacity-50 grayscale pointer-events-none' : ''}`}
              >
                <CardHeader style={{ padding: 0 }}>
                  <CardTitle className="reservar-title">
                    <span className="reservar-num">2</span>
                    La Fecha
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex justify-center" style={{ padding: 0 }}>
                  <Calendar
                    mode="single"
                    selected={fecha}
                    onSelect={(d) => d && setFecha(d)}
                    className="rounded-xl p-3 shadow-sm"
                    style={{ border: '1px solid rgba(5, 29, 65, 0.10)', backgroundColor: '#ffffff' }}
                    locale={es}
                    formatters={{
                      formatWeekdayName: (day) => {
                        const days = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']
                        return days[day.getDay()]
                      },
                    }}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Agenda (Paso 1.5) */}
            <div id="horarios-section">
              <Card
                className={`reservar-card h-full transition-all duration-300 ${!fecha || !salaSeleccionada ? 'opacity-50 grayscale pointer-events-none translate-y-4' : ''}`}
                style={{ gap: '1rem' }}
              >
                <CardHeader style={{ padding: 0 }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="reservar-title" style={{ marginBottom: '0.5rem' }}>
                        <span className="reservar-num">3</span>
                        El Horario
                      </CardTitle>
                      <CardDescription className="reservar-desc flex items-center gap-2">
                        <Clock className="w-4 h-4" style={{ color: '#F9B207' }} />
                        Valor: <strong className="text-[#051D41]">${PRECIO_POR_HORA.toLocaleString('es-CO')} COP/hora</strong>
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col" style={{ padding: 0 }}>
                  {cargandoHorarios ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full blur-xl animate-pulse" style={{ backgroundColor: '#F9B207', opacity: 0.25 }}></div>
                        <Loader2 className="h-10 w-10 animate-spin relative z-10" style={{ color: '#051D41' }} />
                      </div>
                      <p className="text-sm font-medium animate-pulse" style={{ color: '#64748b' }}>Sincronizando agenda...</p>
                    </div>
                  ) : (
                    <>
                      <div className="reservar-hours-grid">
                        {HORARIOS.map(hora => {
                          const ocupada = horasOcupadas.includes(hora)
                          const seleccionada = horasSeleccionadas.includes(hora)
                          if (ocupada) {
                            return (
                              <button
                                key={hora}
                                disabled
                                className="reservar-hour-disabled touch-target"
                              >
                                <span>{hora}</span>
                                <span className="reservar-hour-label">Ocupado</span>
                              </button>
                            )
                          }
                          if (seleccionada) {
                            return (
                              <button
                                key={hora}
                                onClick={() => toggleHora(hora)}
                                className="reservar-hour-selected touch-target"
                              >
                                <span>{hora}</span>
                                <span className="reservar-hour-label" style={{ opacity: 0.9 }}>Seleccionado</span>
                              </button>
                            )
                          }
                          return (
                            <button
                              key={hora}
                              onClick={() => toggleHora(hora)}
                              className="reservar-hour-available touch-target"
                              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}
                            >
                              <span>{hora}</span>
                              <span className="reservar-hour-label" style={{ color: '#F9B207' }}>Libre</span>
                            </button>
                          )
                        })}
                      </div>

                      <div className="mt-auto">
                        <div className={`transition-all duration-500 overflow-hidden ${horasSeleccionadas.length > 0 ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                          <div className="reservar-total-box">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ opacity: 0.6 }}>Total a pagar</p>
                              <p className="text-3xl font-black" style={{ color: '#051D41' }}>${calcularTotal().toLocaleString('es-CO')}</p>
                            </div>
                            <div className="text-right">
                              <div
                                className="px-3 py-1 rounded-full text-sm font-bold shadow-sm inline-block mb-1"
                                style={{ backgroundColor: '#F9B207', color: '#051D41' }}
                              >
                                {(() => {
                                  const rango = calcularRangoVisual()
                                  if (rango) {
                                    return `${rango.inicio} - ${rango.fin} · ${rango.duracion}h`
                                  }
                                  return 'Selecciona inicio y fin'
                                })()}
                              </div>
                              <p className="text-xs font-medium" style={{ opacity: 0.6 }}>Impuestos incluidos</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
                <CardFooter className="pt-0" style={{ padding: 0 }}>
                  <Button
                    className="reservar-btn-primary"
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
          <div
            key="step2"
            className="animate-slide-right"
            style={{ maxWidth: '42rem', marginLeft: 'auto', marginRight: 'auto' }}
          >
            <Card className="reservar-card overflow-hidden" style={{ gap: '1.5rem' }}>
              <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #051D41 0%, #F9B207 100%)' }}></div>
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-3xl font-bold mb-2" style={{ color: '#051D41' }}>Tus Datos</CardTitle>
                <CardDescription className="text-base text-slate-500">Solo necesitamos esta información para enviar tu comprobante</CardDescription>
              </CardHeader>

              <CardContent className="pt-6" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Resumen — 2×2 grid */}
                <div
                  className="p-5 rounded-2xl border relative overflow-hidden"
                  style={{
                    background: 'linear-gradient(135deg, #051D41 0%, #0a2659 100%)',
                    borderColor: 'rgba(249,178,7,0.4)',
                    boxShadow: '0 8px 32px -8px rgba(5, 29, 65, 0.35)',
                  }}
                >
                  <div
                    className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl"
                    style={{ backgroundColor: 'rgba(249, 178, 7, 0.18)', transform: 'translate(30%, -30%)' }}
                  />
                  <h4 className="text-xs font-bold uppercase tracking-widest mb-4 relative z-10" style={{ color: '#F9B207' }}>Resumen de tu Reserva</h4>
                  <div
                    className="relative z-10"
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(249, 178, 7, 0.20)' }}>
                        <Building className="h-4 w-4" style={{ color: '#F9B207' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-white/50 font-medium mb-0.5">Espacio</p>
                        <p className="font-semibold text-sm text-white leading-tight truncate">{salas.find(s => s.id === salaSeleccionada)?.nombre}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(249, 178, 7, 0.20)' }}>
                        <CalendarDays className="h-4 w-4" style={{ color: '#F9B207' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-white/50 font-medium mb-0.5">Fecha</p>
                        <p className="font-semibold text-sm capitalize text-white leading-tight">{fecha?.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(249, 178, 7, 0.20)' }}>
                        <Clock className="h-4 w-4" style={{ color: '#F9B207' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-white/50 font-medium mb-0.5">Horario</p>
                        <p className="font-semibold text-sm text-white leading-tight">
                          {(() => {
                            const r = calcularRangoVisual()
                            if (r) return `${r.inicio} - ${r.fin} (${r.duracion}h)`
                            const u = horasSeleccionadas[0]
                            return u ? `${u} (1h)` : ''
                          })()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: 'rgba(249, 178, 7, 0.20)' }}>
                        <CreditCard className="h-4 w-4" style={{ color: '#F9B207' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-white/50 font-medium mb-0.5">Total</p>
                        <p className="font-black text-base leading-tight" style={{ color: '#F9B207' }}>${calcularTotal().toLocaleString('es-CO')}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Campos */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-semibold" style={{ color: '#051D41' }}>Nombre Completo</Label>
                    <Input
                      className="h-12 rounded-xl text-base border-2 bg-white focus:border-[#F9B207] transition-colors"
                      style={{ borderColor: 'rgba(5, 29, 65, 0.15)', color: '#051D41' }}
                      value={clienteNombre}
                      onChange={e => setClienteNombre(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold" style={{ color: '#051D41' }}>Correo Electrónico</Label>
                      <Input
                        type="email"
                        className="h-12 rounded-xl text-base border-2 bg-white focus:border-[#F9B207] transition-colors"
                        style={{ borderColor: 'rgba(5, 29, 65, 0.15)', color: '#051D41' }}
                        value={clienteEmail}
                        onChange={e => setClienteEmail(e.target.value)}
                        placeholder="juan@ejemplo.com"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-semibold" style={{ color: '#051D41' }}>Teléfono / WhatsApp</Label>
                      <Input
                        type="tel"
                        className="h-12 rounded-xl text-base border-2 bg-white focus:border-[#F9B207] transition-colors"
                        style={{ borderColor: 'rgba(5, 29, 65, 0.15)', color: '#051D41' }}
                        value={clienteTelefono}
                        onChange={e => setClienteTelefono(e.target.value)}
                        placeholder="300 123 4567"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>

              <CardFooter
                className="pt-4"
                style={{ display: 'flex', flexDirection: 'row', gap: '0.75rem', padding: '1rem 1.5rem 1.5rem' }}
              >
                <Button
                  variant="outline"
                  onClick={() => setPaso(1)}
                  className="h-14 rounded-xl font-semibold flex-[1]"
                  style={{ borderColor: 'rgba(5, 29, 65, 0.20)', color: '#051D41', backgroundColor: 'transparent' }}
                >
                  Volver
                </Button>
                <Button
                  className="h-14 rounded-xl font-bold text-base shadow-lg flex-[3] relative"
                  style={{ backgroundColor: '#F9B207', color: '#051D41' }}
                  disabled={!clienteNombre || !clienteEmail || !clienteTelefono || cargandoPago}
                  onClick={procesarReserva}
                >
                  {cargandoPago ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin" /> Procesando...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-3 w-full">
                      <span className="font-black text-lg">Pagar Seguro</span>
                      <span
                        className="px-3 py-1 rounded-full text-sm font-black"
                        style={{ backgroundColor: 'rgba(5, 29, 65, 0.15)' }}
                      >
                        ${calcularTotal().toLocaleString('es-CO')}
                      </span>
                    </div>
                  )}
                </Button>
              </CardFooter>
            </Card>

            <p className="text-center text-sm font-medium text-slate-500 mt-6 flex items-center justify-center gap-2">
              <LockIcon className="h-4 w-4 text-emerald-600" />
              Tus pagos están encriptados y procesados por <strong style={{ color: '#051D41' }}>Wompi Bancolombia</strong>
            </p>
          </div>
        )}

        {paso === 3 && (
          <div
            key="step3"
            className="animate-slide-up"
            style={{ maxWidth: '28rem', marginLeft: 'auto', marginRight: 'auto', textAlign: 'center', paddingTop: '2rem' }}
          >
            {/* Círculo del chulito - centrado con flex */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
              <div
                style={{
                  width: '6rem',
                  height: '6rem',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #F9B207 0%, #d99a06 100%)',
                  boxShadow: '0 0 40px rgba(249, 178, 7, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    backgroundColor: '#F9B207',
                    opacity: 0.2,
                    animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
                  }}
                />
                <svg style={{ width: '3rem', height: '3rem', color: '#051D41', position: 'relative', zIndex: 10 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <h2 className="text-4xl font-black mb-4 tracking-tight" style={{ color: '#051D41' }}>¡Reserva Exitosa!</h2>
            <p className="text-slate-600 text-lg mb-8 leading-relaxed">
              Hemos enviado tu comprobante a <br/><strong style={{ color: '#051D41' }}>{clienteEmail}</strong>
            </p>

            <div
              className="reservar-success-card"
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div className="absolute top-0 right-0 w-24 h-24 rounded-bl-full" style={{ backgroundColor: 'rgba(249, 178, 7, 0.15)' }}></div>

              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Espacio</span>
                <strong className="text-right max-w-[60%]" style={{ color: '#051D41' }}>{salas.find(s => s.id === salaSeleccionada)?.nombre}</strong>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Día</span>
                <strong style={{ color: '#051D41' }}>{fecha?.toLocaleDateString()}</strong>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Horario</span>
                <strong style={{ color: '#051D41' }}>
                  {(() => {
                    const r = calcularRangoVisual()
                    if (r) return `${r.inicio} - ${r.fin} (${r.duracion}h)`
                    const u = horasSeleccionadas[0]
                    return u ? `${u} (1h)` : ''
                  })()}
                </strong>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-slate-500 font-medium">Total</span>
                <strong className="text-xl font-black" style={{ color: '#F9B207' }}>${calcularTotal().toLocaleString('es-CO')}</strong>
              </div>
            </div>

            <a href="/">
              <Button
                className="w-full h-14 text-lg font-bold rounded-xl shadow-lg"
                style={{ backgroundColor: '#F9B207', color: '#051D41' }}
              >
                Volver al Inicio
              </Button>
            </a>
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
