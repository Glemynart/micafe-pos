'use client'

import { useState, type FormEvent } from "react";
import { Headphones, LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { envelope, mensajeError, solicitarSoporte, transicionarSoporte } from "@/lib/platform/client";
import { usePlatform } from "@/contexts/platform-context";
import { usePlatformList } from "./use-platform-list";
import { EmptyState, ErrorState, EstadoBadge, fecha, LoadingState, PageIntro } from "./ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SupportPage() {
  const query = usePlatformList("soporte");
  const { contexto } = usePlatform();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy("new");
    try {
      await solicitarSoporte({ ...envelope("BACKOFFICE_SOPORTE_SOLICITAR"), empresaObjetivoId: String(form.get("empresaId")), duracionMinutos: Number(form.get("duracion")) });
      toast.success("Solicitud de soporte creada; requiere consentimiento tenant"); setOpen(false); await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setBusy(null); }
  }
  async function action(item: Record<string, any>, destino: string) {
    setBusy(item.id);
    try {
      await transicionarSoporte(destino, { ...envelope(`BACKOFFICE_SOPORTE_${destino}`), autorizacionId: item.autorizacionId ?? item.id, expectedVersion: item.version });
      toast.success("Estado de soporte actualizado"); await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setBusy(null); }
  }
  return (
    <>
      <PageIntro eyebrow="Acceso excepcional" title="Soporte temporal" description="Una autorización separada, consentida, temporal y de diagnóstico solo lectura. Nunca impersona un rol tenant." action={<Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 size-4" />Solicitar soporte</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Nueva solicitud</DialogTitle><DialogDescription>La solicitud no concede acceso hasta que un admin tenant activo la autorice.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={create}><div className="space-y-2"><Label htmlFor="empresaId">Empresa objetivo</Label><Input id="empresaId" name="empresaId" required /></div><div className="space-y-2"><Label htmlFor="duracion">Duración solicitada (minutos)</Label><Input id="duracion" name="duracion" type="number" min="1" defaultValue="60" required /></div><Button className="w-full" disabled={busy === "new"}>{busy === "new" ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Headphones className="mr-2 size-4" />}Crear solicitud</Button></form></DialogContent></Dialog>} />
      {query.loading ? <LoadingState /> : query.error ? <ErrorState message={query.error} retry={query.reload} /> : query.items.length === 0 ? <EmptyState title="No existen autorizaciones de soporte" /> : <div className="grid gap-4 lg:grid-cols-2">{query.items.map((item) => <Card key={item.id}><CardContent><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold">{item.empresaObjetivoId}</p><p className="mt-1 text-xs text-slate-400">Operador {item.operadorUid}</p></div><EstadoBadge estado={item.estado} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><span className="text-slate-400">Alcance</span><p className="mt-1 font-medium">{item.alcanceCodigo}</p></div><div><span className="text-slate-400">Expira</span><p className="mt-1 font-medium">{fecha(item.expiraEn)}</p></div></div>{item.operadorUid === contexto?.uid && <div className="mt-5 flex gap-2">{item.estado === "AUTORIZADA" && <Button size="sm" disabled={busy === item.id} onClick={() => void action(item, "EN_SESION")}>Iniciar sesión</Button>}{item.estado === "EN_SESION" && <Button size="sm" variant="outline" disabled={busy === item.id} onClick={() => void action(item, "FINALIZADA")}>Finalizar</Button>}</div>}</CardContent></Card>)}</div>}
    </>
  );
}

