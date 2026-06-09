import type { Metadata } from "next"
import "../globals.css"

export const metadata: Metadata = {
  title: "Reservar Sala - Cafe Atrato",
  description: "Reserva nuestra sala de juntas en Cafe Atrato Coworking Cultural y Empresarial",
}

export default function ReservarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
