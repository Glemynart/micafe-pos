'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthContext } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Coffee, Loader2, ShieldAlert, Eye, EyeOff } from 'lucide-react'

function AdminLoginContent() {
  const { usuario, cargando: authCargando, login, errorLogin, limpiarError, logout } = useAuthContext()
  const router = useRouter()
  const params = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [logging, setLogging] = useState(false)

  const notAdmin = params.get('error') === 'not_admin'
  const from = params.get('from') ?? '/admin'

  useEffect(() => {
    if (!authCargando && usuario) {
      if (usuario.rol === 'admin' || usuario.rol === 'marketing') {
        router.replace(from)
      }
    }
  }, [authCargando, usuario, router, from])

  const sesionNoAdmin = !authCargando && usuario && usuario.rol !== 'admin' && usuario.rol !== 'marketing'

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    limpiarError()
    if (!username.trim() || !password.trim()) return
    setLogging(true)
    try {
      await login(username.trim(), password)
    } finally {
      setLogging(false)
    }
  }

  if (authCargando) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] bg-[#0a1628]">
        <Loader2 className="h-8 w-8 animate-spin text-white/20" />
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-[#0a1628] flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F9B207] to-[#e6a100] flex items-center justify-center shadow-lg shadow-[#F9B207]/20">
              <Coffee className="h-8 w-8 text-[#051D41]" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold text-white">Cafe Atrato Admin</h1>
              <p className="text-sm text-white/40">Panel de administracion remoto</p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
            <div className="pb-4">
              <h2 className="text-lg font-bold text-white">Iniciar Sesion</h2>
              <p className="text-sm text-white/40">Accede con tu cuenta de administrador</p>
            </div>
            <div>
              {!sesionNoAdmin && notAdmin && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-4">
                  <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                  Tu cuenta no tiene permisos de administrador.
                </div>
              )}
              {sesionNoAdmin && (
                <div className="p-3 rounded-lg bg-amber-500/10 text-amber-300 text-sm mb-4">
                  <p className="font-medium mb-1">Sesion activa: <strong>{usuario?.nombre || usuario?.username}</strong></p>
                  <p className="text-xs mb-2 text-amber-300/70">Esta cuenta es de cajero/cocinero. Cierra sesion e ingresa con admin o marketing.</p>
                  <div className="flex gap-2">
                    <button onClick={() => logout()} className="h-8 px-3 text-xs rounded-lg border border-white/10 text-white/60 hover:bg-white/5">
                      Cerrar sesion
                    </button>
                  </div>
                </div>
              )}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="user" className="text-sm font-medium text-white/70">Usuario</label>
                  <input
                    id="user"
                    autoComplete="username"
                    placeholder="Tu nombre de usuario"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-[#F9B207] focus:ring-1 focus:ring-[#F9B207]/50"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="pass" className="text-sm font-medium text-white/70">Contrasena</label>
                  <div className="relative">
                    <input
                      id="pass"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="********"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-11 px-4 pr-10 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 focus:outline-none focus:border-[#F9B207] focus:ring-1 focus:ring-[#F9B207]/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {errorLogin && (
                  <p className="text-sm text-red-400 bg-red-500/10 p-3 rounded-lg">{errorLogin}</p>
                )}
                <button type="submit" className="w-full h-11 rounded-xl bg-[#F9B207] text-[#051D41] font-bold hover:bg-[#e6a100] transition-colors disabled:opacity-50 flex items-center justify-center gap-2" disabled={logging}>
                  {logging ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Ingresar
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-background flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <AdminLoginContent />
    </Suspense>
  )
}
