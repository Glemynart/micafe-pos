import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Dusema POS",
  description: "Plataforma empresarial de punto de venta",
}

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
    </>
  )
}
