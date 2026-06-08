"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import {
  ShoppingCart,
  Package,
  Truck,
  Users,
  History,
  BarChart3,
  Settings,
  Wallet,
} from "lucide-react"

interface SidebarNavProps {
  activeSection: string
  onSectionChange: (section: string) => void
}

const navItems = [
  { id: "vender", label: "Vender", icon: ShoppingCart },
  { id: "caja", label: "Cierre de Caja", icon: Wallet },
  { id: "inventario", label: "Inventario", icon: Package },
  { id: "proveedores", label: "Proveedores", icon: Truck },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "historial", label: "Historial", icon: History },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "configuracion", label: "Configuración", icon: Settings },
]

export function SidebarNav({ activeSection, onSectionChange }: SidebarNavProps) {
  const [storeName, setStoreName] = useState("MiTienda POS")
  const [ownerName, setOwnerName] = useState("Administrador")

  useEffect(() => {
    loadConfig()
    window.addEventListener('config-updated', loadConfig)
    return () => window.removeEventListener('config-updated', loadConfig)
  }, [])

  const loadConfig = async () => {
    try {
      if (typeof window !== "undefined" && (window as any).api) {
        const cfg = await (window as any).api.config.get()
        if (cfg) {
          if (cfg.nombre_tienda) setStoreName(cfg.nombre_tienda)
          if (cfg.nombre_propietario) setOwnerName(cfg.nombre_propietario)
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-slate-200 bg-slate-900">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-slate-800 px-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-white truncate">{storeName}</h1>
            <p className="text-xs text-slate-400">Punto de Venta</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.id
            return (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                  isActive
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-800 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-800/50 px-4 py-3">
            <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <span className="text-sm font-medium text-emerald-400">
                {getInitials(ownerName)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{ownerName}</p>
              <p className="text-xs text-slate-500">Administrador</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
