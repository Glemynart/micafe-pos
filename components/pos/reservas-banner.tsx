'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar, ChevronRight } from 'lucide-react'
import { suscribirReservasActivas, type Reserva } from '@/lib/reservas-service'

interface ReservasBannerProps {
  setSafeModule: (moduleId: string) => void
  userPerms: Set<string>
}

type ReservaPrioridad =
  | { tipo: 'en_curso'; reserva: Reserva }
  | { tipo: 'proxima'; reserva: Reserva; minutosRestantes: number }
  | { tipo: 'futuras'; cantidad: number; proxima: Reserva }

function clasificarReservas(reservas: Reserva[], ahora: Date): ReservaPrioridad | null {
  const pagadasActivas = reservas.filter(
    r => r.estadoPago === 'pagado' && r.estadoReserva === 'activa' && new Date(r.fechaFin) >= ahora
  )

  if (pagadasActivas.length === 0) return null

  const enCurso = pagadasActivas.find(
    r => new Date(r.fechaInicio) <= ahora && new Date(r.fechaFin) >= ahora
  )
  if (enCurso) return { tipo: 'en_curso', reserva: enCurso }

  const futuras = pagadasActivas
    .filter(r => new Date(r.fechaInicio) > ahora)
    .sort((a, b) => new Date(a.fechaInicio).getTime() - new Date(b.fechaInicio).getTime())

  if (futuras.length === 0) return null

  const proxima = futuras[0]
  const minutos = Math.round((new Date(proxima.fechaInicio).getTime() - ahora.getTime()) / 60000)

  if (minutos <= 60) {
    return { tipo: 'proxima', reserva: proxima, minutosRestantes: minutos }
  }

  return { tipo: 'futuras', cantidad: futuras.length, proxima }
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

export function ReservasBanner({ setSafeModule, userPerms }: ReservasBannerProps) {
  const [reservas, setReservas] = useState<Reserva[]>([])
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    const unsub = suscribirReservasActivas((data) => {
      setReservas(data)
    })
    return unsub
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const handleVerReservas = useCallback(() => {
    if (userPerms.has('reservas')) {
      setSafeModule('reservas')
    }
  }, [setSafeModule, userPerms])

  const prioridad = clasificarReservas(reservas, ahora)

  if (!prioridad) return null

  return (
    <div className="w-full shrink-0 border-b bg-card/80 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          {prioridad.tipo === 'en_curso' && (
            <>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shrink-0">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </span>
              <p className="text-sm font-medium truncate">
                <span className="text-emerald-600 font-semibold">Reserva en curso</span>
                {' '}
                <span className="text-muted-foreground">
                  {prioridad.reserva.clienteNombre} · hasta {formatHora(prioridad.reserva.fechaFin)}
                </span>
              </p>
            </>
          )}

          {prioridad.tipo === 'proxima' && (
            <>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-600 shrink-0">
                <Calendar className="h-3.5 w-3.5" />
              </span>
              <p className="text-sm font-medium truncate">
                <span className="text-amber-600 font-semibold">Próxima reserva</span>
                {' '}
                <span className="text-muted-foreground">
                  {prioridad.reserva.clienteNombre} · {formatHora(prioridad.reserva.fechaInicio)}
                </span>
                <span className="ml-2 text-xs text-amber-600">
                  En {prioridad.minutosRestantes} min
                </span>
              </p>
            </>
          )}

          {prioridad.tipo === 'futuras' && (
            <>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600 shrink-0">
                <Calendar className="h-3.5 w-3.5" />
              </span>
              <p className="text-sm font-medium truncate">
                <span className="text-blue-600 font-semibold">
                  {prioridad.cantidad} reserva{prioridad.cantidad > 1 ? 's' : ''} programada{prioridad.cantidad > 1 ? 's' : ''}
                </span>
                <span className="hidden sm:inline text-muted-foreground">
                  {' · '}Próxima: {prioridad.proxima.clienteNombre} · {formatHora(prioridad.proxima.fechaInicio)}
                </span>
              </p>
            </>
          )}
        </div>

        {userPerms.has('reservas') && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs gap-1"
            onClick={handleVerReservas}
          >
            Ver reservas
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
