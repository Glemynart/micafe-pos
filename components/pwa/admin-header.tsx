"use client"

import { useAuthContext } from "@/contexts/auth-context"
import { useConfiguracionEmpresa } from "@/contexts/configuracion-empresa-context"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Store, LogOut, Headphones } from "lucide-react"
import Link from "next/link"

export function AdminHeader() {
  const { usuario, logout } = useAuthContext()
  const { branding } = useConfiguracionEmpresa()
  const { resolvedTheme } = useTheme()
  const router = useRouter()

  const handleLogout = async () => {
    await logout()
    router.replace("/admin/login")
  }

  const initials = usuario?.nombre
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?"

  const logo = resolvedTheme === "dark"
    ? branding.logoOscuro ?? branding.logo
    : branding.logo

  return (
    <header className="sticky top-0 z-40 flex h-18 items-center justify-between gap-4 border-b border-border/60 bg-card/95 px-4 backdrop-blur-md sm:px-6 lg:px-10">
      <a href="#admin-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded-lg focus:bg-card focus:p-3">Ir al contenido</a>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          {logo ? (
            <img src={logo} alt="" className="h-6 w-6 rounded object-contain" />
          ) : (
            <Store className="h-4 w-4 text-primary-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground sm:text-base">{branding.nombreVisible}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {usuario?.rol === "admin" ? "Administración del negocio" : usuario?.rol === "marketing" ? "Marketing" : usuario?.rol}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-3">
        {usuario?.rol === "admin" && (
          <Link
            href="/admin/soporte-saas"
            className="flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Autorizaciones de soporte SaaS"
            title="Autorizaciones de soporte SaaS"
          >
            <Headphones className="h-4 w-4" />
          </Link>
        )}
        <div className="hidden sm:flex items-center gap-2">
          <Avatar className="h-7 w-7 ring-1 ring-border">
            <AvatarFallback className="text-[10px] bg-muted text-foreground font-bold">{initials}</AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground font-medium">{usuario?.nombre || usuario?.username}</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="Cerrar sesión"
          title="Cerrar sesion"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
