'use client'

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, CircleAlert } from "lucide-react";
import { obtenerResumenOperador, type TipoAlertaOperador } from "@/lib/platform/client";
import { EmptyState, ErrorState, EstadoBadge, LoadingState, PageIntro } from "@/components/backoffice/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const etiquetas: Record<TipoAlertaOperador, string> = {
  BOOTSTRAP_RECUPERABLE: "Bootstrap recuperable",
  ADMINISTRADOR_PENDIENTE_ACTIVAR: "Administrador pendiente de activar",
  CREDENCIAL_TEMPORAL_EXPIRADA: "Credencial temporal expirada",
  EMPRESA_SIN_SUSCRIPCION: "Empresa sin suscripción",
  TRIAL_PROXIMO_VENCER: "Trial próximo a vencer",
  ONBOARDING_DETENIDO: "Onboarding detenido",
  READINESS_OPERATIVO_INCOMPLETO: "Readiness operativo incompleto",
  EMPRESA_SUSPENDIDA: "Empresa suspendida",
  INCONSISTENCIA_CANONICA: "Inconsistencia canónica",
};

export default function BackofficeDashboard() {
  const [resumen, setResumen] = useState<Awaited<ReturnType<typeof obtenerResumenOperador>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try { setResumen(await obtenerResumenOperador()); }
    catch (cause) { setError(cause instanceof Error ? cause.message.replace(/^FirebaseError:\s*/i, "") : "No fue posible cargar el resumen."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const criticas = useMemo(() => resumen?.alertas.filter((alerta) => alerta.severidad === "CRITICA").length ?? 0, [resumen]);
  if (loading) return <LoadingState label="Calculando alertas de plataforma…" />;
  if (error) return <ErrorState message={error} retry={cargar} />;
  if (!resumen) return <EmptyState />;

  return (
    <>
      <PageIntro eyebrow="Resumen operativo" title="Alertas de empresas" description="Proyección dinámica, de solo lectura, calculada desde los agregados canónicos." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric icon={Building2} label="Empresas evaluadas" value={resumen.empresasTotal} />
        <Metric icon={AlertTriangle} label="Alertas activas" value={resumen.alertas.length} />
        <Metric icon={CircleAlert} label="Alertas críticas" value={criticas} />
      </div>
      {resumen.fuentesDegradadas.length > 0 && <Card className="mt-6 border-amber-200 bg-amber-50"><CardContent className="text-sm text-amber-900">El resumen se muestra con información parcial: {resumen.fuentesDegradadas.length} fuente(s) no estuvieron disponibles. No se infieren alertas desde fuentes degradadas.</CardContent></Card>}
      <Card className="mt-8">
        <CardHeader><CardTitle>Alertas actuales</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {resumen.alertas.length === 0 ? <EmptyState title="No hay alertas operativas" description="Las empresas evaluadas no presentan las condiciones definidas para este Dashboard." /> : resumen.alertas.map((alerta) => (
            <Link key={`${alerta.empresaId}_${alerta.tipo}`} href={`/backoffice/empresas/${alerta.empresaId}`} className="flex items-center gap-3 rounded-xl border p-4 transition hover:border-cyan-300 hover:bg-slate-50">
              <span className={alerta.severidad === "CRITICA" ? "grid size-9 place-items-center rounded-full bg-rose-100 text-rose-700" : "grid size-9 place-items-center rounded-full bg-amber-100 text-amber-700"}><CircleAlert className="size-4" /></span>
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{alerta.empresaNombre}</strong><small className="font-mono text-xs text-slate-400">{alerta.empresaId}</small></span>
              <span className="hidden text-sm text-slate-600 sm:block">{etiquetas[alerta.tipo]}</span>
              <EstadoBadge estado={alerta.severidad} />
            </Link>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: number }) {
  return <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle><Icon className="size-5 text-cyan-700" /></CardHeader><CardContent><strong className="text-3xl">{value}</strong></CardContent></Card>;
}
