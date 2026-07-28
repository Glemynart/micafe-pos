'use client'

import Link from 'next/link'
import { LoaderCircle, ShieldX } from 'lucide-react'
import { useSaaS } from '@/contexts/saas-context'
import { useConfiguracionEmpresa } from '@/contexts/configuracion-empresa-context'
import { Button } from '@/components/ui/button'
import type { ReactNode } from 'react'

/**
 * Frontera de presentación del plano tenant. Una identidad autenticada que
 * no tiene contexto tenant se rechaza localmente; no se invalida su sesión
 * Firebase, que puede ser válida para el Backoffice SaaS.
 */
export function TenantAccessGuard({ children }: { children: ReactNode }) {
  const { loading, accesoTenantDenegado, empresaId } = useSaaS()
  const { empresaId: empresaConfiguracionId, estado, error, proyecciones, refrescar } = useConfiguracionEmpresa()

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

  // Login, activación DIRECTA y rutas SaaS que comparten el layout no poseen
  // todavía una sesión tenant. Solo los hijos operativos exigen configuración.
  if (!empresaId) return <>{children}</>

  if (estado === "CARGANDO") {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-foreground">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" /> Cargando configuración empresarial…
        </div>
      </div>
    )
  }

  if (estado === "LISTA" && empresaConfiguracionId === empresaId && proyecciones) return <>{children}</>

  const detalle = estado === "AUSENTE"
    ? "Este tenant aún no tiene una configuración inicial."
    : estado === "INVALIDA"
      ? "La configuración empresarial no es válida."
      : estado === "ERROR"
        ? error?.message ?? "No fue posible cargar la configuración empresarial."
        : "No existe una configuración empresarial disponible."

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <div className="max-w-md rounded-2xl border border-rose-400/20 bg-card p-8 text-center shadow-sm">
        <ShieldX className="mx-auto mb-4 size-10 text-rose-500" />
        <h1 className="text-xl font-semibold">Configuración no disponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">{detalle}</p>
        <Button className="mt-6" onClick={() => { void refrescar() }}>Reintentar</Button>
      </div>
    </div>
  )

}
