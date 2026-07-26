'use client'

import Link from 'next/link'
import { LoaderCircle, ShieldX } from 'lucide-react'
import { useSaaS } from '@/contexts/saas-context'
import { Button } from '@/components/ui/button'
import type { ReactNode } from 'react'

/**
 * Frontera de presentación del plano tenant. Una identidad autenticada que
 * no tiene contexto tenant se rechaza localmente; no se invalida su sesión
 * Firebase, que puede ser válida para el Backoffice SaaS.
 */
export function TenantAccessGuard({ children }: { children: ReactNode }) {
  const { loading, accesoTenantDenegado } = useSaaS()

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-foreground">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" /> Verificando acceso al tenant…
        </div>
      </div>
    )
  }

  if (accesoTenantDenegado) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100">
        <div className="max-w-md rounded-2xl border border-rose-400/20 bg-slate-900 p-8 text-center shadow-2xl">
          <ShieldX className="mx-auto mb-4 size-10 text-rose-400" />
          <h1 className="text-xl font-semibold">Acceso no permitido</h1>
          <p className="mt-2 text-sm text-slate-400">
            Esta identidad no tiene una sesión activa para este tenant.
          </p>
          <Button className="mt-6" asChild>
            <Link href="/backoffice">Volver al Backoffice</Link>
          </Button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
