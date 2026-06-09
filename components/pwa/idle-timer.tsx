"use client"

import { useEffect, useRef } from "react"
import { useAuthContext } from "@/contexts/auth-context"

const TIEMPO_MS = 7 * 60 * 1000

export function IdleTimer() {
  const { usuario, logout } = useAuthContext()
  const lastActivity = useRef(Date.now())

  useEffect(() => {
    if (!usuario) return

    let timer: ReturnType<typeof setTimeout>

    const doLogout = () => {
      console.log("[IdleTimer] Cerrando sesion por inactividad")
      logout()
    }

    const resetTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(doLogout, TIEMPO_MS)
    }

    const markActivity = () => {
      lastActivity.current = Date.now()
      resetTimer()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const elapsed = Date.now() - lastActivity.current
        if (elapsed >= TIEMPO_MS) {
          doLogout()
        } else {
          resetTimer()
        }
      }
    }

    const eventos = ["mousedown", "keydown", "touchstart", "scroll", "click", "pointerdown"]
    eventos.forEach(e => window.addEventListener(e, markActivity, { passive: true }))
    document.addEventListener("visibilitychange", onVisibilityChange)

    resetTimer()

    return () => {
      clearTimeout(timer)
      eventos.forEach(e => window.removeEventListener(e, markActivity))
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  return null
}
