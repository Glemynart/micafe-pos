'use client'

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
    <main className="grid min-h-screen bg-[#06111d] lg:grid-cols-[minmax(0,1.05fr)_minmax(28rem,.95fr)]">
      <section className="relative hidden overflow-hidden px-14 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_15%,rgba(34,211,238,.15),transparent_26%),radial-gradient(circle_at_82%_78%,rgba(59,130,246,.14),transparent_30%)]" />
        <div className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-cyan-300/30 to-transparent" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/20">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <strong className="block text-base tracking-tight">MiCafe SaaS</strong>
            <span className="text-xs text-slate-400">Control de plataforma</span>
          </div>
        </div>
        <div className="relative max-w-xl">
          <p className="mb-6 text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">Plano de plataforma</p>
          <h1 className="text-5xl font-semibold leading-[1.06] tracking-[-0.045em] text-slate-50">Gobernanza clara para cada empresa del sistema.</h1>
          <p className="mt-7 max-w-lg text-lg leading-relaxed text-slate-300">Una superficie separada, trazable y de mínimo privilegio para operar el SaaS sin convertirse en un usuario tenant.</p>
        </div>
        <p className="relative text-xs text-slate-400">Acceso sujeto a autorización canónica y auditoría de plataforma.</p>
      </section>
      <section className="relative grid place-items-center bg-[#f6f8fb] px-6 py-10 sm:px-10 lg:rounded-l-[3rem] lg:px-16">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl shadow-slate-950/10 sm:p-10">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-2xl bg-slate-950 text-cyan-300">
              <ShieldCheck className="size-5" />
            </span>
            <strong className="text-base text-slate-950">MiCafe SaaS</strong>
          </div>
          <form onSubmit={submit} aria-describedby="login-description">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">Backoffice SaaS</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950">Acceso de operadores</h2>
            <p id="login-description" className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">Usa tu identidad global. Los permisos se revalidan contra la autoridad de plataforma.</p>
            <div className="mt-8 space-y-5">
              <div className="space-y-2">
                <Label className="font-medium text-slate-800" htmlFor="email">Correo</Label>
                <Input id="email" className="h-11 border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 focus-visible:border-cyan-700 focus-visible:ring-cyan-700/20" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="operador@empresa.com" />
              </div>
              <div className="space-y-2">
                <Label className="font-medium text-slate-800" htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <LockKeyhole aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-slate-500" />
                  <Input id="password" className="h-11 border-slate-300 bg-white pl-10 text-slate-950 placeholder:text-slate-400 focus-visible:border-cyan-700 focus-visible:ring-cyan-700/20" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
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
