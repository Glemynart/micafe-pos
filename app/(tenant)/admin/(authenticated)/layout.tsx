import type { Metadata, Viewport } from "next"
import { AdminGuard } from "@/components/pwa/admin-guard"
import { BottomNav } from "@/components/pwa/bottom-nav"
import { SwRegister } from "@/components/pwa/sw-register"
import { MarketingGuard } from "@/components/pwa/marketing-guard"
import { AdminHeader } from "@/components/pwa/admin-header"
import { IdleTimer } from "@/components/pwa/idle-timer"
import { FcmManagerWrapper } from "@/components/fcm-manager-wrapper"
import { CommercialProfileGate } from "@/components/tenant-profile/commercial-profile-gate"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#334155",
}

export const metadata: Metadata = {
  title: "Dusema POS · Administración",
  description: "Panel de administración empresarial",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Dusema POS",
  },
}

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGuard>
      <SwRegister />
      <MarketingGuard>
        <IdleTimer />
        <div className="tenant-admin min-h-[100dvh] bg-background pb-24 lg:pb-8 lg:pl-64">
          <AdminHeader />
          <main id="admin-content" className="@container mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9"><FcmManagerWrapper /><CommercialProfileGate>{children}</CommercialProfileGate></main>
          <BottomNav />
        </div>
      </MarketingGuard>
    </AdminGuard>
  )
}
