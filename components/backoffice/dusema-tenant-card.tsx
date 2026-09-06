'use client'

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";
import {
  consultarTenantDusema,
  mensajeError,
  type ResultadoConsultaTenantDusema,
  type TenantDusemaMetadata,
} from "@/lib/platform/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EstadoBadge } from "./ui";

export type DusemaTenantCardViewState =
  | { kind: "loading" }
  | { kind: "unauthorized" }
  | { kind: "result"; value: ResultadoConsultaTenantDusema }
  | { kind: "error"; message: string };

function obtenerCodigoError(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function mensajeErrorConsultaDusema(error: unknown): string {
  const raw = mensajeError(error);
  const code = obtenerCodigoError(error);
  if (code.includes("permission-denied") || /PLATFORM_ACCESS_DENIED|DUSEMA_ACCESS_DENIED/i.test(raw)) {
    return "No tienes autorización para consultar Dusema.";
  }
  if (code.includes("failed-precondition") || /BINDING_/i.test(raw)) {
    return "El Tenant Dusema no está disponible para esta Empresa.";
  }
  return "No fue posible consultar el Tenant Dusema.";
}

export function DusemaTenantCard({ empresaPosId, puedeConsultar }: { empresaPosId: string; puedeConsultar: boolean }) {
  const [state, setState] = useState<DusemaTenantCardViewState>(() => (
    puedeConsultar ? { kind: "loading" } : { kind: "unauthorized" }
  ));

  const load = useCallback(async () => {
    if (!puedeConsultar) {
      setState({ kind: "unauthorized" });
      return;
    }
    setState({ kind: "loading" });
    try {
      setState({ kind: "result", value: await consultarTenantDusema(empresaPosId) });
    } catch (error) {
      setState({ kind: "error", message: mensajeErrorConsultaDusema(error) });
    }
  }, [empresaPosId, puedeConsultar]);

  useEffect(() => { void load(); }, [load]);

  return <DusemaTenantCardView state={state} onRetry={() => void load()} />;
}

export function DusemaTenantCardView({
  state,
  onRetry,
}: {
  state: DusemaTenantCardViewState;
  onRetry?: () => void;
}) {
  return (
    <Card className="lg:col-span-2" data-testid="dusema-tenant-card">
      <CardHeader><CardTitle>Tenant Dusema</CardTitle></CardHeader>
      <CardContent>
        {state.kind === "loading" && (
          <div className="flex min-h-32 items-center justify-center gap-3 text-sm text-slate-500" role="status" aria-live="polite">
            <LoaderCircle className="size-5 animate-spin" />Consultando Tenant Dusema…
          </div>
        )}
        {state.kind === "unauthorized" && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500" role="status">
            No tienes autorización para consultar Dusema.
          </p>
        )}
        {state.kind === "error" && (
          <div className="flex min-h-32 flex-col items-center justify-center text-center" role="alert">
            <AlertCircle className="mb-3 size-8 text-rose-500" />
            <p className="font-medium">No fue posible cargar el Tenant Dusema</p>
            <p className="mt-1 max-w-lg text-sm text-slate-500">{state.message}</p>
          </div>
        )}
        {state.kind === "result" && <ResultadoTenantDusema value={state.value} onRetry={onRetry} />}
      </CardContent>
    </Card>
  );
}

function ResultadoTenantDusema({ value, onRetry }: { value: ResultadoConsultaTenantDusema; onRetry?: () => void }) {
  if (value.estado === "NO_VINCULADO") {
    return <EstadoConsulta estado={value.estado} titulo="No vinculado" descripcion="Esta Empresa no tiene un Tenant Dusema vinculado." />;
  }
  if (value.estado === "NO_ENCONTRADO") {
    return <EstadoConsulta estado={value.estado} titulo="Tenant no encontrado" descripcion="El Tenant Dusema vinculado no está disponible." />;
  }
  if (value.estado === "ERROR_TEMPORAL") {
    return <EstadoConsulta estado={value.estado} titulo="Error temporal" descripcion="No fue posible consultar Dusema en este momento." onRetry={onRetry} />;
  }
  if (!value.tenant) {
    return <EstadoConsulta estado="ERROR" titulo="Información no disponible" descripcion="La respuesta de Dusema no contiene información utilizable." />;
  }
  return <TenantMetadata value={value.tenant} estado={value.estado} />;
}

function EstadoConsulta({
  estado,
  titulo,
  descripcion,
  onRetry,
}: {
  estado: string;
  titulo: string;
  descripcion: string;
  onRetry?: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><EstadoBadge estado={estado} /><p className="font-medium">{titulo}</p></div>
      <p className="text-sm text-slate-500">{descripcion}</p>
      {onRetry && estado === "ERROR_TEMPORAL" && <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw className="size-4" />Reintentar</Button>}
    </div>
  );
}

function TenantMetadata({ value, estado }: { value: TenantDusemaMetadata; estado: "ACTIVO" | "INACTIVO" }) {
  return (
    <div data-testid="dusema-tenant-metadata" className="space-y-5">
      <div className="flex flex-wrap items-center gap-3"><EstadoBadge estado={estado} /><p className="text-sm text-slate-500">Metadata administrativa de solo lectura.</p></div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Datum label="ID">{value.id}</Datum>
        <Datum label="Nombre">{value.nombre}</Datum>
        <Datum label="Razón social">{value.razonSocial ?? "—"}</Datum>
        <Datum label="NIT">{value.nit ?? "—"}</Datum>
        <Datum label="Estado">{value.activo ? "Activo" : "Inactivo"}</Datum>
        <Datum label="Plan">{formatearPlan(value.plan)}</Datum>
        <Datum label="Creado">{formatearFecha(value.createdAt)}</Datum>
        <Datum label="Actualizado">{formatearFecha(value.updatedAt)}</Datum>
      </div>
    </div>
  );
}

function formatearPlan(plan: unknown): string {
  if (typeof plan === "string" || typeof plan === "number") return String(plan);
  return plan === null || plan === undefined ? "—" : "Disponible";
}

function formatearFecha(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function Datum({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p><div className="text-sm font-medium">{children}</div></div>;
}
