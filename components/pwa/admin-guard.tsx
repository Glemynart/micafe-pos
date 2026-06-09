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
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#060e1a]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-white/20" />
          <p className="text-sm text-white/30">Verificando acceso...</p>
        </div>
      </div>
    )
  }

  if (!usuario) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#060e1a]">
        <p className="text-white/30">Redirigiendo...</p>
      </div>
    )
  }

  if (usuario.rol !== 'admin' && usuario.rol !== 'marketing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-[#060e1a] gap-3 p-6">
        <ShieldAlert className="h-12 w-12 text-red-400" />
        <p className="text-lg font-semibold text-white">Acceso denegado</p>
        <p className="text-sm text-white/40 text-center">
          Solo administradores y equipo de marketing pueden acceder.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
