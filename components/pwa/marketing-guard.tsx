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
      const allowed = MARKETING_ALLOWED.some((p) => pathname.startsWith(p))
      if (!allowed) {
        router.replace("/admin")
      }
    }
  }, [usuario, cargando, pathname, router])

  return <>{children}</>
}
