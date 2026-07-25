'use client'

import Link from "next/link";
import { Activity, ArrowUpRight, Building2, Headphones, ShieldCheck, Users } from "lucide-react";
import { usePlatform } from "@/contexts/platform-context";
import { usePlatformList } from "@/components/backoffice/use-platform-list";
import { PageIntro, EstadoBadge } from "@/components/backoffice/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function BackofficeDashboard() {
  const { contexto } = usePlatform();
  const empresas = usePlatformList("empresas");
  const operadores = usePlatformList("operadores");
  const soporte = usePlatformList("soporte");

  const cards = [
    { label: "Empresas en la vista", value: empresas.loading ? "…" : empresas.items.length, icon: Building2, href: "/backoffice/empresas" },
    { label: "Operadores en la vista", value: operadores.loading ? "…" : operadores.items.length, icon: Users, href: "/backoffice/operadores" },
    { label: "Soportes en la vista", value: soporte.loading ? "…" : soporte.items.length, icon: Headphones, href: "/backoffice/soporte" },
    { label: "Facultades vigentes", value: contexto?.facultades.length ?? 0, icon: ShieldCheck, href: "/backoffice/configuracion" },
  ];

  return (
    <>
      <PageIntro eyebrow="Resumen operativo" title="Estado de la plataforma" description="Proyección actual de los agregados disponibles para tu responsabilidad. Los conteos corresponden únicamente a la página cargada, no son métricas comerciales." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <Link href={card.href} key={card.label}><Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md"><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm font-medium text-slate-500">{card.label}</CardTitle><card.icon className="size-5 text-cyan-700" /></CardHeader><CardContent><strong className="text-3xl">{card.value}</strong><ArrowUpRight className="ml-2 inline size-4 text-slate-400" /></CardContent></Card></Link>)}
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="size-5 text-cyan-700" /> Empresas recientes</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {empresas.items.slice(0, 6).map((empresa) => <Link href={`/backoffice/empresas/${empresa.id}`} key={empresa.id} className="flex items-center gap-3 rounded-xl border p-3 hover:bg-slate-50"><span className="grid size-10 place-items-center rounded-lg bg-slate-100 font-semibold">{String(empresa.nombre ?? empresa.id).slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{empresa.nombre ?? empresa.nombreComercial ?? empresa.id}</strong><small className="font-mono text-slate-400">{empresa.id}</small></span><EstadoBadge estado={empresa.estado} /></Link>)}
            {!empresas.loading && empresas.items.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No hay empresas visibles.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="size-5 text-cyan-700" /> Contexto de autorización</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-xl bg-slate-950 p-5 text-slate-200"><p className="text-xs uppercase tracking-wider text-slate-500">Principal</p><p className="mt-1 truncate font-mono text-sm">{contexto?.uid}</p><p className="mt-5 text-xs uppercase tracking-wider text-slate-500">Versión canónica</p><p className="mt-1 text-2xl font-semibold text-cyan-300">v{contexto?.versionAutorizacion}</p></div>
            <div className="mt-4 flex flex-wrap gap-2">{contexto?.facultades.map((f) => <span key={f} className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800">{f}</span>)}</div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

