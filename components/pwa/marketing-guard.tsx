"use client"

import { useAuthContext } from "@/contexts/auth-context"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, type ReactNode } from "react"

const MARKETING_ALLOWED = ["/admin", "/admin/eventos"]

function isAllowedForMarketing(pathname: string): boolean {
  return MARKETING_ALLOWED.some((p) => {
    if (p === "/admin" && pathname === "/admin") return true
    if (p !== "/admin" && pathname.startsWith(p)) return true
    return false
  })
}

export function MarketingGuard({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuthContext()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (cargando || !usuario) return
    if (usuario.rol === "marketing" && !isAllowedForMarketing(pathname)) {
      router.replace("/admin")
    }
  }, [usuario, cargando, pathname, router])

  // Render guard síncrono: evita que children monten y hagan fetch
  // antes de que el useEffect de redirect dispare.
  if (!cargando && usuario?.rol === "marketing" && !isAllowedForMarketing(pathname)) {
    return null
  }

  return <>{children}</>
}
