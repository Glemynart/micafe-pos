'use client'

import { WorkspaceWelcome } from "@/components/pwa/workspace-welcome"
import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react'
import { usePlatform } from '@/contexts/platform-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { mensajeError } from '@/lib/platform/client'

export default function BackofficeLoginPage() {
  const { user, contexto, cargando, login } = usePlatform()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const router = useRouter()
  const destino = () => new URLSearchParams(window.location.search).get('from') || '/backoffice'

  useEffect(() => {
    if (!cargando && user && contexto) router.replace(destino())
  }, [cargando, user, contexto, router])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      await login(email, password)
      router.replace(destino())
    } catch (cause) {
      setError(mensajeError(cause))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-2">
      <WorkspaceWelcome label="Backoffice" title="Tu plataforma, en orden." description="Empresas, planes, relaciones comerciales y soporte. Un espacio claro para cada operación de plataforma." />
      <section className="relative grid place-items-center bg-background px-5 py-10 sm:px-10">
        <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-xs sm:p-8">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-2xl bg-slate-950 text-cyan-300">
              <ShieldCheck className="size-5" />
            </span>
            <strong className="text-base text-foreground">MiCafe SaaS</strong>
          </div>
          <form onSubmit={submit} aria-describedby="login-description">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Backoffice SaaS</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-foreground">Acceso de operadores</h1>
            <p id="login-description" className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">Usa tu identidad global. Los permisos se revalidan contra la autoridad de plataforma.</p>
            <div className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label className="font-medium text-foreground" htmlFor="email">Correo</Label>
                <Input id="email" className="h-11 border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:border-cyan-700 focus-visible:ring-cyan-700/20" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="operador@empresa.com" />
              </div>
              <div className="space-y-2">
                <Label className="font-medium text-foreground" htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <LockKeyhole aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                  <Input id="password" className="h-11 border-border bg-card pl-10 text-foreground placeholder:text-muted-foreground focus-visible:border-cyan-700 focus-visible:ring-cyan-700/20" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                </div>
              </div>
            </div>
            {error && (
              <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">
                {error}
              </p>
            )}
            <Button className="mt-8 h-12 w-full rounded-xl bg-slate-950 text-white shadow-lg shadow-slate-950/15 hover:bg-slate-800 focus-visible:border-cyan-300 focus-visible:ring-cyan-300/50" disabled={enviando || cargando}>
              {enviando || cargando ? (
                <LoaderCircle className="mr-2 size-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 size-4" />
              )}
              Ingresar al Backoffice
            </Button>
          </form>
        </div>
      </section>
    </main>
  )
}
