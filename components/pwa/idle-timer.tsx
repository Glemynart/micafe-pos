"use client"

import { useEffect } from "react"
import { useAuthContext } from "@/contexts/auth-context"

export function IdleTimer() {
  const { usuario, logout } = useAuthContext()

  useEffect(() => {
    if (!usuario) return
    const TIEMPO = 7 * 60 * 1000
    let timer: ReturnType<typeof setTimeout>

    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => logout(), TIEMPO)
    }

    const eventos = ["mousedown", "keydown", "touchstart", "scroll"]
    eventos.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      clearTimeout(timer)
      eventos.forEach(e => window.removeEventListener(e, reset))
    }
  }, [usuario, logout])

  return null
}