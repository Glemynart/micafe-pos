"use client"

import { useEffect } from "react"

const KEEP_SW = new Set(["/firebase-push-sw.js"])

export function SwRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        const stale = regs.filter((r) => {
          const swUrl = new URL(r.active?.scriptURL || r.installing?.scriptURL || "", location.origin)
          return !KEEP_SW.has(swUrl.pathname) && swUrl.pathname !== "/sw.js"
        })
        return Promise.all(stale.map((r) => r.unregister()))
      }).then(() => {
        if (process.env.NODE_ENV === "production") {
          navigator.serviceWorker.register("/sw.js").catch(() => {})
        }
      })
    }
  }, [])
  return null
}
