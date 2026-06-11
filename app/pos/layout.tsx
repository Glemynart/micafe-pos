import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "MiCafe POS - Punto de Venta",
  description: "Sistema de punto de venta para cafeterias",
}

import { FcmManagerWrapper } from "@/components/fcm-manager-wrapper"

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FcmManagerWrapper />
      {children}
    </>
  )
}
