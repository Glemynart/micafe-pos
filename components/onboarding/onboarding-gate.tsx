'use client'

import { useEffect, useState, useCallback } from 'react'
import { ShieldAlert, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OnboardingWizard } from './onboarding-wizard'
import { useSaaS } from '@/contexts/saas-context'
import { useConfiguracionEmpresa } from '@/contexts/configuracion-empresa-context'
import type { Usuario } from '@/lib/auth-service'
import type { EstadoReadinessTotal, EstadoVentaDemostracion } from '@/lib/onboarding/contrato'
import { OnboardingAccessProvider } from './onboarding-access-context'

interface OnboardingGateProps {
  usuario: Usuario
  children: React.ReactNode
}

export function OnboardingGate({ usuario, children }: OnboardingGateProps) {
  const { empresaId, loading: saasLoading } = useSaaS()
  const { refrescar: refrescarConfiguracion } = useConfiguracionEmpresa()
  const [cargandoReadiness, setCargandoReadiness] = useState(true)
  const [readinessTotal, setReadinessTotal] = useState<EstadoReadinessTotal | null>(null)
  const [ventaDemostracion, setVentaDemostracion] = useState<EstadoVentaDemostracion | null>(null)
  const [numeracionBorradorId, setNumeracionBorradorId] = useState<string>('num_pos_1')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [mostrarWizard, setMostrarWizard] = useState(false)

  const cargarReadiness = useCallback(async () => {
    setCargandoReadiness(true)
    setErrorText(null)
    try {
      const { httpsCallable, getFunctions } = await import('firebase/functions')
      const functions = getFunctions(undefined, 'us-central1')
      const fn = httpsCallable(functions, 'obtenerEstadoOnboarding')
      const res = (await fn()) as { data: { readinessTotal: EstadoReadinessTotal; numeracionBorrador: { numeracionId: string } | null; ventaDemostracion: EstadoVentaDemostracion } }

      setReadinessTotal(res.data.readinessTotal)
      setVentaDemostracion(res.data.ventaDemostracion ?? null)
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
    return <OnboardingAccessProvider modo="FISCAL">{children}</OnboardingAccessProvider>
  }

  const demoDisponible = Boolean(ventaDemostracion?.disponible)

  // Durante un Trial con fiscalidad pendiente se permite operar en modo DEMO.
  // La configuración real sigue disponible para administradores, pero nunca es
  // una condición para continuar ni se fabrican datos para desbloquearla.
  if (demoDisponible && !mostrarWizard) {
    const puedeConfigurar = usuario.rol === 'admin' || usuario.rol === 'supervisor'
    return (
      <OnboardingAccessProvider modo="DEMO">
        <div className="min-h-full">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <div className="flex items-start gap-2 text-amber-900 dark:text-amber-100">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Modo demostración activo</p>
                <p>Las ventas de este Trial son no fiscales: no consumen numeración ni generan factura electrónica, CUFE o efectos tributarios.</p>
              </div>
            </div>
            {puedeConfigurar ? (
              <Button variant="outline" size="sm" onClick={() => setMostrarWizard(true)}>
                Configurar fiscalidad ahora
              </Button>
            ) : null}
          </div>
          {children}
        </div>
      </OnboardingAccessProvider>
    )
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
          onCompletado={async () => {
            await refrescarConfiguracion()
            await cargarReadiness()
          }}
          onCancelar={demoDisponible ? () => setMostrarWizard(false) : undefined}
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
