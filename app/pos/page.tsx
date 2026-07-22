'use client'

import { Loader2 } from 'lucide-react'
import { useAuthContext } from '@/contexts/auth-context'
import { GlobalCloseShift } from '@/components/pos/global-close-shift'
import { TurnoGate } from '@/components/pos/turno-gate'
import { Sidebar } from '@/components/pos/sidebar'
import { LoginScreen } from '@/components/pos/login-screen'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useModulosHabilitados } from '@/contexts/modulos-context'
import { ReservasBanner } from '@/components/pos/reservas-banner'
import { OnboardingGate } from '@/components/onboarding/onboarding-gate'
import dynamic from 'next/dynamic'

// ── Skeleton compartido para todos los módulos mientras cargan ──
const ModuleSkeleton = () => (
  <div className="flex items-center justify-center h-full min-h-[60vh]">
    <Loader2 className="h-7 w-7 animate-spin text-muted-foreground/50" />
  </div>
)

// ── Dynamic imports: cada módulo se descarga SOLO cuando el cajero lo abre ──
// El módulo de ventas carga primero (ssr:false porque usa Firebase client-side)
const SellModule         = dynamic(() => import('@/components/pos/sell-module').then(m => ({ default: m.SellModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const SalonModule        = dynamic(() => import('@/components/pos/salon-module').then(m => ({ default: m.SalonModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const KitchenModule      = dynamic(() => import('@/components/pos/kitchen-module').then(m => ({ default: m.KitchenModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const InventoryModule    = dynamic(() => import('@/components/pos/inventory-module').then(m => ({ default: m.InventoryModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const RecipesModule      = dynamic(() => import('@/components/pos/recipes-module').then(m => ({ default: m.RecipesModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const PurchasesModule    = dynamic(() => import('@/components/pos/purchases-module').then(m => ({ default: m.PurchasesModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const ReportsModule      = dynamic(() => import('@/components/pos/reports-module').then(m => ({ default: m.ReportsModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const ShiftsModule       = dynamic(() => import('@/components/pos/shifts-module').then(m => ({ default: m.ShiftsModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const WasteModule        = dynamic(() => import('@/components/pos/waste-module').then(m => ({ default: m.WasteModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const FinanzasModule     = dynamic(() => import('@/components/pos/finanzas-module').then(m => ({ default: m.FinanzasModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const EgresosModule      = dynamic(() => import('@/components/pos/egresos-module').then(m => ({ default: m.EgresosModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const CuentasCobroModule = dynamic(() => import('@/components/pos/cuentas-cobro-module').then(m => ({ default: m.CuentasCobroModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const ClientesModule     = dynamic(() => import('@/components/pos/clientes-module').then(m => ({ default: m.ClientesModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const ConsignacionesModule = dynamic(() => import('@/components/pos/consignaciones-module').then(m => ({ default: m.ConsignacionesModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const AlquileresModule   = dynamic(() => import('@/components/pos/alquileres-module').then(m => ({ default: m.AlquileresModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const ReservasModule     = dynamic(() => import('@/components/pos/reservas-module').then(m => ({ default: m.ReservasModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const Historial          = dynamic(() => import('@/components/pos/historial').then(m => ({ default: m.Historial })), { loading: () => <ModuleSkeleton />, ssr: false })
const PermissionsModule  = dynamic(() => import('@/components/pos/permissions-module').then(m => ({ default: m.PermissionsModule })), { loading: () => <ModuleSkeleton />, ssr: false })
const SettingsModule     = dynamic(() => import('@/components/pos/settings-module').then(m => ({ default: m.SettingsModule })), { loading: () => <ModuleSkeleton />, ssr: false })

export default function POSApp() {
  const { usuario, cargando, logout } = useAuthContext()
  const router = useRouter()
  const { modulos: modulosHabilitados, cargando: cargandoModulos } = useModulosHabilitados()
  const [activeModule, setActiveModule] = useState('sell')
  const [pendingPedidoId, setPendingPedidoId] = useState<string | null>(null)

  // La membresía ya contiene el conjunto efectivo; no se consulta la plantilla.
  const userPerms = useMemo(() => {
    return new Set(usuario?.permisos ?? [])
  }, [usuario?.permisos])

  const modulosSet = useMemo(() => new Set(modulosHabilitados), [modulosHabilitados])

  useEffect(() => {
    if (!usuario || cargandoModulos) return
    const permitidos = modulosHabilitados.filter((modulo) => userPerms.has(modulo))
    if (!permitidos.includes(activeModule)) setActiveModule(permitidos[0] ?? '')
  }, [activeModule, cargandoModulos, modulosHabilitados, userPerms, usuario])

  // ── Redirigir solo a marketing fuera del POS (admin puede entrar si lo desea) ──
  useEffect(() => {
    if (usuario && usuario.rol === 'marketing') {
      router.replace('/admin')
    }
  }, [usuario, router])

  // FASE-10C: se eliminó la auto-apertura de turno con base 0. El cajero ahora
  // debe abrir turno explícitamente con una base real (ver TurnoGate). Sin turno
  // abierto, el contenido del POS queda bloqueado.

  const setSafeModule = (moduleId: string) => {
    if (userPerms.has(moduleId) && modulosSet.has(moduleId)) {
      setActiveModule(moduleId)
      setPendingPedidoId(null)
    }
  }

  const handleAbrirPedido = useCallback((pedidoId: string) => {
    if (!userPerms.has('sell') || !modulosSet.has('sell')) return
    setPendingPedidoId(pedidoId)
    setActiveModule('sell')
  }, [modulosSet, userPerms])

  // ── Interceptar el cierre de sesión ──
  const handleLogoutAttempt = async () => {
    // Administradores salen de inmediato
    if (usuario?.rol === 'admin' || usuario?.rol === 'marketing') {
      logout()
      return
    }

    // Para cajeros, verificamos si tienen un turno abierto
    try {
      const { verificarTurnoActivo } = await import('@/lib/turnos-service')
      const tieneTurno = await verificarTurnoActivo(usuario!.uid)
      
      if (tieneTurno) {
        // Disparar evento para que el GlobalCloseShift modal se abra
        window.dispatchEvent(new CustomEvent('request_close_shift'))
      } else {
        // Si no tiene turno activo, sale sin problemas
        logout()
      }
    } catch (error) {
      // Si hay error de red, sale de todas formas
      logout()
    }
  }

  // ── Pantalla de carga inicial (Firebase verifica si hay sesión guardada) ──
  if (cargando) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20 animate-pulse">
          <Loader2 className="h-8 w-8 text-primary-foreground animate-spin" />
        </div>
        <p className="text-muted-foreground text-sm animate-pulse">Cargando CaféPOS...</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-8 text-xs text-muted-foreground underline"
        >
          ¿No carga? Clic aquí
        </button>
      </div>
    )
  }

  // ── Si no hay sesión activa, mostramos el login ──
  if (!usuario) {
    return <LoginScreen />
  }

  // ── Marketing no tiene acceso al POS — el useEffect ya redirige ──
  if (usuario.rol === 'marketing') {
    return null
  }

  // ── Módulo activo: memoizado para no redefinir en cada render ──
  const renderModule = () => {
    switch (activeModule) {
      case 'sell':             return <SellModule initialPedidoId={pendingPedidoId} />
      case 'salon':            return <SalonModule onAbrirPedido={handleAbrirPedido} />
      case 'kitchen':          return <KitchenModule />
      case 'inventory':        return <InventoryModule />
      case 'recipes':          return <RecipesModule />
      case 'purchases':        return <PurchasesModule />
      case 'reports':          return <ReportsModule />
      case 'shifts':           return <ShiftsModule />
      case 'waste':            return <WasteModule />
      case 'finanzas':         return <FinanzasModule />
      case 'gastos':           return <EgresosModule />
      case 'cuentas_cobro':    return <CuentasCobroModule />
      case 'clientes':         return <ClientesModule />
      case 'consignaciones':   return <ConsignacionesModule />
      case 'alquiler_dashboard': return <AlquileresModule />
      case 'reservas':         return <ReservasModule />
      case 'historial':        return <Historial />
      case 'permissions':      return <PermissionsModule />
      case 'settings':         return <SettingsModule />
      default:                 return <ModuleSkeleton />
    }
  }

  return (
    <div className="theme-pos flex h-screen bg-background overflow-hidden">
      <Sidebar
        activeModule={activeModule}
        onModuleChange={setSafeModule}
        onLogout={handleLogoutAttempt}
        usuario={usuario}
        modulosSet={modulosSet}
        userPerms={userPerms}
      />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <ReservasBanner setSafeModule={setSafeModule} userPerms={userPerms} />
        <div className="flex-1 flex flex-col min-h-0 relative animate-fade-in" key={activeModule}>
          <OnboardingGate usuario={usuario}>
            <TurnoGate usuario={usuario}>
              {renderModule()}
            </TurnoGate>
          </OnboardingGate>
        </div>
      </main>
      <GlobalCloseShift usuario={usuario} onCloseSuccess={logout} />
    </div>
  )
}
