'use client'

import { useState, useEffect } from 'react'
import { Store, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useAuthContext } from '@/contexts/auth-context'

const PARTICULAS = [
  { left: '18%', delay: '0s', duration: '3.2s', scale: 1 },
  { left: '35%', delay: '0.6s', duration: '3.5s', scale: 0.8 },
  { left: '52%', delay: '1.1s', duration: '3.0s', scale: 1.1 },
  { left: '28%', delay: '1.7s', duration: '3.4s', scale: 0.9 },
  { left: '46%', delay: '2.2s', duration: '3.1s', scale: 1 },
  { left: '62%', delay: '2.8s', duration: '3.6s', scale: 0.85 },
]

export function LoginScreen() {
  const { login, iniciandoSesion, errorLogin, limpiarError } = useAuthContext()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (errorLogin && (username || password)) limpiarError()
  }, [username, password])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    await login(username, password)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Orbes de fondo derivados del tema SaaS neutral. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[36rem] h-[36rem] bg-primary/10 rounded-full blur-[140px]" />
        <div className="absolute -bottom-40 -right-40 w-[40rem] h-[40rem] bg-secondary/70 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30rem] h-[30rem] bg-accent/10 rounded-full blur-[100px]" />
      </div>

      {/* Steam particles */}
      <div className="absolute inset-0 pointer-events-none">
        {PARTICULAS.map((p, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: p.left,
              bottom: '28%',
              animation: `steam ${p.duration} ease-in-out infinite`,
              animationDelay: p.delay,
              transform: `scale(${p.scale})`,
              opacity: 0,
            }}
          >
            <div className="w-2 h-10 bg-gradient-to-t from-primary/25 via-primary/10 to-transparent rounded-full blur-[2px]" />
          </div>
        ))}
      </div>

      <Card className="w-full max-w-sm mx-4 bg-card border-border shadow-2xl animate-scale-in relative z-10 rounded-2xl">
        <CardHeader className="text-center pb-1 pt-8">
          {/* Logo mark */}
          <div className="mx-auto mb-5 relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl scale-150" />
            <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center shadow-xl relative">
              <Store className="h-10 w-10 text-primary-foreground" strokeWidth={2.2} />
            </div>
          </div>

          <div className="space-y-0.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">POS Empresarial</h1>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Punto de venta</p>
          </div>
        </CardHeader>

        <CardContent className="px-8 pb-8 pt-6">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-muted-foreground">Código operativo</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ej. caja-01"
                className="h-12 bg-input border-border focus:border-primary focus:ring-primary/20 rounded-xl text-foreground placeholder:text-muted-foreground transition-all duration-200"
                autoComplete="username"
                disabled={iniciandoSesion}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-muted-foreground">PIN de 6 dígitos</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  inputMode="numeric"
                  maxLength={6}
                  className="h-12 pr-12 bg-input border-border focus:border-primary focus:ring-primary/20 rounded-xl text-foreground placeholder:text-muted-foreground transition-all duration-200"
                  autoComplete="current-password"
                  disabled={iniciandoSesion}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {errorLogin && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-scale-in"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="font-medium">{errorLogin}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 border-none"
              disabled={iniciandoSesion || !username.trim() || !password}
            >
              {iniciandoSesion ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ingresando...
                </span>
              ) : (
                'Iniciar Sesión'
              )}
            </Button>

            <p className="text-center text-[11px] text-muted-foreground pt-1">
              POS Empresarial
            </p>
          </form>
        </CardContent>
      </Card>

      <style>{`
        @keyframes steam {
          0%, 100% { transform: translateY(0) scale(var(--steam-scale, 1)); opacity: 0; }
          20% { opacity: 0.22; }
          50% { transform: translateY(-120px) scale(calc(var(--steam-scale, 1) * 0.7)); opacity: 0.08; }
          80% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
