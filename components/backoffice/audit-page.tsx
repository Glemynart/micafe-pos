'use client'

import { useState } from "react";
import { Search } from "lucide-react";
import { consultarAuditoria, mensajeError } from "@/lib/platform/client";
import { EmptyState, EstadoBadge, fecha, LoadingState, PageIntro } from "./ui";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export function AuditPage() {
  const [buscar, setBuscar] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<Record<string, any>[] | null>(null);
  const [errorFiltro, setErrorFiltro] = useState<string | null>(null);

  async function buscarCorrelacion() {
    if (!buscar.trim()) { setResultado(null); return; }
    setBuscando(true); setErrorFiltro(null);
    try { setResultado((await consultarAuditoria({ por: "correlacion", valor: buscar.trim() })).items); }
    catch (cause) { setErrorFiltro(mensajeError(cause)); } finally { setBuscando(false); }
  }

  const items = resultado ?? [];
  return (
    <>
      <PageIntro eyebrow="Evidencia append-only" title="Auditoría de plataforma" description="Proyección mínima de hechos confirmados, denegaciones y conflictos. Esta evidencia no concede permisos ni reconstruye agregados." />
      <Card className="mb-5"><CardContent><div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-slate-400" /><Input className="pl-9" value={buscar} onChange={(e) => { setBuscar(e.target.value); setResultado(null); }} placeholder="Correlación exacta" /></div><Button variant="outline" disabled={buscando} onClick={() => void buscarCorrelacion()}>{buscando ? "Buscando…" : "Buscar correlación"}</Button></div>{errorFiltro && <p className="mt-2 text-xs text-rose-600">{errorFiltro}</p>}</CardContent></Card>
      {buscando ? <LoadingState /> : resultado === null ? <EmptyState title="Busca por correlación exacta" /> : items.length === 0 ? <EmptyState title="Sin evidencia visible" /> : <Card><CardContent><Table><TableHeader><TableRow><TableHead>Hecho</TableHead><TableHead>Resultado</TableHead><TableHead>Actor</TableHead><TableHead>Agregado</TableHead><TableHead>Registrado</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell><strong className="text-xs">{item.tipo}</strong><p className="mt-1 font-mono text-[10px] text-slate-400">{item.correlacionId}</p></TableCell><TableCell><EstadoBadge estado={item.resultado} /></TableCell><TableCell className="font-mono text-xs">{item.actor?.uid ?? item.actor?.tipo ?? "SISTEMA"}</TableCell><TableCell><span className="text-xs">{item.agregado?.tipo}</span><p className="max-w-48 truncate font-mono text-[10px] text-slate-400">{item.agregado?.id}</p></TableCell><TableCell className="text-xs text-slate-500">{fecha(item.registradoEn)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
    </>
  );
}
