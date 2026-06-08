"use client"

import { useAuthContext } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
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
    <header className="sticky top-0 z-40 bg-card border-b border-border px-4 h-14 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
          <Coffee className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground leading-none">MiCafe</p>
          <p className="text-[10px] text-muted-foreground">
            {usuario?.rol === "admin" ? "Admin" : usuario?.rol === "marketing" ? "Marketing" : usuario?.rol}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground font-medium">{usuario?.nombre || usuario?.username}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          title="Cerrar sesion"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
