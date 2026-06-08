import type { Metadata, Viewport } from "next"
import { AdminGuard } from "@/components/pwa/admin-guard"
import { BottomNav } from "@/components/pwa/bottom-nav"
import { SwRegister } from "@/components/pwa/sw-register"
import { MarketingGuard } from "@/components/pwa/marketing-guard"
import { AdminHeader } from "@/components/pwa/admin-header"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#6b4c3b",
}

export const metadata: Metadata = {
  title: "MiCafe Admin",
  description: "Panel de administracion remoto MiCafe",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MiCafe Admin",
  },
}

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <SwRegister />
      <MarketingGuard>
        <AdminHeader />
        <div className="min-h-[100dvh] bg-background pb-20">
          <main className="max-w-lg mx-auto">{children}</main>
          <BottomNav />
        </div>
      </MarketingGuard>
    </AdminGuard>
  )
}
