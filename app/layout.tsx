import type { Metadata } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import { AuthProvider } from '@/contexts/auth-context'
import { SaaSProvider } from '@/contexts/saas-context'
import { EspaciosProvider } from '@/contexts/espacios-context'
import { UIProvider } from '@/contexts/ui-context'
import { ModulosProvider } from '@/contexts/modulos-context'
import './globals.css'

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter"
});
const geistMono = Geist_Mono({ 
  subsets: ["latin"],
  variable: "--font-mono"
});

export const metadata: Metadata = {
  title: 'POS Empresarial',
  description: 'Plataforma empresarial de punto de venta',
  openGraph: {
    title: 'POS Empresarial',
    description: 'Plataforma empresarial de punto de venta',
    type: 'website',
    locale: 'es_CO',
  },
}
import { Toaster } from 'sonner'
import { Toaster as ShadcnToaster } from '@/components/ui/toaster'

import { ThemeProvider } from '@/components/theme-provider'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="bg-background" suppressHydrationWarning>
      <body className={`${inter.variable} ${geistMono.variable} font-sans antialiased`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthProvider>
            {/* SaaSProvider: runtime SaaS (MT-U2) — inmediatamente bajo AuthProvider */}
            <SaaSProvider>
              {/* EspaciosProvider: gestiona el espacio activo del POS (dentro de AuthProvider) */}
              <EspaciosProvider>
                <UIProvider>
                <ModulosProvider>
                  {children}
                </ModulosProvider>
                </UIProvider>
              </EspaciosProvider>
            </SaaSProvider>
          </AuthProvider>
          <ShadcnToaster />
          <Toaster richColors position="top-center" expand={false} />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ThemeProvider>
      </body>
    </html>
  )
}
