'use client'

import { useState, useEffect } from 'react'
import { Coffee, Eye, EyeOff, Loader2, AlertCircle, Sparkles } from 'lucide-react'
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
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[32rem] h-[32rem] bg-primary/4 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[36rem] h-[36rem] bg-accent/4 rounded-full blur-[130px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[28rem] h-[28rem] bg-primary/3 rounded-full blur-[100px]" />
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
            <div className="w-2 h-10 bg-gradient-to-t from-primary/30 via-primary/15 to-transparent rounded-full blur-[2px]" />
          </div>
        ))}
      </div>

      {/* Subtle noise texture overlay */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`,
        backgroundSize: '256px 256px',
      }} />

      <Card className="w-full max-w-md bg-card/70 backdrop-blur-2xl border-border/50 shadow-2xl shadow-primary/5 animate-scale-in relative z-10">
        <CardHeader className="text-center pb-1 pt-8">
          {/* Logo mark */}
          <div className="mx-auto mb-5 relative">
            <div className="absolute inset-0 bg-accent/20 rounded-full blur-2xl scale-150" />
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary via-primary to-accent flex items-center justify-center shadow-xl shadow-primary/25 relative">
              <Coffee className="h-10 w-10 text-primary-foreground" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h1 className="text-2xl font-bold tracking-tight text-foreground">MiCafé</h1>
              <Sparkles className="h-4 w-4 text-accent" />
            </div>
            <p className="text-sm text-muted-foreground font-medium">Sistema de Punto de Venta</p>
          </div>
        </CardHeader>

        <CardContent className="px-8 pb-8 pt-6">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-foreground/80">Usuario</Label>
              <div className="relative">
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Tu nombre de usuario"
                  className="h-12 pl-4 bg-secondary/50 border-border/80 focus:border-primary/60 rounded-xl text-foreground placeholder:text-muted-foreground/50 transition-all duration-200 focus:ring-2 focus:ring-primary/10"
                  autoComplete="username"
                  disabled={iniciandoSesion}
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-foreground/80">Contrasena</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="········"
                  className="h-12 pl-4 pr-12 bg-secondary/50 border-border/80 focus:border-primary/60 rounded-xl text-foreground placeholder:text-muted-foreground/50 transition-all duration-200 focus:ring-2 focus:ring-primary/10"
                  autoComplete="current-password"
                  disabled={iniciandoSesion}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-secondary/80"
                  aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {errorLogin && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive animate-scale-in"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="font-medium">{errorLogin}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/95 hover:to-primary/85 rounded-xl shadow-lg shadow-primary/20 transition-all duration-300 hover:shadow-xl hover:shadow-primary/25 hover:-translate-y-0.5 active:translate-y-0"
              disabled={iniciandoSesion || !username.trim() || !password}
            >
              {iniciandoSesion ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ingresando...
                </span>
              ) : (
                'Iniciar Sesion'
              )}
            </Button>

            <p className="text-center text-[11px] text-muted-foreground/60 pt-1">
              MiCafe POS v1.0
            </p>
          </form>
        </CardContent>
      </Card>

      <style>{`
        @keyframes steam {
          0%, 100% { transform: translateY(0) scale(var(--steam-scale, 1)); opacity: 0; }
          20% { opacity: 0.18; }
          50% { transform: translateY(-120px) scale(calc(var(--steam-scale, 1) * 0.7)); opacity: 0.06; }
          80% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
