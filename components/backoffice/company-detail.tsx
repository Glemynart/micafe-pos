'use client'

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, LoaderCircle, PauseCircle, PlayCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { comandoComercial, envelope, mensajeError, obtenerDetalleEmpresa, provisionarCredencialInicial, reemitirCredencialInicialTemporal } from "@/lib/platform/client";
import { EmptyState, ErrorState, EstadoBadge, LoadingState, PageIntro } from "./ui";
import { CredentialRevealDialog, type CredencialEntrega } from "./credential-reveal-dialog";
import { EditCompanyDialog } from "./edit-company-dialog";
import { CompanyHistory } from "./company-history";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePlatform } from "@/contexts/platform-context";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function CompanyDetail({ empresaId }: { empresaId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof obtenerDetalleEmpresa>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState(false);
  const [credencialAccion, setCredencialAccion] = useState(false);
  const [credencial, setCredencial] = useState<CredencialEntrega | null>(null);
  const [confirmarReemision, setConfirmarReemision] = useState(false);
  const [confirmarCancelacion, setConfirmarCancelacion] = useState(false);
  const { tiene } = usePlatform();
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await obtenerDetalleEmpresa(empresaId)); } catch (cause) { setError(mensajeError(cause)); } finally { setLoading(false); }
  }, [empresaId]);
  useEffect(() => { void load(); }, [load]);

  async function emitirCredencial() {
    setCredencialAccion(true);
    try {
      const resultado = await provisionarCredencialInicial(empresaId);
      if (resultado.pinTemporal) {
        setCredencial({ codigo: resultado.codigo, pinTemporal: resultado.pinTemporal });
      } else {
        toast.info("El administrador ya tiene una credencial pendiente de activar; no se emitió una nueva.");
      }
      await load();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setCredencialAccion(false); }
  }

  async function reemitirCredencial() {
    const incorporacionId = data?.credencialInicial.incorporacionId;
    if (!incorporacionId) return;
    setCredencialAccion(true);
    try {
      const resultado = await reemitirCredencialInicialTemporal(empresaId, incorporacionId);
      if (resultado.pinTemporal) setCredencial({ codigo: resultado.codigo, pinTemporal: resultado.pinTemporal });
      else toast.info("La credencial temporal ya cambió; no se reveló ningún PIN.");
      await load();
    } catch (cause) { toast.error(mensajeError(cause)); } finally {
      setCredencialAccion(false);
      setConfirmarReemision(false);
    }
  }

  async function transition(destino: string) {
    if (!data?.empresa.revision) return;
    setAccion(true);
    try {
      await comandoComercial("TransicionarEmpresa", {
        ...envelope(`BACKOFFICE_EMPRESA_${destino.toUpperCase()}`),
        empresaId,
        destino,
        expectedRevision: data.empresa.revision,
      });
      toast.success(`Empresa transicionada a ${destino}`);
      await load();
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setAccion(false); setConfirmarCancelacion(false); }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} retry={load} />;
  if (!data) return <EmptyState />;
  const empresa = data.empresa;
  return (
    <>
      <PageIntro
        eyebrow="Detalle empresarial"
        title={empresa.nombre ?? empresa.nombreComercial ?? empresa.id}
        description={`Identificador opaco: ${empresa.id}`}
        action={<div className="flex flex-wrap gap-2">{tiene("LIFECYCLE_GOBERNAR") && <EditCompanyDialog empresaId={empresaId} nombreComercialActual={empresa.nombreComercial ?? empresa.nombre ?? ""} expectedRevision={empresa.revision} onActualizado={load} />}<Button variant="outline" asChild><Link href="/backoffice/empresas"><ArrowLeft className="mr-2 size-4" />Empresas</Link></Button></div>}
      />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card><CardHeader><CardTitle>Estado canónico</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2"><Datum label="Estado"><EstadoBadge estado={empresa.estado} /></Datum><Datum label="Revisión">{empresa.revision ?? "—"}</Datum><Datum label="Owner UID"><span className="break-all font-mono text-xs">{empresa.ownerUid}</span></Datum><Datum label="País fiscal">{empresa.paisFiscal}</Datum></CardContent></Card>
        <Card><CardHeader><CardTitle>Acciones de lifecycle</CardTitle></CardHeader><CardContent className="space-y-3">{tiene("LIFECYCLE_GOBERNAR") ? <><Button className="w-full justify-start" variant="outline" disabled={accion || !["trial", "activa"].includes(empresa.estado)} onClick={() => void transition("suspendida")}>{accion ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <PauseCircle className="mr-2 size-4" />}Suspender</Button><Button className="w-full justify-start" variant="outline" disabled={accion || empresa.estado !== "suspendida"} onClick={() => void transition("activa")}><PlayCircle className="mr-2 size-4" />Reactivar</Button><Button className="w-full justify-start" variant="outline" disabled={accion || !["trial", "activa", "suspendida"].includes(empresa.estado)} onClick={() => setConfirmarCancelacion(true)}><XCircle className="mr-2 size-4" />Cancelar</Button></> : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Tu contexto no posee gobernanza de lifecycle.</p>}<p className="text-xs leading-relaxed text-slate-400">Cada acción invoca el servicio único de lifecycle con revisión esperada; no escribe el documento directamente.</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Suscripción</CardTitle></CardHeader><CardContent>{data.suscripcion ? <div className="grid gap-4 sm:grid-cols-3"><Datum label="Estado"><EstadoBadge estado={data.suscripcion.estado} /></Datum><Datum label="Plan">{data.suscripcion.planId} · v{data.suscripcion.planVersion}</Datum><Datum label="Revisión">{data.suscripcion.revision}</Datum></div> : <p className="text-sm text-slate-500">Sin suscripción materializada.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Diagnóstico operativo</CardTitle></CardHeader><CardContent className="space-y-4">{data.versionPlan && <div className="grid gap-4 sm:grid-cols-2"><Datum label="Versión contratada">{data.versionPlan.codigo ?? data.versionPlan.planId} · v{data.versionPlan.planVersion}</Datum><Datum label="Estado de versión"><EstadoBadge estado={data.versionPlan.estado ?? undefined} /></Datum></div>}{data.diagnosticoConfiguracion.disponible ? <><div className="grid gap-4 sm:grid-cols-2"><Datum label="Readiness operativa"><EstadoBadge estado={data.diagnosticoConfiguracion.readiness?.operativa.lista ? "LISTA" : "PENDIENTE"} /></Datum><Datum label="Readiness fiscal"><EstadoBadge estado={data.diagnosticoConfiguracion.readiness?.fiscal.lista ? "LISTA" : "PENDIENTE"} /></Datum></div><Datum label="Módulos habilitados">{data.diagnosticoConfiguracion.modulosHabilitados.join(", ") || "Ninguno"}</Datum></> : <p className="text-sm text-slate-500">La configuración B1 aún no está disponible.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Provisionamiento</CardTitle></CardHeader><CardContent>{data.provisionamiento ? <div className="space-y-3"><EstadoBadge estado={data.provisionamiento.estado} /><p className="font-mono text-xs text-slate-400">{data.provisionamiento.provisionamientoId}</p>{data.provisionamiento.requiereRecuperacion && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">El provisionamiento requiere recuperación desde el servicio canónico.</p>}</div> : <p className="text-sm text-slate-500">Sin registro visible.</p>}</CardContent></Card>
        <AccesoInicialCard data={data} accion={credencialAccion} onEmitir={emitirCredencial} onSolicitarReemision={() => setConfirmarReemision(true)} puede={tiene("LIFECYCLE_GOBERNAR")} />
        <CompanyHistory empresaId={empresaId} />
      </div>
      <CredentialRevealDialog credencial={credencial} onClose={() => { setCredencial(null); }} />
      <AlertDialog open={confirmarReemision} onOpenChange={setConfirmarReemision}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Reemitir credencial temporal?</AlertDialogTitle><AlertDialogDescription>El código y PIN temporales actuales se invalidarán de inmediato. Solo se mostrará una vez el nuevo PIN.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={credencialAccion}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={credencialAccion} onClick={(event) => { event.preventDefault(); void reemitirCredencial(); }}>{credencialAccion && <LoaderCircle className="mr-2 size-4 animate-spin" />}Reemitir credencial</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmarCancelacion} onOpenChange={setConfirmarCancelacion}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Cancelar esta empresa?</AlertDialogTitle><AlertDialogDescription>La empresa pasará a estado cancelada y se revocarán sus sesiones activas. Esta acción usa el mismo servicio de lifecycle que las demás transiciones.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={accion}>Volver</AlertDialogCancel><AlertDialogAction disabled={accion} onClick={(event) => { event.preventDefault(); void transition("cancelada"); }}>{accion && <LoaderCircle className="mr-2 size-4 animate-spin" />}Cancelar empresa</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AccesoInicialCard({
  data,
  accion,
  onEmitir,
  onSolicitarReemision,
  puede,
}: {
  data: NonNullable<Awaited<ReturnType<typeof obtenerDetalleEmpresa>>>;
  accion: boolean;
  onEmitir: () => void;
  onSolicitarReemision: () => void;
  puede: boolean;
}) {
  const estadoCredencial = data.credencialInicial.estado;
  const reprovisionar = estadoCredencial === "EXPIRADA";
  const emitible = estadoCredencial === "SIN_PROVISIONAR" || reprovisionar;
  const puedeReemitir = data.credencialInicial.puedeReemitir && !!data.credencialInicial.incorporacionId;
  return (
    <Card className="lg:col-span-2">
      <CardHeader><CardTitle>Acceso inicial</CardTitle></CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-3">
        <Datum label="Administrador">
          {data.adminInicial ? <span className="break-all font-mono text-xs">{data.adminInicial.uid}</span> : <span className="text-sm text-slate-400">Sin owner asignado</span>}
        </Datum>
        <Datum label="Membresía admin">
          {data.adminInicial ? <EstadoBadge estado={data.adminInicial.estado ?? undefined} /> : "—"}
        </Datum>
        <Datum label="Credencial operativa"><EstadoBadge estado={estadoCredencial} /></Datum>
        <div className="sm:col-span-3">
          {puede ? (
            <div className="flex flex-wrap gap-2">
              {emitible && <Button variant="outline" disabled={accion || !data.adminInicial} onClick={onEmitir}>
                {accion ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <KeyRound className="mr-2 size-4" />}
                {reprovisionar ? "Reprovisionar credencial" : "Emitir credencial inicial"}
              </Button>}
              {puedeReemitir && <Button variant="outline" disabled={accion || !data.adminInicial} onClick={onSolicitarReemision}><KeyRound className="mr-2 size-4" />Reemitir credencial</Button>}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Tu contexto no posee gobernanza de lifecycle.</p>
          )}
          {estadoCredencial === "ACTIVA" && <p className="mt-2 text-xs text-slate-400">Ya existe una credencial activa; no puede reemitirse desde aquí.</p>}
          {estadoCredencial === "PENDIENTE_ACTIVACION" && <p className="mt-2 text-xs text-slate-400">Hay una credencial temporal vigente, aún no activada por el administrador. Reemitir invalida la entrega actual.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function Datum({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p><div className="text-sm font-medium">{children}</div></div>;
}
