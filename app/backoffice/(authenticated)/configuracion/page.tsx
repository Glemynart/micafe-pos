'use client'

import { CheckCircle2, LockKeyhole } from "lucide-react";
import { usePlatform } from "@/contexts/platform-context";
import { PageIntro } from "@/components/backoffice/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Page() {
  const { contexto } = usePlatform();
  return (
    <>
      <PageIntro eyebrow="Estado base" title="Configuración SaaS" description="Esta superficie muestra la configuración efectiva autorizada. IMP‑002 no introduce contratos ni parámetros adicionales de plataforma." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Identidad de plataforma</CardTitle></CardHeader><CardContent className="space-y-5"><div><p className="text-xs uppercase tracking-wider text-slate-400">UID</p><p className="mt-1 break-all font-mono text-sm">{contexto?.uid}</p></div><div><p className="text-xs uppercase tracking-wider text-slate-400">Estado</p><p className="mt-1 flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="size-4" />{contexto?.estado}</p></div><div><p className="text-xs uppercase tracking-wider text-slate-400">Versión</p><p className="mt-1 font-semibold">v{contexto?.versionAutorizacion}</p></div></CardContent></Card>
        <Card><CardHeader><CardTitle>Facultades canónicas</CardTitle></CardHeader><CardContent className="space-y-2">{contexto?.facultades.map((facultad) => <div key={facultad} className="flex items-center gap-3 rounded-xl border p-3 text-sm"><span className="grid size-8 place-items-center rounded-lg bg-slate-950 text-cyan-300"><LockKeyhole className="size-4" /></span><span className="font-medium">{facultad}</span></div>)}</CardContent></Card>
      </div>
    </>
  );
}

