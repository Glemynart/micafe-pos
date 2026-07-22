import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "POS Empresarial",
  description: "Plataforma empresarial de punto de venta",
}

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
    </>
  )
}
