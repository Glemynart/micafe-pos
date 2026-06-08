"use client"

import { Image } from "lucide-react"

export function AdBanner() {
  return (
    <section className="py-10 bg-gradient-to-r from-primary via-primary/95 to-accent">
      <div className="container max-w-4xl mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              <Image className="w-7 h-7 text-secondary" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">¿Tienes un evento?</h3>
              <p className="text-white/70 text-sm">Promociona tu evento o taller en Cafe Atrato. Este espacio es para ti.</p>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-3 text-center">
            <p className="text-secondary text-2xl font-bold">¡Agenda tu proximo evento!</p>
            <p className="text-white/60 text-xs mt-1">Contactanos por WhatsApp o Instagram</p>
          </div>
        </div>
      </div>
    </section>
  )
}
