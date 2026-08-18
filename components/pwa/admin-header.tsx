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
    <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border px-4 h-14 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
          {logo ? (
            <img src={logo} alt="" className="h-6 w-6 rounded object-contain" />
          ) : (
            <Store className="h-4 w-4 text-primary-foreground" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground leading-none">{branding.nombreVisible}</p>
          <p className="text-[10px] text-muted-foreground">
            {usuario?.rol === "admin" ? "Admin" : usuario?.rol === "marketing" ? "Marketing" : usuario?.rol}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {usuario?.rol === "admin" && (
          <Link
            href="/admin/soporte-saas"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
          title="Cerrar sesion"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
