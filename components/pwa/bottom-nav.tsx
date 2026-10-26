"use client"

import Link from "next/link"
import { useState } from "react"
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
  Boxes,
  ShoppingBag,
  Tags,
  PackagePlus,
  ClipboardCheck,
  Settings,
  Store,
  CircleDollarSign,
} from "lucide-react"
import { useConfiguracionEmpresa } from "@/contexts/configuracion-empresa-context"
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

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

const bodegaTabs = [
  { href: "/admin", label: "Inicio", icon: LayoutDashboard },
  { href: "/admin/catalogo", label: "Catálogo", icon: Tags },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/inventario", label: "Stock", icon: Boxes },
  { href: "/admin/ventas", label: "Ventas", icon: ShoppingBag },
  { href: "/admin/reportes", label: "Reportes", icon: BarChart3, modulo: "reports" },
]

const moreModulos = ["usuarios", "permisos", "mermas", "gastos", "cuentas_cobro", "compras"]

const bodegaDesktopTabs = [
  ...bodegaTabs,
  { href: "/admin/compras", label: "Compras", icon: PackagePlus },
  { href: "/admin/vender", label: "Registrar venta", icon: CircleDollarSign },
  { href: "/admin/solicitudes", label: "Solicitudes", icon: ClipboardCheck },
  { href: "/admin/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/admin/permisos", label: "Usuarios y permisos", icon: Settings },
]

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false)
  const pathname = usePathname()
  const { modulos } = useModulosHabilitados()
  const { usuario } = useAuthContext()
  const { vertical } = useConfiguracionEmpresa()
  const modSet = new Set(modulos)

  const tabs = vertical === "BODEGA_MVP1" && usuario?.rol === "admin"
    ? bodegaTabs.filter(t => !t.modulo || modSet.has(t.modulo))
    : usuario?.rol === "marketing"
    ? marketingTabs
    : adminTabs.filter((t) => !t.modulo || modSet.has(t.modulo))

  const isMoreActive = usuario?.rol !== "marketing" && moreModulos.some((m) => pathname.includes(m))
  const desktopTabs = vertical === "BODEGA_MVP1" && usuario?.rol === "admin"
    ? bodegaDesktopTabs
    : [...tabs, ...(usuario?.rol !== "marketing" ? [{ href: "/admin/usuarios", label: "Más herramientas", icon: Users }] : [])]

  return (
    <>
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/60 bg-card lg:flex">
      <div className="flex h-18 items-center gap-3 border-b border-border/60 px-6">
        <Store className="size-6 text-primary" aria-hidden="true" />
        <div><p className="text-lg font-bold tracking-tight">Dusema POS</p><p className="text-[10px] font-medium uppercase tracking-[.18em] text-muted-foreground">Espacio de trabajo</p></div>
      </div>
      <nav aria-label="Navegación principal de administración" className="flex-1 space-y-1 overflow-y-auto px-3 py-6">
        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Tu negocio</p>
        {desktopTabs.map(tab => {
          const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href)
          const Icon = tab.icon
          return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring", active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}><Icon className="size-[18px] shrink-0" aria-hidden="true" />{tab.label}</Link>
        })}
      </nav>
      <div className="m-4 rounded-xl bg-muted/40 p-4"><p className="text-xs font-semibold">Todo en un solo lugar</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Administra la operación de tu negocio desde cualquier dispositivo.</p></div>
    </aside>
    <nav aria-label="Navegación móvil de administración" className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-card/95 backdrop-blur-md safe-area-bottom lg:hidden">
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
              aria-current={isActive ? "page" : undefined}
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
        {vertical === "BODEGA_MVP1" && usuario?.rol === "admin" && <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild><button type="button" className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-muted-foreground"><span className="flex h-7 w-10 items-center justify-center rounded-xl"><Settings className="size-5" /></span><span className="text-[10px] font-medium">Más</span></button></SheetTrigger>
          <SheetContent side="bottom" className="max-h-[75dvh] overflow-y-auto rounded-t-2xl p-5">
            <SheetTitle className="text-left text-xl">Más herramientas</SheetTitle><SheetDescription className="text-left">Todo lo que necesitas para la operación de tu negocio.</SheetDescription>
            <div className="grid gap-2 pb-[env(safe-area-inset-bottom)]">{bodegaDesktopTabs.slice(5).map(item => <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} className="flex min-h-12 items-center gap-3 rounded-xl border border-border/60 px-4 py-3 text-sm font-medium"><item.icon className="size-5 text-primary" />{item.label}</Link>)}</div>
          </SheetContent>
        </Sheet>}
        {vertical !== "BODEGA_MVP1" && usuario?.rol !== "marketing" && (
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
    </>
  )
}
