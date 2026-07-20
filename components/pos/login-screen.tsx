'use client'

import { useState, useEffect } from 'react'
import { Coffee, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
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
  const { login, loginLegacy, iniciandoSesion, errorLogin, limpiarError } = useAuthContext()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [usarLegacy, setUsarLegacy] = useState(false)

  useEffect(() => {
    if (errorLogin && (username || password)) limpiarError()
  }, [username, password])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    await (usarLegacy ? loginLegacy(username, password) : login(username, password))
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#051D41] relative overflow-hidden">
      {/* Orbs de fondo navy/gold — visibles sobre fondo oscuro */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[36rem] h-[36rem] bg-[#F9B207]/8 rounded-full blur-[140px]" />
        <div className="absolute -bottom-40 -right-40 w-[40rem] h-[40rem] bg-[#0a3060]/80 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30rem] h-[30rem] bg-[#F9B207]/5 rounded-full blur-[100px]" />
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
            <div className="w-2 h-10 bg-gradient-to-t from-[#F9B207]/25 via-[#F9B207]/10 to-transparent rounded-full blur-[2px]" />
          </div>
        ))}
      </div>

      <Card className="w-full max-w-sm mx-4 bg-white/[0.97] border-white/10 shadow-2xl shadow-black/40 animate-scale-in relative z-10 rounded-2xl">
        <CardHeader className="text-center pb-1 pt-8">
          {/* Logo mark */}
          <div className="mx-auto mb-5 relative">
            <div className="absolute inset-0 bg-[#F9B207]/25 rounded-full blur-2xl scale-150" />
            <div className="w-20 h-20 rounded-2xl bg-[#F9B207] flex items-center justify-center shadow-xl shadow-[#F9B207]/30 relative">
              <Coffee className="h-10 w-10 text-[#051D41]" strokeWidth={2.2} />
            </div>
          </div>

          <div className="space-y-0.5">
            <h1 className="text-2xl font-bold tracking-tight text-[#051D41]">Café Atrato</h1>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F9B207]">Punto de venta</p>
          </div>
        </CardHeader>

        <CardContent className="px-8 pb-8 pt-6">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-[#051D41]/70">{usarLegacy ? 'Usuario' : 'Código operativo'}</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={usarLegacy ? 'Tu nombre de usuario' : 'Ej. caja-01'}
                className="h-12 bg-[#051D41]/5 border-[#051D41]/15 focus:border-[#F9B207] focus:ring-[#F9B207]/20 rounded-xl text-[#051D41] placeholder:text-[#051D41]/30 transition-all duration-200"
                autoComplete="username"
                disabled={iniciandoSesion}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-[#051D41]/70">{usarLegacy ? 'Contraseña' : 'PIN de 6 dígitos'}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={usarLegacy ? '········' : '••••••'}
                  inputMode={usarLegacy ? undefined : 'numeric'}
                  maxLength={usarLegacy ? undefined : 6}
                  className="h-12 pr-12 bg-[#051D41]/5 border-[#051D41]/15 focus:border-[#F9B207] focus:ring-[#F9B207]/20 rounded-xl text-[#051D41] placeholder:text-[#051D41]/30 transition-all duration-200"
                  autoComplete="current-password"
                  disabled={iniciandoSesion}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#051D41]/40 hover:text-[#051D41]/70 transition-colors p-1.5 rounded-lg"
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
              className="w-full h-12 text-base font-bold bg-[#F9B207] hover:bg-[#e6a100] text-[#051D41] rounded-xl shadow-lg shadow-[#F9B207]/30 transition-all duration-200 hover:shadow-xl hover:shadow-[#F9B207]/40 hover:-translate-y-0.5 active:translate-y-0 border-none"
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

            <button
              type="button"
              onClick={() => {
                setUsarLegacy((actual) => !actual)
                setPassword('')
                limpiarError()
              }}
              disabled={iniciandoSesion}
              className="w-full text-center text-xs text-[#051D41]/45 hover:text-[#051D41]/75 transition-colors"
            >
              {usarLegacy ? 'Usar código operativo y PIN' : 'Usar acceso legacy con contraseña'}
            </button>

            <p className="text-center text-[11px] text-[#051D41]/30 pt-1">
              Café Atrato POS v1.0
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
