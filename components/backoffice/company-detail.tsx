'use client'

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LoaderCircle, PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { comandoComercial, envelope, mensajeError, obtenerDetalleEmpresa } from "@/lib/platform/client";
import { EmptyState, ErrorState, EstadoBadge, LoadingState, PageIntro } from "./ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePlatform } from "@/contexts/platform-context";

export function CompanyDetail({ empresaId }: { empresaId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof obtenerDetalleEmpresa>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [accion, setAccion] = useState(false);
  const { tiene } = usePlatform();
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await obtenerDetalleEmpresa(empresaId)); } catch (cause) { setError(mensajeError(cause)); } finally { setLoading(false); }
  }, [empresaId]);
  useEffect(() => { void load(); }, [load]);

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
    } catch (cause) { toast.error(mensajeError(cause)); } finally { setAccion(false); }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} retry={load} />;
  if (!data) return <EmptyState />;
  const empresa = data.empresa;
  return (
    <>
      <PageIntro eyebrow="Detalle empresarial" title={empresa.nombre ?? empresa.nombreComercial ?? empresa.id} description={`Identificador opaco: ${empresa.id}`} action={<Button variant="outline" asChild><Link href="/backoffice/empresas"><ArrowLeft className="mr-2 size-4" />Empresas</Link></Button>} />
      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card><CardHeader><CardTitle>Estado canónico</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2"><Datum label="Estado"><EstadoBadge estado={empresa.estado} /></Datum><Datum label="Revisión">{empresa.revision ?? "—"}</Datum><Datum label="Owner UID"><span className="break-all font-mono text-xs">{empresa.ownerUid}</span></Datum><Datum label="País fiscal">{empresa.paisFiscal}</Datum></CardContent></Card>
        <Card><CardHeader><CardTitle>Acciones de lifecycle</CardTitle></CardHeader><CardContent className="space-y-3">{tiene("LIFECYCLE_GOBERNAR") ? <><Button className="w-full justify-start" variant="outline" disabled={accion || !["trial", "activa"].includes(empresa.estado)} onClick={() => void transition("suspendida")}>{accion ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <PauseCircle className="mr-2 size-4" />}Suspender</Button><Button className="w-full justify-start" variant="outline" disabled={accion || empresa.estado !== "suspendida"} onClick={() => void transition("activa")}><PlayCircle className="mr-2 size-4" />Reactivar</Button></> : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">Tu contexto no posee gobernanza de lifecycle.</p>}<p className="text-xs leading-relaxed text-slate-400">Cada acción invoca el servicio único de lifecycle con revisión esperada; no escribe el documento directamente.</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Suscripción</CardTitle></CardHeader><CardContent>{data.suscripcion ? <div className="grid gap-4 sm:grid-cols-3"><Datum label="Estado"><EstadoBadge estado={data.suscripcion.estado} /></Datum><Datum label="Plan">{data.suscripcion.planId} · v{data.suscripcion.planVersion}</Datum><Datum label="Revisión">{data.suscripcion.revision}</Datum></div> : <p className="text-sm text-slate-500">Sin suscripción materializada.</p>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Provisionamiento</CardTitle></CardHeader><CardContent>{data.provisionamiento ? <div className="space-y-3"><EstadoBadge estado={data.provisionamiento.estado} /><p className="font-mono text-xs text-slate-400">{data.provisionamiento.provisionamientoId}</p>{data.provisionamiento.errorRecuperable && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{data.provisionamiento.errorRecuperable}</p>}</div> : <p className="text-sm text-slate-500">Sin registro visible.</p>}</CardContent></Card>
      </div>
    </>
  );
}

function Datum({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p><div className="text-sm font-medium">{children}</div></div>;
}
