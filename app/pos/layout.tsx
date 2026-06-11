import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "MiCafe POS - Punto de Venta",
  description: "Sistema de punto de venta para cafeterias",
}

import dynamic from 'next/dynamic'

const FcmManager = dynamic(() => import('@/components/fcm-manager').then(mod => mod.FcmManager), { ssr: false })

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FcmManager />
      {children}
    </>
  )
}
