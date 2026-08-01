'use client'

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import { transicionesSuscripcion, type EstadoSuscripcion } from "@/lib/suscripciones/contrato";
import { comandoComercial, envelope, mensajeError } from "@/lib/platform/client";
import { usePlatform } from "@/contexts/platform-context";
import { EmptyState, ErrorState, EstadoBadge, LoadingState, PageIntro } from "./ui";
import { SubscriptionHistory } from "./subscription-history";
import { usePlatformList } from "./use-platform-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TipoModal = "RenovarSuscripcion" | "CambiarPlanSuscripcion" | "ProgramarCancelacionSuscripcion";

/**
 * Ficha de Suscripción — proyección exclusivamente comercial. Reutiliza
 * `listarRecursosPlataformaSaas` filtrada por Empresa. La Suscripción contiene
 * la referencia histórica inmutable de Plan (`planId` + `planVersion`), sin
 * solicitar identidad, diagnóstico, provisionamiento ni credenciales tenant.
 */
export function SubscriptionDetail({ empresaId }: { empresaId: string }) {
  const query = usePlatformList("suscripciones", { empresaId });
  const [accion, setAccion] = useState(false);
  const [modal, setModal] = useState<TipoModal | null>(null);
  const { tiene } = usePlatform();
  const suscripcion = query.items[0] ?? null;

  async function transicionar(destino: "active" | "suspended") {
    if (!suscripcion) return;
    setAccion(true);
    try {
      const extra = destino === "active" ? {
        periodoInicio: new Date().toISOString().slice(0, 10),
        periodoFin: new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10),
      } : {};
      await comandoComercial("TransicionarSuscripcion", {
        ...envelope(`BACKOFFICE_SUSCRIPCION_${destino.toUpperCase()}`),
        empresaId,
        destino,
        expectedRevision: suscripcion.revision,
        ...extra,
      });
      toast.success("Suscripción actualizada");
      await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setAccion(false); }
  }

  async function revocarCancelacion() {
    if (!suscripcion) return;
    setAccion(true);
    try {
      await comandoComercial("RevocarCancelacionSuscripcion", {
        ...envelope("BACKOFFICE_SUSCRIPCION_CANCELACION_REVOCAR"),
        empresaId,
        expectedRevision: suscripcion.revision,
      });
      toast.success("Cancelación programada revocada");
      await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setAccion(false); }
  }

  async function submitModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || !suscripcion) return;
    const form = new FormData(event.currentTarget);
    setAccion(true);
    try {
      const extra = modal === "RenovarSuscripcion"
        ? { periodoInicio: String(form.get("periodoInicio")), periodoFin: String(form.get("periodoFin")) }
        : modal === "CambiarPlanSuscripcion"
          ? { planId: String(form.get("planId")), planVersion: Number(form.get("planVersion")) }
          : { cancelacionProgramadaPara: String(form.get("cancelacionProgramadaPara")) };
      await comandoComercial(modal, {
        ...envelope(`BACKOFFICE_${modal.toUpperCase()}`),
        empresaId,
        expectedRevision: suscripcion.revision,
        ...extra,
      });
      toast.success("Referencia contractual actualizada");
      setModal(null);
      await query.reload();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setAccion(false); }
  }

  if (query.loading) return <LoadingState />;
  if (query.error) return <ErrorState message={query.error} retry={query.reload} />;
  const estado = suscripcion?.estado as EstadoSuscripcion | undefined;
  const destinoAlternador = estado === "suspended" || estado === "canceled" ? "active" : "suspended";
  const puedeAlternar = !!estado && transicionesSuscripcion[estado].includes(destinoAlternador);

  return (
    <>
      <PageIntro
        eyebrow="Relación comercial"
        title={suscripcion ? `Suscripción de ${empresaId}` : empresaId}
        description="Estado comercial separado del lifecycle de Empresa. Ninguna transición reactiva por sí sola el acceso tenant."
        action={<Button variant="outline" asChild><Link href="/backoffice/suscripciones"><ArrowLeft className="mr-2 size-4" />Suscripciones</Link></Button>}
      />
      {!suscripcion ? <EmptyState title="Sin suscripción materializada" description="Esta empresa no tiene una referencia comercial activa." /> : (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <Card>
            <CardHeader><CardTitle>Estado comercial</CardTitle></CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Datum label="Estado"><EstadoBadge estado={suscripcion.estado} /></Datum>
              <Datum label="Revisión">{suscripcion.revision ?? "—"}</Datum>
              <Datum label="Período">{suscripcion.periodoInicio ?? "—"} → {suscripcion.periodoFin ?? "—"}</Datum>
              <Datum label="Trial">{suscripcion.trialInicio ? `${suscripcion.trialInicio} → ${suscripcion.trialFin ?? "—"}` : "No aplica"}</Datum>
              {suscripcion.graceFin && <Datum label="Gracia hasta">{suscripcion.graceFin}</Datum>}
              {suscripcion.cancelacionProgramadaPara && <Datum label="Cancelación programada">{suscripcion.cancelacionProgramadaPara}</Datum>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Acciones comerciales</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {tiene("COMERCIAL_GOBERNAR") ? (
                <>
                  <Button className="w-full justify-start" variant="outline" disabled={accion || !puedeAlternar} onClick={() => void transicionar(destinoAlternador)}>
                    {accion ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                    {destinoAlternador === "active" ? "Reactivar" : "Suspender"}
                  </Button>
                  {suscripcion.estado === "active" && (
                    <>
                      <Button className="w-full justify-start" variant="outline" disabled={accion} onClick={() => setModal("RenovarSuscripcion")}>Renovar período</Button>
                      <Button className="w-full justify-start" variant="outline" disabled={accion} onClick={() => setModal("CambiarPlanSuscripcion")}>Cambiar plan</Button>
                      {suscripcion.cancelacionProgramadaPara
                        ? <Button className="w-full justify-start" variant="outline" disabled={accion} onClick={() => void revocarCancelacion()}>Revocar cancelación</Button>
                        : <Button className="w-full justify-start" variant="outline" disabled={accion} onClick={() => setModal("ProgramarCancelacionSuscripcion")}>Programar cancelación</Button>}
                    </>
                  )}
                </>
              ) : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Tu contexto no posee gobernanza comercial.</p>}
              <p className="text-xs leading-relaxed text-slate-400">Cada acción invoca el comando comercial canónico con revisión esperada; no escribe el documento directamente.</p>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Plan contratado</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <Datum label="Plan contratado">{suscripcion.planId ?? "—"}</Datum>
                <Datum label="Versión contratada">{suscripcion.planVersion ? `v${suscripcion.planVersion}` : "—"}</Datum>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">Esta es la referencia histórica registrada en la Suscripción, no la definición vigente del plan.</p>
            </CardContent>
          </Card>
          <SubscriptionHistory empresaId={empresaId} />
        </div>
      )}
      <Dialog open={modal !== null} onOpenChange={(open) => { if (!open) setModal(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modal === "RenovarSuscripcion" ? "Renovar período" : modal === "CambiarPlanSuscripcion" ? "Cambiar referencia de plan" : "Programar cancelación"}</DialogTitle>
            <DialogDescription>La operación conserva revisión, idempotencia y la separación entre Suscripción y lifecycle empresarial.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitModal}>
            {modal === "RenovarSuscripcion" && <><Field name="periodoInicio" label="Inicio del período" type="date" required /><Field name="periodoFin" label="Fin del período" type="date" required /></>}
            {modal === "CambiarPlanSuscripcion" && <><Field name="planId" label="Plan publicado" required /><Field name="planVersion" label="Versión" type="number" min="1" required /></>}
            {modal === "ProgramarCancelacionSuscripcion" && <Field name="cancelacionProgramadaPara" label="Fecha de cancelación" type="date" required />}
            <Button className="w-full" disabled={accion}>{accion && <LoaderCircle className="mr-2 size-4 animate-spin" />}Confirmar comando</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field(props: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  const { label, ...input } = props;
  return <div className="space-y-2"><Label htmlFor={props.name}>{label}</Label><Input id={props.name} {...input} /></div>;
}

function Datum({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p><div className="text-sm font-medium">{children}</div></div>;
}
