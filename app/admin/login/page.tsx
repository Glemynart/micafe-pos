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
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/20">
              <Coffee className="h-8 w-8 text-primary-foreground" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold text-foreground">MiCafé Admin</h1>
              <p className="text-sm text-muted-foreground">Panel de administración remoto</p>
            </div>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Iniciar Sesión</CardTitle>
              <CardDescription>Accede con tu cuenta de administrador</CardDescription>
            </CardHeader>
            <CardContent>
              {!sesionNoAdmin && notAdmin && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
                  <ShieldAlert className="h-4 w-4 flex-shrink-0" />
                  Tu cuenta no tiene permisos de administrador.
                </div>
              )}
              {sesionNoAdmin && (
                <div className="p-3 rounded-lg bg-amber-500/10 text-amber-600 text-sm mb-4">
                  <p className="font-medium mb-1">Sesion activa: <strong>{usuario?.nombre || usuario?.username}</strong></p>
                  <p className="text-xs mb-2">Esta cuenta es de cajero/cocinero. Cierra sesion e ingresa con admin o marketing.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => logout()}>
                      Cerrar sesion
                    </Button>
                  </div>
                </div>
              )}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="user">Usuario</Label>
                  <Input
                    id="user"
                    autoComplete="username"
                    placeholder="Tu nombre de usuario"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pass">Contraseña</Label>
                  <div className="relative">
                    <Input
                      id="pass"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="********"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-input pr-10"
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
                {errorLogin && (
                  <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">{errorLogin}</p>
                )}
                <Button type="submit" className="w-full bg-primary text-primary-foreground h-11" disabled={logging}>
                  {logging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Ingresar
                </Button>
              </form>
            </CardContent>
          </Card>
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
