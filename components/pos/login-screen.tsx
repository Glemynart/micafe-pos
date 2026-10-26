'use client'

import { WorkspaceWelcome } from "@/components/pwa/workspace-welcome"
import { useState, useEffect } from 'react'
import { Store, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { ActivacionCredencial } from '@/components/auth/activacion-credencial'
import { useAuthContext } from '@/contexts/auth-context'

export function LoginScreen() {
  const { login, iniciandoSesion, errorLogin, limpiarError, activacionPendiente } = useAuthContext()
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
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      <WorkspaceWelcome label="Punto de venta" />
      <div className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-10">
      <Card className="w-full max-w-md rounded-2xl border-border/70 bg-card shadow-xs">
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
          {activacionPendiente ? (
            <ActivacionCredencial />
          ) : (
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
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
