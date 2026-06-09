"use client"

import { useEffect } from "react"

export function SplashOverlay() {
  useEffect(() => {
    const el = document.getElementById("reservar-splash")
    if (!el) return

    const timer = setTimeout(() => {
      el.classList.add("reservar-splash-hide")
      setTimeout(() => el.remove(), 400)
    }, 600)

    return () => {
      clearTimeout(timer)
      el.classList.add("reservar-splash-hide")
      setTimeout(() => el.remove(), 100)
    }
  }, [])

  return null
}
