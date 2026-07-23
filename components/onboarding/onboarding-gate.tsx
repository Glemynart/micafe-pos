'use client'

import { useEffect, useState, useCallback } from 'react'
import { ShieldAlert, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OnboardingWizard } from './onboarding-wizard'
import { useSaaS } from '@/contexts/saas-context'
import type { Usuario } from '@/lib/auth-service'
import type { EstadoReadinessTotal } from '@/lib/onboarding/contrato'

interface OnboardingGateProps {
  usuario: Usuario
  children: React.ReactNode
}

export function OnboardingGate({ usuario, children }: OnboardingGateProps) {
  const { empresaId, loading: saasLoading } = useSaaS()
  const [cargandoReadiness, setCargandoReadiness] = useState(true)
  const [readinessTotal, setReadinessTotal] = useState<EstadoReadinessTotal | null>(null)
  const [numeracionBorradorId, setNumeracionBorradorId] = useState<string>('num_pos_1')
  const [errorText, setErrorText] = useState<string | null>(null)

  const cargarReadiness = useCallback(async () => {
    setCargandoReadiness(true)
    setErrorText(null)
    try {
      const { httpsCallable, getFunctions } = await import('firebase/functions')
      const functions = getFunctions(undefined, 'us-central1')
      const fn = httpsCallable(functions, 'obtenerEstadoOnboarding')
      const res = (await fn()) as { data: { readinessTotal: EstadoReadinessTotal; numeracionBorrador: { numeracionId: string } | null } }

      setReadinessTotal(res.data.readinessTotal)
      if (res.data.numeracionBorrador?.numeracionId) {
        setNumeracionBorradorId(res.data.numeracionBorrador.numeracionId)
      }
    } catch (err: any) {
      console.error('Error al cargar readiness de onboarding:', err)
      setErrorText(err.message || 'No se pudo consultar la disponibilidad del negocio.')
    } finally {
      setCargandoReadiness(false)
    }
  }, [])

  useEffect(() => {
    cargarReadiness()
  }, [cargarReadiness])

  if (cargandoReadiness || saasLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground/50" />
      </div>
    )
  }

  // Si hubo error de consulta o no se pudo cargar, permitir reintento
  if (errorText && !readinessTotal) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-4">
        <ShieldAlert className="w-12 h-12 text-destructive" />
        <p className="text-muted-foreground">{errorText}</p>
        <Button onClick={cargarReadiness} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" /> Reintentar
        </Button>
      </div>
    )
  }

  // Si el readiness total está completo, permitir acceso al contenido
  if (readinessTotal?.listo) {
    return <>{children}</>
  }

  // Si el readiness no está listo y el usuario es admin / owner -> Mostrar Wizard
  if (usuario.rol === 'admin' || usuario.rol === 'supervisor') {
    if (!empresaId) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-4">
          <ShieldAlert className="w-12 h-12 text-destructive" />
          <p className="text-muted-foreground">Sesión no asociada a una empresa válida. Por favor, vuelve a iniciar sesión.</p>
        </div>
      )
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/10 p-4">
        <OnboardingWizard
          empresaId={empresaId}
          readinessTotal={readinessTotal!}
          numeracionBorradorId={numeracionBorradorId}
          onCompletado={cargarReadiness}
        />
      </div>
    )
  }

  // Si es cajero / operativo sin permisos de configuración -> Pantalla informativa
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center p-6 bg-secondary/10">
      <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-600">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-2xl font-bold text-foreground">Configuración Fiscal Requerida</h2>
        <p className="text-muted-foreground">
          Tu empresa está lista en suscripción, pero el administrador debe completar la identidad fiscal y la numeración POS antes de iniciar ventas.
        </p>
      </div>
      <Button onClick={cargarReadiness} variant="outline" className="gap-2">
        <RefreshCw className="w-4 h-4" /> Verificar disponibilidad nuevamente
      </Button>
    </div>
  )
}
