'use client'

import { useEffect, useRef, useState } from 'react'
import { Clock, Play, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { suscribirTurnoActivo, abrirTurno, type Turno } from '@/lib/turnos-service'
import { useConfiguracionEmpresa } from '@/contexts/configuracion-empresa-context'
import { formatCurrency } from '@/lib/demo-data'
import { toast } from 'sonner'
import type { Usuario } from '@/lib/auth-service'
import { mensajeErrorApertura } from '@/components/pos/apertura-turno-mensajes'

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
  const { proyecciones, empresaId } = useConfiguracionEmpresa()
  const requiereTurno = proyecciones?.caja.rolesConTurnoObligatorio.includes(usuario.rol) ?? false

  const [turno, setTurno] = useState<Turno | null>(null)
  const contextoTurnoRef = useRef<{ uid: string; empresaId: string } | null>(null)
  const [cargando, setCargando] = useState(true)
  const [base, setBase] = useState('')
  const [basePrellenada, setBasePrellenada] = useState(false)
  const [notas, setNotas] = useState('')
  const [abriendo, setAbriendo] = useState(false)
  const aperturaContextoRef = useRef<{ uid: string; empresaId: string } | null>(null)
  const preparandoAperturaRef = useRef(false)
  const preparandoContextoRef = useRef<{ uid: string; empresaId: string } | null>(null)
  const usuarioUidActualRef = useRef(usuario.uid)
  usuarioUidActualRef.current = usuario.uid
  const contextoActualRef = useRef<{ uid: string; empresaId: string } | null>(null)
  contextoActualRef.current = empresaId ? { uid: usuario.uid, empresaId } : null

  const esContextoActual = (contexto: { uid: string; empresaId: string }) =>
    contextoActualRef.current?.uid === contexto.uid && contextoActualRef.current.empresaId === contexto.empresaId

  const estadoTurnoEsActual = contextoTurnoRef.current !== null && esContextoActual(contextoTurnoRef.current)
  const turnoVisible = estadoTurnoEsActual ? turno : null
  const cargandoVisible = cargando || !estadoTurnoEsActual

  useEffect(() => {
    const contexto = empresaId ? { uid: usuario.uid, empresaId } : null
    contextoTurnoRef.current = null
    setTurno(null)
    setCargando(true)
    return () => {
      const contextoApertura = aperturaContextoRef.current
      const preparandoContexto = preparandoContextoRef.current
      if (contexto && ((contextoApertura?.uid === contexto.uid && contextoApertura.empresaId === contexto.empresaId) || (preparandoContexto?.uid === contexto.uid && preparandoContexto.empresaId === contexto.empresaId))) {
        aperturaContextoRef.current = null
        preparandoContextoRef.current = null
        preparandoAperturaRef.current = false
        setAbriendo(false)
      }
    }
  }, [usuario.uid, empresaId])

  useEffect(() => {
    if (!proyecciones) return
    if (!requiereTurno) {
      setCargando(false)
      return
    }
    if (!empresaId) return
    const contextoSuscripcion = { uid: usuario.uid, empresaId }
    let cancelado = false
    setCargando(true)
    const unsub = suscribirTurnoActivo(contextoSuscripcion.uid, (t) => {
      if (cancelado || !esContextoActual(contextoSuscripcion)) return
      contextoTurnoRef.current = contextoSuscripcion
      setTurno(t)
      setCargando(false)
      if (t && aperturaContextoRef.current?.uid === contextoSuscripcion.uid && aperturaContextoRef.current.empresaId === contextoSuscripcion.empresaId) {
        aperturaContextoRef.current = null
        preparandoContextoRef.current = null
        preparandoAperturaRef.current = false
        setAbriendo(false)
      }
    })
    return () => {
      cancelado = true
      unsub()
    }
  }, [usuario.uid, empresaId, requiereTurno, proyecciones])

  useEffect(() => {
    const sugerida = proyecciones?.caja.baseAperturaSugerida
    if (!requiereTurno || basePrellenada || !sugerida || sugerida <= 0) return
    setBase(sugerida.toString())
    setBasePrellenada(true)
  }, [requiereTurno, basePrellenada, proyecciones?.caja.baseAperturaSugerida])

  if (!proyecciones) {
    return <div className="flex items-center justify-center h-full min-h-[60vh]"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground/50" /></div>
  }

  // Roles sin arqueo: acceso directo.
  if (!requiereTurno) return <>{children}</>

  // Esperando el estado del turno: spinner (no parpadear el formulario).
  if (cargandoVisible) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground/50" />
      </div>
    )
  }

  // Con turno abierto: acceso normal al POS.
  if (turnoVisible) return <>{children}</>

  // Sin turno: pantalla bloqueante de apertura. La base es obligatoria.
  const baseNum = base === '' ? null : parseInt(base, 10)
  const baseValida = baseNum !== null && Number.isFinite(baseNum) && baseNum >= 0

  const handleAbrir = async () => {
    if (abriendo || preparandoAperturaRef.current) return
    if (!baseValida) {
      toast.error('Ingresa la base de caja para abrir el turno.')
      return
    }
    const contextoApertura = contextoActualRef.current
    if (!contextoApertura || contextoApertura.uid !== usuario.uid) return
    preparandoAperturaRef.current = true
    preparandoContextoRef.current = contextoApertura
    if (!esContextoActual(contextoApertura)) {
      preparandoAperturaRef.current = false
      preparandoContextoRef.current = null
      return
    }
    aperturaContextoRef.current = contextoApertura
    setAbriendo(true)
    preparandoAperturaRef.current = false
    preparandoContextoRef.current = null
    try {
      await abrirTurno({
        baseApertura: baseNum!,
        notasApertura: notas,
      })
      if (!esContextoActual(contextoApertura)) return
      // La suscripción detecta el nuevo turno y desbloquea automáticamente.
    } catch (err) {
      if (!esContextoActual(contextoApertura)) return
      toast.error(mensajeErrorApertura(err))
      if (aperturaContextoRef.current === contextoApertura) {
        aperturaContextoRef.current = null
        setAbriendo(false)
      }
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
            disabled={abriendo}
          />
          <div className="grid grid-cols-4 gap-2">
            {[100000, 200000, 300000, 500000].map((amount) => (
              <Button
                key={amount}
                type="button"
                variant="outline"
                onClick={() => setBase(amount.toString())}
                className="text-xs"
                disabled={abriendo}
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
            disabled={abriendo}
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
