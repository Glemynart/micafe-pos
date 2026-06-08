'use client'

import { useAuthContext } from '@/contexts/auth-context'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'

export function AdminGuard({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuthContext()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (cargando) return
    if (!usuario) {
      router.replace(`/admin/login?from=${encodeURIComponent(pathname)}`)
      return
    }
    if (usuario.rol !== 'admin' && usuario.rol !== 'marketing') {
      router.replace('/admin/login?error=not_admin')
    }
  }, [usuario, cargando, router, pathname])

  if (cargando) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20 animate-pulse">
            <Loader2 className="h-6 w-6 text-primary-foreground animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Verificando acceso...</p>
        </div>
      </div>
    )
  }

  if (!usuario) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-background">
        <p className="text-muted-foreground">Redirigiendo...</p>
      </div>
    )
  }

  if (usuario.rol !== 'admin' && usuario.rol !== 'marketing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-background gap-3 p-6">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <p className="text-lg font-semibold text-foreground">Acceso denegado</p>
        <p className="text-sm text-muted-foreground text-center">
          Solo administradores y equipo de marketing pueden acceder.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
