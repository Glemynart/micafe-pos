import { AuthProvider } from '@/contexts/auth-context'
import { SaaSProvider } from '@/contexts/saas-context'
import { EspaciosProvider } from '@/contexts/espacios-context'
import { UIProvider } from '@/contexts/ui-context'
import { ModulosProvider } from '@/contexts/modulos-context'
import { TenantAccessGuard } from '@/components/tenant/tenant-access-guard'

export default function TenantLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <AuthProvider>
      {/* SaaSProvider: runtime SaaS (MT-U2) — inmediatamente bajo AuthProvider */}
      <SaaSProvider>
        <TenantAccessGuard>
          {/* EspaciosProvider: gestiona el espacio activo del POS (dentro de AuthProvider) */}
          <EspaciosProvider>
            <UIProvider>
              <ModulosProvider>
                {children}
              </ModulosProvider>
            </UIProvider>
          </EspaciosProvider>
        </TenantAccessGuard>
      </SaaSProvider>
    </AuthProvider>
  )
}
