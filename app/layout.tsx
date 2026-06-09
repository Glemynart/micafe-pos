import type { Metadata } from 'next'
import { Inter, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/contexts/auth-context'
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
  title: 'Café Atrato - Coworking Cultural y Empresarial',
  description: 'Un espacio premium diseñado para profesionales que buscan productividad, comunidad y el mejor café tradicional',
  openGraph: {
    title: 'Café Atrato - Coworking Cultural y Empresarial',
    description: 'Un espacio premium diseñado para profesionales que buscan productividad, comunidad y el mejor café tradicional',
    type: 'website',
    locale: 'es_CO',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}
import { Toaster } from 'sonner'

import { ThemeProvider } from '@/components/theme-provider'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="bg-background" suppressHydrationWarning>
      <body className={`${inter.variable} ${geistMono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthProvider>
            {/* EspaciosProvider: gestiona el espacio activo del POS (dentro de AuthProvider) */}
            <EspaciosProvider>
              <UIProvider>
              <ModulosProvider>
                {children}
              </ModulosProvider>
              </UIProvider>
            </EspaciosProvider>
          </AuthProvider>
          <Toaster richColors position="top-center" expand={false} />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ThemeProvider>
      </body>
    </html>
  )
}
