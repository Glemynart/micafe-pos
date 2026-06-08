"use client"

import { useEffect } from "react"

export function SwRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister())
      }).then(() => {
        if (process.env.NODE_ENV === "production") {
          navigator.serviceWorker.register("/sw.js").catch(() => {})
        }
      })
    }
  }, [])
  return null
}
