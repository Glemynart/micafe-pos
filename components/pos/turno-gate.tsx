'use client'

import { useEffect, useState } from 'react'
import { Clock, Play, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { suscribirTurnoActivo, abrirTurno, type Turno } from '@/lib/turnos-service'
import { formatCurrency } from '@/lib/demo-data'
import { toast } from 'sonner'
import type { Usuario } from '@/lib/auth-service'

// Roles que manejan efectivo y por tanto REQUIEREN un turno abierto para operar.
// admin / marketing / cocinero no pasan por el arqueo de caja.
const ROLES_CON_TURNO = new Set(['cajero', 'supervisor'])

interface TurnoGateProps {
  usuario: Usuario
  children: React.ReactNode
}

/**
 * FASE-10C — Compuerta de apertura obligatoria de turno.
 *
 * Para roles que manejan caja (cajero/supervisor), bloquea TODO el contenido del
 * POS hasta que exista un turno abierto con base declarada explícitamente.
 * Reemplaza la antigua auto-apertura silenciosa con base 0.
 *
 * Otros roles (admin, marketing, cocinero) pasan sin restricción.
 */
export function TurnoGate({ usuario, children }: TurnoGateProps) {
  const requiereTurno = ROLES_CON_TURNO.has(usuario.rol)

  const [turno, setTurno] = useState<Turno | null>(null)
  const [cargando, setCargando] = useState(true)
  const [base, setBase] = useState('')
  const [notas, setNotas] = useState('')
  const [abriendo, setAbriendo] = useState(false)

  useEffect(() => {
    if (!requiereTurno) {
      setCargando(false)
      return
    }
    setCargando(true)
    const unsub = suscribirTurnoActivo(usuario.uid, (t) => {
      setTurno(t)
      setCargando(false)
    })
    return unsub
  }, [usuario.uid, requiereTurno])

  // Roles sin arqueo: acceso directo.
  if (!requiereTurno) return <>{children}</>

  // Esperando el estado del turno: spinner (no parpadear el formulario).
  if (cargando) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground/50" />
      </div>
    )
  }

  // Con turno abierto: acceso normal al POS.
  if (turno) return <>{children}</>

  // Sin turno: pantalla bloqueante de apertura. La base es obligatoria.
  const baseNum = base === '' ? null : parseInt(base, 10)
  const baseValida = baseNum !== null && Number.isFinite(baseNum) && baseNum >= 0

  const handleAbrir = async () => {
    if (!baseValida) {
      toast.error('Ingresa la base de caja para abrir el turno.')
      return
    }
    setAbriendo(true)
    try {
      await abrirTurno({
        cajeroId: usuario.uid,
        cajeroNombre: usuario.nombre || 'Cajero',
        baseApertura: baseNum!,
        notasApertura: notas,
      })
      // La suscripción detecta el nuevo turno y desbloquea automáticamente.
    } catch (err) {
      console.error('Error abriendo turno:', err)
      toast.error('No se pudo abrir el turno. Intenta de nuevo.')
      setAbriendo(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center p-6 bg-secondary/10 overflow-y-auto">
      <div className="w-16 h-16 rounded-full bg-warning/20 flex items-center justify-center text-warning">
        <Clock className="h-8 w-8" />
      </div>
      <div className="space-y-1">
        <h2 className="text-2xl font-bold text-foreground">Abre tu turno</h2>
        <p className="text-muted-foreground max-w-md">
          Para acceder a la caja debes abrir un turno e ingresar la base de efectivo
          con la que inicias. No podrás registrar ventas sin un turno abierto.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-4 text-left">
        <div className="space-y-2">
          <Label>Base de caja inicial</Label>
          <Input
            type="text"
            inputMode="numeric"
            value={base ? new Intl.NumberFormat('es-CO').format(parseInt(base, 10)) : ''}
            onChange={(e) => setBase(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            className="h-14 text-2xl text-center font-bold bg-input"
            autoFocus
          />
          <div className="grid grid-cols-4 gap-2">
            {[100000, 200000, 300000, 500000].map((amount) => (
              <Button
                key={amount}
                type="button"
                variant="outline"
                onClick={() => setBase(amount.toString())}
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
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Observaciones al iniciar el turno..."
            className="bg-input resize-none"
          />
        </div>

        <Button
          onClick={handleAbrir}
          disabled={!baseValida || abriendo}
          className="w-full h-12 bg-primary text-primary-foreground font-bold"
        >
          {abriendo ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Iniciar Turno
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
