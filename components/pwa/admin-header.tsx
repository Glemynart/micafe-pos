"use client"

import { useAuthContext } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Coffee, LogOut } from "lucide-react"

export function AdminHeader() {
  const { usuario, logout } = useAuthContext()
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

  return (
    <header className="sticky top-0 z-40 bg-[#0a1628]/95 backdrop-blur-sm border-b border-white/5 px-4 h-14 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F9B207] to-[#e6a100] flex items-center justify-center shadow-lg shadow-[#F9B207]/20">
          <Coffee className="h-4 w-4 text-[#051D41]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-none">Cafe Atrato</p>
          <p className="text-[10px] text-white/50">
            {usuario?.rol === "admin" ? "Admin" : usuario?.rol === "marketing" ? "Marketing" : usuario?.rol}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2">
          <Avatar className="h-7 w-7 ring-1 ring-white/10">
            <AvatarFallback className="text-[10px] bg-white/10 text-white font-bold">{initials}</AvatarFallback>
          </Avatar>
          <span className="text-xs text-white/60 font-medium">{usuario?.nombre || usuario?.username}</span>
        </div>
        <button
          onClick={handleLogout}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-white/40 hover:text-red-400 hover:bg-white/5 transition-colors"
          title="Cerrar sesion"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
