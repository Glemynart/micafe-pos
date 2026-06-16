"use client"

import { useAuthContext } from "@/contexts/auth-context"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, type ReactNode } from "react"

const MARKETING_ALLOWED = ["/admin", "/admin/eventos"]

export function MarketingGuard({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuthContext()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (cargando || !usuario) return
    if (usuario.rol === "marketing") {
      const allowed = MARKETING_ALLOWED.some((p) => {
        // Permitir coincidencia exacta con /admin
        if (p === "/admin" && pathname === "/admin") return true;
        // Permitir subrutas válidas (ej. /admin/eventos)
        if (p !== "/admin" && pathname.startsWith(p)) return true;
        return false;
      })
      if (!allowed) {
        router.replace("/admin")
      }
    }
  }, [usuario, cargando, pathname, router])

  return <>{children}</>
}
