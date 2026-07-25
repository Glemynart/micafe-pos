'use client'

import { useState, type FormEvent } from "react";
import { LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { comandoComercial, envelope, mensajeError } from "@/lib/platform/client";
import { usePlatform } from "@/contexts/platform-context";
import { usePlatformList } from "./use-platform-list";
import { EmptyState, ErrorState, EstadoBadge, LoadingState, PageIntro } from "./ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function PlansPage() {
  const query = usePlatformList("planes");
  const { tiene } = usePlatform();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    try {
      const capacidades = String(form.get("capacidades")).split(",").map((x) => x.trim()).filter(Boolean);
      await comandoComercial("CrearPlan", {
        ...envelope("BACKOFFICE_PLAN_CREAR"),
        expectedRevision: 1,
        planId: String(form.get("planId")),
        codigo: String(form.get("codigo")).toUpperCase(),
        capacidades,
        limites: {},
        periodicidad: String(form.get("periodicidad")),
        grandfathered: false,
      });
      toast.success("Plan creado en BORRADOR");
      setOpen(false); await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setLoading(false); }
  }
  async function transition(plan: Record<string, any>, tipo: "PublicarPlan" | "RetirarVersionPlan") {
    setBusy(plan.id);
    try {
      await comandoComercial(tipo, {
        ...envelope(tipo === "PublicarPlan" ? "BACKOFFICE_PLAN_PUBLICAR" : "BACKOFFICE_PLAN_RETIRAR"),
        planId: plan.planId ?? plan.id,
        planVersion: plan.planVersion ?? plan.versionActual,
        expectedRevision: plan.revision,
      });
      toast.success(tipo === "PublicarPlan" ? "Versión publicada" : "Versión retirada");
      await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setBusy(null); }
  }

  return (
    <>
      <PageIntro eyebrow="Oferta comercial" title="Planes" description="Catálogo versionado. La creación genera exclusivamente una versión BORRADOR; publicar requiere el comando canónico correspondiente." action={tiene("COMERCIAL_GOBERNAR") ? <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 size-4" />Nuevo plan</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Crear plan</DialogTitle><DialogDescription>Define la referencia comercial sin inventar consumo ni límites.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={create}><Field name="planId" label="ID del plan" required /><Field name="codigo" label="Código" required /><Field name="capacidades" label="Capacidades (separadas por coma)" required /><Field name="periodicidad" label="Periodicidad" defaultValue="MENSUAL" required /><Button className="w-full" disabled={loading}>{loading && <LoaderCircle className="mr-2 size-4 animate-spin" />}Crear borrador</Button></form></DialogContent></Dialog> : undefined} />
      {query.loading ? <LoadingState /> : query.error ? <ErrorState message={query.error} retry={query.reload} /> : query.items.length === 0 ? <EmptyState title="No existen planes" /> : <Card><CardContent><Table><TableHeader><TableRow><TableHead>Plan</TableHead><TableHead>Código</TableHead><TableHead>Versión</TableHead><TableHead>Estado</TableHead><TableHead>Revisión</TableHead><TableHead className="text-right">Acción</TableHead></TableRow></TableHeader><TableBody>{query.items.map((p) => <TableRow key={p.id}><TableCell className="font-mono">{p.id}</TableCell><TableCell>{p.codigo ?? "—"}</TableCell><TableCell>{p.planVersion ?? p.versionActual ?? "—"}</TableCell><TableCell><EstadoBadge estado={p.estado} /></TableCell><TableCell>{p.revision ?? "—"}</TableCell><TableCell className="text-right">{tiene("COMERCIAL_GOBERNAR") && p.estado === "BORRADOR" && <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => void transition(p, "PublicarPlan")}>Publicar</Button>}{tiene("COMERCIAL_GOBERNAR") && p.estado === "PUBLICADA" && <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => void transition(p, "RetirarVersionPlan")}>Retirar</Button>}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
    </>
  );
}

export function SubscriptionsPage() {
  const query = usePlatformList("suscripciones");
  const { tiene } = usePlatform();
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<{ item: Record<string, any>; tipo: "RenovarSuscripcion" | "CambiarPlanSuscripcion" | "ProgramarCancelacionSuscripcion" } | null>(null);
  async function transition(item: Record<string, any>, destino: string) {
    setBusy(item.id);
    try {
      const extra = destino === "active" ? {
        periodoInicio: new Date().toISOString().slice(0, 10),
        periodoFin: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      } : {};
      await comandoComercial("TransicionarSuscripcion", {
        ...envelope(`BACKOFFICE_SUSCRIPCION_${destino.toUpperCase()}`),
        empresaId: item.empresaId ?? item.id,
        destino,
        expectedRevision: item.revision,
        ...extra,
      });
      toast.success("Suscripción actualizada");
      await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setBusy(null); }
  }
  async function submitCommercial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    const form = new FormData(event.currentTarget);
    const item = modal.item;
    setBusy(item.id);
    try {
      const extra = modal.tipo === "RenovarSuscripcion"
        ? { periodoInicio: String(form.get("periodoInicio")), periodoFin: String(form.get("periodoFin")) }
        : modal.tipo === "CambiarPlanSuscripcion"
          ? { planId: String(form.get("planId")), planVersion: Number(form.get("planVersion")) }
          : { cancelacionProgramadaPara: String(form.get("cancelacionProgramadaPara")) };
      await comandoComercial(modal.tipo, {
        ...envelope(`BACKOFFICE_${modal.tipo.toUpperCase()}`),
        empresaId: item.empresaId ?? item.id,
        expectedRevision: item.revision,
        ...extra,
      });
      toast.success("Referencia contractual actualizada");
      setModal(null); await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setBusy(null); }
  }
  async function revokeCancellation(item: Record<string, any>) {
    setBusy(item.id);
    try {
      await comandoComercial("RevocarCancelacionSuscripcion", {
        ...envelope("BACKOFFICE_SUSCRIPCION_CANCELACION_REVOCAR"),
        empresaId: item.empresaId ?? item.id,
        expectedRevision: item.revision,
      });
      toast.success("Cancelación programada revocada"); await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setBusy(null); }
  }
  return (
    <>
      <PageIntro eyebrow="Relación comercial" title="Suscripciones" description="Estado comercial separado del lifecycle de Empresa. Ninguna transición reactiva por sí sola el acceso tenant." />
      {query.loading ? <LoadingState /> : query.error ? <ErrorState message={query.error} retry={query.reload} /> : query.items.length === 0 ? <EmptyState title="No existen suscripciones" /> : <Card><CardContent><Table><TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Plan</TableHead><TableHead>Estado</TableHead><TableHead>Revisión</TableHead><TableHead className="text-right">Acciones</TableHead></TableRow></TableHeader><TableBody>{query.items.map((s) => <TableRow key={s.id}><TableCell className="font-mono">{s.empresaId ?? s.id}</TableCell><TableCell>{s.planId} · v{s.planVersion}</TableCell><TableCell><EstadoBadge estado={s.estado} />{s.cancelacionProgramadaPara && <p className="mt-1 text-[10px] text-amber-700">Cancela {s.cancelacionProgramadaPara}</p>}</TableCell><TableCell>{s.revision}</TableCell><TableCell><div className="flex flex-wrap justify-end gap-1">{tiene("COMERCIAL_GOBERNAR") && <><Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => void transition(s, s.estado === "suspended" ? "active" : "suspended")}>{busy === s.id ? <LoaderCircle className="size-4 animate-spin" /> : <><RefreshCw className="mr-1 size-3" />{s.estado === "suspended" ? "Reactivar" : "Suspender"}</>}</Button>{s.estado === "active" && <><Button size="sm" variant="ghost" onClick={() => setModal({ item: s, tipo: "RenovarSuscripcion" })}>Renovar</Button><Button size="sm" variant="ghost" onClick={() => setModal({ item: s, tipo: "CambiarPlanSuscripcion" })}>Cambiar plan</Button>{s.cancelacionProgramadaPara ? <Button size="sm" variant="ghost" onClick={() => void revokeCancellation(s)}>Revocar cancelación</Button> : <Button size="sm" variant="ghost" onClick={() => setModal({ item: s, tipo: "ProgramarCancelacionSuscripcion" })}>Programar cancelación</Button>}</>}</>}</div></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
      <Dialog open={!!modal} onOpenChange={(value) => { if (!value) setModal(null); }}><DialogContent><DialogHeader><DialogTitle>{modal?.tipo === "RenovarSuscripcion" ? "Renovar período" : modal?.tipo === "CambiarPlanSuscripcion" ? "Cambiar referencia de plan" : "Programar cancelación"}</DialogTitle><DialogDescription>La operación conserva revisión, idempotencia y la separación entre Suscripción y lifecycle empresarial.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={submitCommercial}>{modal?.tipo === "RenovarSuscripcion" && <><Field name="periodoInicio" label="Inicio del período" type="date" required /><Field name="periodoFin" label="Fin del período" type="date" required /></>}{modal?.tipo === "CambiarPlanSuscripcion" && <><Field name="planId" label="Plan publicado" required /><Field name="planVersion" label="Versión" type="number" min="1" required /></>}{modal?.tipo === "ProgramarCancelacionSuscripcion" && <Field name="cancelacionProgramadaPara" label="Fecha de cancelación" type="date" required />}<Button className="w-full" disabled={busy === modal?.item.id}>Confirmar comando</Button></form></DialogContent></Dialog>
    </>
  );
}

function Field(props: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  const { label, ...input } = props;
  return <div className="space-y-2"><Label htmlFor={props.name}>{label}</Label><Input id={props.name} {...input} /></div>;
}
