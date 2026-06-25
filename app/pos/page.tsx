'use client'

import { Loader2 } from 'lucide-react'
import { useAuthContext } from '@/contexts/auth-context'
import { GlobalCloseShift } from '@/components/pos/global-close-shift'
import { TurnoGate } from '@/components/pos/turno-gate'
import { Sidebar } from '@/components/pos/sidebar'
import { LoginScreen } from '@/components/pos/login-screen'
import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useModulosHabilitados } from '@/contexts/modulos-context'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { ReservasBanner } from '@/components/pos/reservas-banner'
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
  const { modulos: modulosHabilitados } = useModulosHabilitados()
  const [activeModule, setActiveModule] = useState('sell')

  // Suscripcion reactiva a permisos del rol desde Firestore
  const [rolePermisos, setRolePermisos] = useState<string[]>([])
  useEffect(() => {
    if (!usuario?.rol) return
    const unsub = onSnapshot(
      doc(db, "permisos_roles", usuario.rol),
      (snap) => { setRolePermisos(snap.exists() ? (snap.data().permisos || []) : []) },
      () => {} // silencioso en error, usa fallback
    )
    return unsub
  }, [usuario?.uid, usuario?.rol])

  // Merge permisos: role doc de Firestore es la fuente autoritativa.
  // Per-user overrides solo si difieren del role doc.
  const userPerms = useMemo(() => {
    const perUser = usuario?.permisos
    let finalPerms = new Set<string>()
    // Fuente 1: role doc de Firestore (se actualiza en tiempo real)
    if (rolePermisos.length > 0) {
      // Si el usuario tiene permisos que NO coinciden con el rol → override per-user
      const roleSet = new Set(rolePermisos)
      // Override per-usuario solo si el usuario tiene permisos FUERA del rol (custom grants).
      // Si el rol creció (nuevos módulos), todos heredan sin necesidad de actualizar cada usuario.
      const perUserDiffers = perUser && perUser.some(m => !roleSet.has(m))
      finalPerms = perUserDiffers ? new Set(perUser!) : roleSet
    } else if (perUser && perUser.length > 0) {
      // Fuente 2: permisos del doc del usuario (estáticos hasta refresh)
      finalPerms = new Set(perUser)
    } else {
      // Fuente 3: fallback hardcoded (solo si no hay nada en Firestore)
      finalPerms = new Set(["sell"])
    }
    
    // Inyectar 'reservas' por retrocompatibilidad
    if (usuario?.rol === 'admin' || usuario?.rol === 'cajero') {
      finalPerms.add('reservas')
    }
    
    return finalPerms
  }, [usuario?.permisos, usuario?.rol, rolePermisos])

  const modulosSet = useMemo(() => new Set(modulosHabilitados), [modulosHabilitados])

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
    }
  }

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
      case 'sell':             return <SellModule />
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
      default:                 return <SellModule />
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
          <TurnoGate usuario={usuario}>
            {renderModule()}
          </TurnoGate>
        </div>
      </main>
      <GlobalCloseShift usuario={usuario} onCloseSuccess={logout} />
    </div>
  )
}
