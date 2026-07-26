'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuthContext } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ActivacionCredencial } from '@/components/auth/activacion-credencial'
import { Store, Loader2, ShieldAlert, Eye, EyeOff } from 'lucide-react'

function AdminLoginContent() {
  const { usuario, cargando: authCargando, login, errorLogin, limpiarError, logout, activacionPendiente } = useAuthContext()
  const router = useRouter()
  const params = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [logging, setLogging] = useState(false)
  const [recordar, setRecordar] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem("admin_user")
    if (saved) setUsername(saved)
  }, [])

  const notAdmin = params.get('error') === 'not_admin'
  const from = params.get('from') ?? '/admin'

  useEffect(() => {
    if (!authCargando && usuario) {
      if (recordar) localStorage.setItem("admin_user", username)
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
      <div className="flex items-center justify-center min-h-[100dvh] bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
              <Store className="h-8 w-8 text-primary-foreground" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold text-foreground">POS Empresarial Admin</h1>
              <p className="text-sm text-muted-foreground">Panel de administracion remoto</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 backdrop-blur-sm">
            <div className="pb-4">
              <h2 className="text-lg font-bold text-foreground">Iniciar Sesion</h2>
              <p className="text-sm text-muted-foreground">Accede con tu cuenta de administrador</p>
            </div>
            <div>
              {activacionPendiente ? (
                <ActivacionCredencial />
              ) : (
              <>
              {!sesionNoAdmin && notAdmin && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm mb-4">
                  <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                  Tu cuenta no tiene permisos de administrador.
                </div>
              )}
              {sesionNoAdmin && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm mb-4 space-y-3">
                  <p className="font-semibold">Sesión activa en la caja</p>
                  <p className="text-xs text-amber-300/70">
                    <strong>{usuario?.nombre || usuario?.username}</strong> tiene una sesión de cajero activa en este dispositivo.
                    Debes cerrarla antes de ingresar como administrador.
                  </p>
                  <button
                    onClick={() => logout()}
                    className="w-full h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold hover:bg-amber-500/30 transition-colors"
                  >
                    Cerrar sesión del cajero
                  </button>
                </div>
              )}
              <form onSubmit={handleLogin} className={`space-y-4 ${sesionNoAdmin ? 'opacity-30 pointer-events-none select-none' : ''}`}>
                <div className="space-y-2">
                  <label htmlFor="user" className="text-sm font-medium text-muted-foreground">Código operativo</label>
                  <input
                    id="user"
                    autoComplete="username"
                    placeholder="Ej. caja-01"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="pass" className="text-sm font-medium text-muted-foreground">PIN de 6 dígitos</label>
                  <div className="relative">
                    <input
                      id="pass"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                      className="w-full h-11 px-4 pr-10 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="recordar"
                    checked={recordar}
                    onChange={(e) => setRecordar(e.target.checked)}
                    className="w-4 h-4 rounded border-border bg-input accent-primary"
                  />
                  <label htmlFor="recordar" className="text-xs text-muted-foreground cursor-pointer">Recordar usuario</label>
                </div>
                {errorLogin && (
                  <p className="text-sm text-red-400 bg-red-500/10 p-3 rounded-lg">{errorLogin}</p>
                )}
                <button type="submit" className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2" disabled={logging}>
                  {logging ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Ingresar
                </button>
              </form>
              </>
              )}
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
