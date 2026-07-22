import type { Metadata, Viewport } from "next"
import { AdminGuard } from "@/components/pwa/admin-guard"
import { BottomNav } from "@/components/pwa/bottom-nav"
import { SwRegister } from "@/components/pwa/sw-register"
import { MarketingGuard } from "@/components/pwa/marketing-guard"
import { AdminHeader } from "@/components/pwa/admin-header"
import { IdleTimer } from "@/components/pwa/idle-timer"
import { FcmManagerWrapper } from "@/components/fcm-manager-wrapper"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#334155",
}

export const metadata: Metadata = {
  title: "POS Empresarial Admin",
  description: "Panel de administración empresarial",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "POS Empresarial",
  },
}

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <SwRegister />
      <MarketingGuard>
        <FcmManagerWrapper />
        <IdleTimer />
        <AdminHeader />
        <div className="min-h-[100dvh] bg-[#0a1628] pb-20">
          <main className="max-w-lg mx-auto px-4 pt-4">{children}</main>
          <BottomNav />
        </div>
      </MarketingGuard>
    </AdminGuard>
  )
}
