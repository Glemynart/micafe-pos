'use client'

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Plus, Search } from "lucide-react";
import { usePlatformList } from "./use-platform-list";
import { EmptyState, ErrorState, EstadoBadge, LoadingState, PageIntro } from "./ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePlatform } from "@/contexts/platform-context";

export function CompaniesPage() {
  const [estado, setEstado] = useState("todos");
  const [buscar, setBuscar] = useState("");
  const { tiene } = usePlatform();
  const query = usePlatformList("empresas", estado === "todos" ? {} : { estado });
  const items = useMemo(() => {
    const term = buscar.trim().toLowerCase();
    return term ? query.items.filter((e) => [e.id, e.nombre, e.nombreComercial, e.ownerUid].some((v) => String(v ?? "").toLowerCase().includes(term))) : query.items;
  }, [query.items, buscar]);

  return (
    <>
      <PageIntro eyebrow="Tu plataforma" title="Empresas" description="Encuentra cada negocio, revisa su estado y accede a sus operaciones de administración." action={tiene("BOOTSTRAP_EMPRESARIAL_SOLICITAR") ? <Button asChild><Link href="/backoffice/empresas/nueva"><Plus className="mr-2 size-4" />Solicitar Bootstrap</Link></Button> : undefined} />
      <Card className="mb-5"><CardContent className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-slate-400" /><Input className="pl-9" placeholder="Buscar por nombre, ID u owner UID" value={buscar} onChange={(e) => setBuscar(e.target.value)} /></div><Select value={estado} onValueChange={setEstado}><SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos los estados</SelectItem>{["trial", "activa", "suspendida", "cancelada", "archivada", "eliminada"].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent></Select></CardContent></Card>
      {query.loading ? <LoadingState /> : query.error ? <ErrorState message={query.error} retry={query.reload} /> : items.length === 0 ? <EmptyState title="No hay empresas" /> : (
        <section aria-label="Directorio de empresas" className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-4"><h2 className="text-sm font-semibold">Directorio empresarial</h2><span className="text-xs text-muted-foreground">{items.length} en esta página</span></div>
          {items.map(empresa => <Link href={`/backoffice/empresas/${empresa.id}`} key={empresa.id} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-border/50 px-5 py-5 transition-colors last:border-b-0 hover:bg-primary/[.025] focus-visible:outline-2 focus-visible:outline-ring @3xl:grid-cols-[auto_minmax(0,1fr)_140px_80px_auto]">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/5 text-base font-semibold text-primary">{String(empresa.nombre ?? empresa.id).slice(0,1).toUpperCase()}</span>
            <div className="min-w-0"><h3 className="truncate text-sm font-semibold">{empresa.nombre ?? empresa.nombreComercial ?? empresa.id}</h3><p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{empresa.id}</p><span className="mt-2 inline-block @3xl:hidden"><EstadoBadge estado={empresa.estado} /></span></div>
            <span className="hidden @3xl:block"><EstadoBadge estado={empresa.estado} /></span><span className="hidden text-xs text-muted-foreground @3xl:block">Rev. {empresa.revision ?? "—"}</span><span className="flex size-9 items-center justify-center rounded-xl border border-border/60 text-muted-foreground group-hover:border-primary/20 group-hover:text-primary"><ArrowRight className="size-4" /></span>
          </Link>)}
        </section>
      )}
      {query.cursor && <div className="mt-6 text-center"><Button variant="outline" onClick={() => void query.more()}>Cargar más</Button></div>}
    </>
  );
}
