'use client'

import { useState, type FormEvent } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { comandoOperador, envelope, FACULTADES_PLATAFORMA, mensajeError, type FacultadPlataforma } from "@/lib/platform/client";
import { usePlatform } from "@/contexts/platform-context";
import { usePlatformList } from "./use-platform-list";
import { EmptyState, ErrorState, EstadoBadge, LoadingState, PageIntro } from "./ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OperatorsPage() {
  const query = usePlatformList("operadores");
  const { tiene, contexto } = usePlatform();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<FacultadPlataforma[]>(["PLATAFORMA_CONSULTAR"]);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget); setBusy("new");
    try {
      await comandoOperador("incorporar", { ...envelope("BACKOFFICE_OPERADOR_INCORPORAR"), objetivoUid: String(form.get("uid")), facultades: selected });
      toast.success("Operador incorporado"); setOpen(false); await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setBusy(null); }
  }
  async function action(op: Record<string, any>, accion: "suspender" | "reactivar" | "revocar") {
    setBusy(op.id);
    try {
      await comandoOperador(accion, {
        ...envelope(`BACKOFFICE_OPERADOR_${accion.toUpperCase()}`),
        objetivoUid: op.uid ?? op.id,
        expectedVersionAutorizacion: op.versionAutorizacion,
        ...(accion === "reactivar" ? { facultades: ["PLATAFORMA_CONSULTAR"] } : {}),
      });
      toast.success("Autorización del operador actualizada"); await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setBusy(null); }
  }
  async function saveFacultades() {
    if (!editing) return;
    setBusy(editing.id);
    try {
      await comandoOperador("facultades", {
        ...envelope("BACKOFFICE_OPERADOR_FACULTADES"),
        objetivoUid: editing.uid ?? editing.id,
        expectedVersionAutorizacion: editing.versionAutorizacion,
        facultades: selected,
      });
      toast.success("Facultades actualizadas"); setEditing(null); await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setBusy(null); }
  }
  return (
    <>
      <PageIntro eyebrow="Gobernanza de acceso" title="Operadores SaaS" description="Autoridad global independiente de Membresías tenant. Ningún operador puede modificar su propio documento." action={tiene("OPERADORES_GOBERNAR") ? <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 size-4" />Incorporar</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Incorporar operador</DialogTitle><DialogDescription>El UID debe existir en Firebase Auth. No se crea ni modifica su credencial.</DialogDescription></DialogHeader><form onSubmit={create} className="space-y-5"><div className="space-y-2"><Label htmlFor="uid">UID global</Label><Input id="uid" name="uid" required /></div><div className="space-y-3"><Label>Facultades explícitas</Label>{FACULTADES_PLATAFORMA.map((f) => <label key={f} className="flex items-center gap-3 rounded-lg border p-3 text-xs"><Checkbox checked={selected.includes(f)} onCheckedChange={(v) => setSelected((x) => v ? [...new Set([...x, f])] : x.filter((i) => i !== f))} /><span>{f}</span></label>)}</div><Button className="w-full" disabled={busy === "new" || selected.length === 0}>{busy === "new" && <LoaderCircle className="mr-2 size-4 animate-spin" />}Incorporar</Button></form></DialogContent></Dialog> : undefined} />
      {query.loading ? <LoadingState /> : query.error ? <ErrorState message={query.error} retry={query.reload} /> : query.items.length === 0 ? <EmptyState title="No existen operadores" /> : <div className="grid gap-4 lg:grid-cols-2">{query.items.map((op) => <Card key={op.id}><CardContent><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold">{op.uid ?? op.id}</p><p className="mt-1 text-xs text-slate-400">Autorización v{op.versionAutorizacion}</p></div><EstadoBadge estado={op.estado} /></div><div className="mt-4 flex flex-wrap gap-1.5">{op.facultades?.map((f: string) => <span key={f} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium">{f}</span>)}</div>{tiene("OPERADORES_GOBERNAR") && op.id !== contexto?.uid && op.estado !== "REVOCADO" && <div className="mt-5 flex flex-wrap gap-2">{op.estado === "ACTIVO" && <Button size="sm" variant="outline" onClick={() => { setSelected(op.facultades); setEditing(op); }}>Facultades</Button>}{op.estado === "SUSPENDIDO" ? <Button size="sm" variant="outline" disabled={busy === op.id} onClick={() => void action(op, "reactivar")}>Reactivar</Button> : <Button size="sm" variant="outline" disabled={busy === op.id} onClick={() => void action(op, "suspender")}>Suspender</Button>}<Button size="sm" variant="destructive" disabled={busy === op.id} onClick={() => void action(op, "revocar")}>Revocar</Button></div>}</CardContent></Card>)}</div>}
      <Dialog open={!!editing} onOpenChange={(value) => { if (!value) setEditing(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Cambiar facultades</DialogTitle><DialogDescription>El conjunto sustituye de forma explícita la autorización actual e incrementa su versión.</DialogDescription></DialogHeader><div className="space-y-3">{FACULTADES_PLATAFORMA.map((f) => <label key={f} className="flex items-center gap-3 rounded-lg border p-3 text-xs"><Checkbox checked={selected.includes(f)} onCheckedChange={(v) => setSelected((x) => v ? [...new Set([...x, f])] : x.filter((i) => i !== f))} /><span>{f}</span></label>)}</div><Button disabled={selected.length === 0 || busy === editing?.id} onClick={() => void saveFacultades()}>Guardar facultades</Button></DialogContent>
      </Dialog>
    </>
  );
}
