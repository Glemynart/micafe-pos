'use client'

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { usePlatform } from "@/contexts/platform-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mensajeError } from "@/lib/platform/client";

export default function BackofficeLoginPage() {
  const { user, contexto, cargando, login } = usePlatform();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();
  const destino = () => new URLSearchParams(window.location.search).get("from") || "/backoffice";

  useEffect(() => {
    if (!cargando && user && contexto) router.replace(destino());
  }, [cargando, user, contexto, router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await login(email, password);
      router.replace(destino());
    } catch (cause) {
      setError(mensajeError(cause));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-slate-950 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden p-14 text-white lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.18),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(14,165,233,.12),transparent_35%)]" />
        <div className="relative flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-cyan-400 text-slate-950"><ShieldCheck /></span><strong className="text-lg">MiCafe SaaS</strong></div>
        <div className="relative max-w-xl">
          <p className="mb-5 text-sm font-medium uppercase tracking-[0.28em] text-cyan-300">Plano de plataforma</p>
          <h1 className="text-5xl font-semibold leading-[1.08] tracking-tight">Gobernanza clara para cada empresa del sistema.</h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-400">Una superficie separada, trazable y de mínimo privilegio para operar el SaaS sin convertirse en un usuario tenant.</p>
        </div>
        <p className="relative text-xs text-slate-600">Acceso sujeto a autorización canónica y auditoría de plataforma.</p>
      </section>
      <section className="grid place-items-center bg-white p-6 lg:rounded-l-[2.5rem]">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-9 lg:hidden"><span className="grid size-11 place-items-center rounded-xl bg-slate-950 text-cyan-300"><ShieldCheck /></span></div>
          <p className="text-sm font-medium text-cyan-700">Backoffice SaaS</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Acceso de operadores</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">Usa tu identidad global. Los permisos se revalidan contra la autoridad de plataforma.</p>
          <div className="mt-8 space-y-5">
            <div className="space-y-2"><Label htmlFor="email">Correo</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="operador@empresa.com" /></div>
            <div className="space-y-2"><Label htmlFor="password">Contraseña</Label><div className="relative"><LockKeyhole className="absolute left-3 top-3 size-4 text-slate-400" /><Input id="password" className="pl-10" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div></div>
          </div>
          {error && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          <Button className="mt-7 h-11 w-full bg-slate-950 text-white hover:bg-slate-800" disabled={enviando || cargando}>
            {enviando || cargando ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <ArrowRight className="mr-2 size-4" />} Ingresar
          </Button>
        </form>
      </section>
    </main>
  );
}
