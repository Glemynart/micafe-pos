import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "MiCafe POS - Punto de Venta",
  description: "Sistema de punto de venta para cafeterias",
}

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
    </>
  )
}
