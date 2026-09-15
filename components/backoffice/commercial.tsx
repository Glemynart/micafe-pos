'use client'

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { comandoComercial, envelope, mensajeError } from "@/lib/platform/client";
import { usePlatform } from "@/contexts/platform-context";
import { usePlatformList } from "./use-platform-list";
import { EmptyState, ErrorState, EstadoBadge, LoadingState, PageIntro } from "./ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Plan = Record<string, any>;
type Periodicidad = "MENSUAL" | "ANUAL" | "SIN_VENCIMIENTO";

function oferta(form: FormData) {
  const periodicidad = String(form.get("periodicidad")) as Periodicidad;
  const limites = JSON.parse(String(form.get("limites") ?? "{}").trim() || "{}");
  if (!limites || Array.isArray(limites) || typeof limites !== "object") throw new Error("LIMITES_PLAN_INVALIDOS");
  const precio = periodicidad === "ANUAL"
    ? { importe: Number(form.get("precioImporte")), moneda: String(form.get("precioMoneda")).trim().toUpperCase() }
    : undefined;
  return {
    capacidades: String(form.get("capacidades")).split(",").map((x) => x.trim()).filter(Boolean),
    limites,
    periodicidad,
    ...(precio ? { precio } : {}),
    grandfathered: form.get("grandfathered") === "on",
  };
}

function OfertaFields({ defaults = {} }: { defaults?: Partial<Plan> }) {
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>((defaults.periodicidad as Periodicidad | undefined) ?? "MENSUAL");
  return <>
    <Field name="capacidades" label="Capacidades (separadas por coma)" defaultValue={Array.isArray(defaults.capacidades) ? defaults.capacidades.join(", ") : ""} required />
    <label className="grid gap-1 text-sm font-medium">Periodicidad
      <select aria-label="Periodicidad" name="periodicidad" value={periodicidad} onChange={(event) => setPeriodicidad(event.target.value as Periodicidad)} className="h-9 rounded-md border border-input bg-background px-3 text-sm" required>
        <option value="MENSUAL">MENSUAL</option><option value="ANUAL">ANUAL</option><option value="SIN_VENCIMIENTO">SIN_VENCIMIENTO</option>
      </select>
    </label>
    {periodicidad === "ANUAL" ? <div className="grid grid-cols-2 gap-3"><Field name="precioImporte" label="Precio" type="number" min="1" step="1" defaultValue={defaults.precio?.importe ?? ""} required /><Field name="precioMoneda" label="Moneda" defaultValue={defaults.precio?.moneda ?? "COP"} pattern="[A-Z]{3}" required /></div> : null}
    <Field name="limites" label="Límites (JSON)" defaultValue={JSON.stringify(defaults.limites ?? {})} required />
    <label className="flex items-center gap-2 text-sm"><input name="grandfathered" type="checkbox" defaultChecked={defaults.grandfathered === true} />Grandfathered</label>
  </>;
}

export function PlansPage() {
  const query = usePlatformList("planes");
  const { tiene } = usePlatform();
  const [open, setOpen] = useState(false);
  const [versionPlan, setVersionPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const puedeGobernar = tiene("COMERCIAL_GOBERNAR");

  async function crear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setLoading(true);
    try {
      await comandoComercial("CrearPlan", { ...envelope("BACKOFFICE_PLAN_CREAR"), expectedRevision: 1, planId: String(form.get("planId")), codigo: String(form.get("codigo")).toUpperCase(), ...oferta(form) });
      toast.success("Plan creado en BORRADOR"); setOpen(false); await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setLoading(false); }
  }
  async function crearVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!versionPlan || !Number.isInteger(versionPlan.planRevision)) return;
    const form = new FormData(event.currentTarget); setLoading(true);
    try {
      await comandoComercial("CrearNuevaVersionPlan", { ...envelope("BACKOFFICE_PLAN_NUEVA_VERSION"), expectedRevision: versionPlan.planRevision, planId: versionPlan.planId ?? versionPlan.id, codigo: String(form.get("codigo")).toUpperCase(), ...oferta(form) });
      toast.success("Nueva versión creada en BORRADOR"); setVersionPlan(null); await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setLoading(false); }
  }
  async function transition(plan: Plan, tipo: "PublicarPlan" | "RetirarVersionPlan") {
    setBusy(plan.id);
    try {
      await comandoComercial(tipo, { ...envelope(tipo === "PublicarPlan" ? "BACKOFFICE_PLAN_PUBLICAR" : "BACKOFFICE_PLAN_RETIRAR"), planId: plan.planId ?? plan.id, planVersion: plan.planVersion ?? plan.versionActual, expectedRevision: plan.revision });
      toast.success(tipo === "PublicarPlan" ? "Versión publicada" : "Versión retirada"); await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setBusy(null); }
  }

  return <>
    <PageIntro eyebrow="Oferta comercial" title="Planes" description="Catálogo versionado. La creación y las nuevas versiones generan BORRADORES; publicar requiere el comando canónico correspondiente." action={puedeGobernar ? <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus className="mr-2 size-4" />Nuevo plan</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Crear plan</DialogTitle><DialogDescription>Define la referencia comercial sin inventar consumo ni límites.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={crear}><Field name="planId" label="ID del plan" required /><Field name="codigo" label="Código" required /><OfertaFields /><Button className="w-full" disabled={loading}>{loading && <LoaderCircle className="mr-2 size-4 animate-spin" />}Crear borrador</Button></form></DialogContent></Dialog> : undefined} />
    <Dialog open={versionPlan !== null} onOpenChange={(value) => !value && setVersionPlan(null)}><DialogContent><DialogHeader><DialogTitle>Nueva versión de plan</DialogTitle><DialogDescription>Usa la revisión canónica del plan y crea un BORRADOR.</DialogDescription></DialogHeader>{versionPlan ? <form className="space-y-4" onSubmit={crearVersion}><Field name="codigo" label="Código" defaultValue={versionPlan.codigo ?? ""} required /><OfertaFields defaults={versionPlan} /><Button className="w-full" disabled={loading}>{loading && <LoaderCircle className="mr-2 size-4 animate-spin" />}Crear nueva versión</Button></form> : null}</DialogContent></Dialog>
    {query.loading ? <LoadingState /> : query.error ? <ErrorState message={query.error} retry={query.reload} /> : query.items.length === 0 ? <EmptyState title="No existen planes" /> : <Card><CardContent><Table><TableHeader><TableRow><TableHead>Plan</TableHead><TableHead>Código</TableHead><TableHead>Versión</TableHead><TableHead>Estado</TableHead><TableHead>Revisión</TableHead><TableHead className="text-right">Acción</TableHead></TableRow></TableHeader><TableBody>{query.items.map((plan) => <TableRow key={plan.id}><TableCell className="font-mono">{plan.id}</TableCell><TableCell>{plan.codigo ?? "—"}</TableCell><TableCell>{plan.planVersion ?? plan.versionActual ?? "—"}</TableCell><TableCell><EstadoBadge estado={plan.estado} /></TableCell><TableCell>{plan.revision ?? "—"}</TableCell><TableCell className="flex justify-end gap-2">{puedeGobernar ? <Button size="sm" variant="outline" disabled={busy === plan.id || !Number.isInteger(plan.planRevision)} onClick={() => setVersionPlan(plan)}>Nueva versión</Button> : null}{puedeGobernar && plan.estado === "BORRADOR" ? <Button size="sm" variant="outline" disabled={busy === plan.id} onClick={() => void transition(plan, "PublicarPlan")}>Publicar</Button> : null}{puedeGobernar && plan.estado === "PUBLICADA" ? <Button size="sm" variant="outline" disabled={busy === plan.id} onClick={() => void transition(plan, "RetirarVersionPlan")}>Retirar</Button> : null}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>}
  </>;
}

export function SubscriptionsPage() {
  const query = usePlatformList("suscripciones");
  return (
    <>
      <PageIntro eyebrow="Relación comercial" title="Suscripciones" description="Estado comercial separado del lifecycle de Empresa. Ninguna transición reactiva por sí sola el acceso tenant." />
      {query.loading ? <LoadingState /> : query.error ? <ErrorState message={query.error} retry={query.reload} /> : query.items.length === 0 ? <EmptyState title="No existen suscripciones" /> : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Estado</TableHead><TableHead>Plan contratado</TableHead><TableHead>Versión</TableHead><TableHead>Inicio</TableHead><TableHead>Vencimiento</TableHead><TableHead>Trial</TableHead><TableHead>Renovación</TableHead><TableHead className="text-right">Ficha</TableHead></TableRow></TableHeader>
              <TableBody>{query.items.map((s) => {
                const empresaId = s.empresaId ?? s.id;
                return <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{empresaId}</TableCell><TableCell><EstadoBadge estado={s.estado} /></TableCell><TableCell>{s.planId ?? "—"}</TableCell><TableCell>{s.planVersion ? `v${s.planVersion}` : "—"}</TableCell><TableCell className="text-xs text-slate-500">{s.periodoInicio ?? "—"}</TableCell><TableCell className="text-xs text-slate-500">{s.periodoFin ?? "—"}</TableCell><TableCell className="text-xs text-slate-500">{s.trialFin ?? "—"}</TableCell><TableCell className="text-xs text-slate-500">{s.cancelacionProgramadaPara ? <span className="text-amber-700">Cancela {s.cancelacionProgramadaPara}</span> : "—"}</TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" asChild><Link href={`/backoffice/suscripciones/${empresaId}`}>Ver<ArrowRight className="ml-1 size-3" /></Link></Button></TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Field(props: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  const { label, name, ...inputProps } = props;
  return <div className="grid gap-1"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} {...inputProps} /></div>;
}
