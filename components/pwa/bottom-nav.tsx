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
  Truck,
  Users,
  CalendarDays,
} from "lucide-react"

const adminTabs = [
  { href: "/admin", label: "Inicio", icon: LayoutDashboard, modulo: "reports" },
  { href: "/admin/reportes", label: "Reportes", icon: BarChart3, modulo: "reports" },
  { href: "/admin/turnos", label: "Turnos", icon: Clock, modulo: "shifts" },
  { href: "/admin/compras", label: "Compras", icon: Truck, modulo: "purchases" },
]

const marketingTabs = [
  { href: "/admin", label: "Inicio", icon: LayoutDashboard },
  { href: "/admin/eventos", label: "Eventos", icon: CalendarDays },
]

const moreModulos = ["usuarios", "permisos", "mermas", "cuentas_cobro"]

export function BottomNav() {
  const pathname = usePathname()
  const { modulos } = useModulosHabilitados()
  const { usuario } = useAuthContext()
  const modSet = new Set(modulos)

  const tabs = usuario?.rol === "marketing"
    ? marketingTabs
    : adminTabs.filter((t) => modSet.has(t.modulo))

  const isMoreActive = usuario?.rol !== "marketing" && moreModulos.some((m) => pathname.includes(m))

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around max-w-lg mx-auto h-16">
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
                "flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl transition-colors min-w-0",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">{tab.label}</span>
            </Link>
          )
        })}
        {usuario?.rol !== "marketing" && (
          <Link
            href="/admin/usuarios"
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-xl transition-colors min-w-0",
              isMoreActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-5 w-5" />
            <span className="text-[10px] font-medium leading-none">Mas</span>
          </Link>
        )}
      </div>
    </nav>
  )
}
