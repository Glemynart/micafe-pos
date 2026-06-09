import type { Metadata } from "next"
import "../globals.css"
import "../landing.css"

export const metadata: Metadata = {
  title: "Reservar Sala - Cafe Atrato",
  description: "Reserva nuestra sala de juntas en Cafe Atrato Coworking Cultural y Empresarial",
}

export default function ReservarLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#051D41]/95">{children}</div>
}
