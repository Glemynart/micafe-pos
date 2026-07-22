import type { Metadata, Viewport } from "next"
import { SwRegister } from "@/components/pwa/sw-register"

export const viewport: Viewport = {
  themeColor: "#334155",
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "POS Empresarial",
  },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <><SwRegister />{children}</>
}
