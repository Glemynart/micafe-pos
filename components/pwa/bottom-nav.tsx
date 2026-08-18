"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuthContext } from "@/contexts/auth-context"
import { useModulosHabilitados } from "@/contexts/modulos-context"
import {
  LayoutDashboard,
  BarChart3,
  Clock,
  Users,
  CalendarDays,
  Landmark,
} from "lucide-react"

const adminTabs = [
  { href: "/admin", label: "Inicio", icon: LayoutDashboard },
  { href: "/admin/reportes", label: "Reportes", icon: BarChart3, modulo: "reports" },
  { href: "/admin/reservas", label: "Reservas", icon: CalendarDays, modulo: "reservas" },
  { href: "/admin/turnos", label: "Turnos", icon: Clock, modulo: "shifts" },
  { href: "/admin/finanzas", label: "Finanzas", icon: Landmark, modulo: "finanzas" },
]

const marketingTabs = [
  { href: "/admin", label: "Inicio", icon: LayoutDashboard },
  { href: "/admin/eventos", label: "Eventos", icon: CalendarDays },
]

const moreModulos = ["usuarios", "permisos", "mermas", "gastos", "cuentas_cobro", "compras"]

export function BottomNav() {
  const pathname = usePathname()
  const { modulos } = useModulosHabilitados()
  const { usuario } = useAuthContext()
  const modSet = new Set(modulos)

  const tabs = usuario?.rol === "marketing"
    ? marketingTabs
    : adminTabs.filter((t) => !t.modulo || modSet.has(t.modulo))

  const isMoreActive = usuario?.rol !== "marketing" && moreModulos.some((m) => pathname.includes(m))

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around max-w-lg mx-auto h-16 px-1">
        {tabs.map((tab) => {
          const isActive = tab.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(tab.href)
          const Icon = tab.icon
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 flex-1 h-full py-2 transition-colors duration-200 min-w-0",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary" />
              )}
              <span className={cn(
                "flex items-center justify-center w-10 h-7 rounded-xl transition-all duration-200",
                isActive ? "bg-primary/10" : ""
              )}>
                <Icon className="h-5 w-5" />
              </span>
              <span className={cn(
                "text-[10px] leading-none transition-all",
                isActive ? "font-bold" : "font-medium"
              )}>
                {tab.label}
              </span>
            </Link>
          )
        })}
        {usuario?.rol !== "marketing" && (
          <Link
            href="/admin/usuarios"
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 flex-1 h-full py-2 transition-colors duration-200 min-w-0",
              isMoreActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {isMoreActive && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary" />
            )}
            <span className={cn(
              "flex items-center justify-center w-10 h-7 rounded-xl transition-all duration-200",
              isMoreActive ? "bg-primary/10" : ""
            )}>
              <Users className="h-5 w-5" />
            </span>
            <span className={cn(
              "text-[10px] leading-none transition-all",
              isMoreActive ? "font-bold" : "font-medium"
            )}>
              Más
            </span>
          </Link>
        )}
      </div>
    </nav>
  )
}
