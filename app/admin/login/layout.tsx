import type { Metadata, Viewport } from "next"

export const viewport: Viewport = {
  themeColor: "#051D41",
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cafe Atrato",
  },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
