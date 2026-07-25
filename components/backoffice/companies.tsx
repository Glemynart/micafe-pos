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
      <PageIntro eyebrow="Lifecycle empresarial" title="Empresas" description="Consulta la proyección global y solicita operaciones mediante los servicios canónicos." action={tiene("BOOTSTRAP_EMPRESARIAL_SOLICITAR") ? <Button asChild><Link href="/backoffice/empresas/nueva"><Plus className="mr-2 size-4" />Solicitar Bootstrap</Link></Button> : undefined} />
      <Card className="mb-5"><CardContent className="flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-slate-400" /><Input className="pl-9" placeholder="Buscar por nombre, ID u owner UID" value={buscar} onChange={(e) => setBuscar(e.target.value)} /></div><Select value={estado} onValueChange={setEstado}><SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos los estados</SelectItem>{["trial", "activa", "suspendida", "cancelada", "archivada", "eliminada"].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent></Select></CardContent></Card>
      {query.loading ? <LoadingState /> : query.error ? <ErrorState message={query.error} retry={query.reload} /> : items.length === 0 ? <EmptyState title="No hay empresas" /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((empresa) => <Link href={`/backoffice/empresas/${empresa.id}`} key={empresa.id}><Card className="h-full transition hover:border-cyan-300 hover:shadow-md"><CardContent><div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-slate-950 text-lg font-semibold text-cyan-300">{String(empresa.nombre ?? empresa.id).slice(0, 1).toUpperCase()}</span><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{empresa.nombre ?? empresa.nombreComercial ?? empresa.id}</h3><p className="mt-1 truncate font-mono text-xs text-slate-400">{empresa.id}</p></div><ArrowRight className="size-4 text-slate-300" /></div><div className="mt-5 flex items-center justify-between"><EstadoBadge estado={empresa.estado} /><span className="text-xs text-slate-400">Rev. {empresa.revision ?? "—"}</span></div></CardContent></Card></Link>)}</div>
      )}
      {query.cursor && <div className="mt-6 text-center"><Button variant="outline" onClick={() => void query.more()}>Cargar más</Button></div>}
    </>
  );
}
