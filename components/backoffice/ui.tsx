'use client'

import { AlertCircle, Inbox, LoaderCircle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-700">{eyebrow}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p></div>
      {action}
    </div>
  );
}

const colores: Record<string, string> = {
  ACTIVO: "bg-emerald-100 text-emerald-800", activa: "bg-emerald-100 text-emerald-800", active: "bg-emerald-100 text-emerald-800",
  trial: "bg-cyan-100 text-cyan-800", trialing: "bg-cyan-100 text-cyan-800", COMPLETED: "bg-emerald-100 text-emerald-800",
  SUSPENDIDO: "bg-amber-100 text-amber-800", suspendida: "bg-amber-100 text-amber-800", suspended: "bg-amber-100 text-amber-800",
  REVOCADO: "bg-rose-100 text-rose-800", cancelada: "bg-rose-100 text-rose-800", canceled: "bg-rose-100 text-rose-800",
  AUTORIZADA: "bg-indigo-100 text-indigo-800", EN_SESION: "bg-violet-100 text-violet-800",
  CONFIRMADO: "bg-emerald-100 text-emerald-800", DENEGADO: "bg-rose-100 text-rose-800", CONFLICTO: "bg-amber-100 text-amber-800",
};

export function EstadoBadge({ estado }: { estado?: unknown }) {
  const value = typeof estado === "string" ? estado : "SIN_ESTADO";
  return <Badge variant="secondary" className={colores[value] ?? "bg-slate-100 text-slate-700"}>{value.replaceAll("_", " ")}</Badge>;
}

export function LoadingState({ label = "Cargando datos de plataforma…" }: { label?: string }) {
  return <Card><CardContent className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-500"><LoaderCircle className="size-5 animate-spin" />{label}</CardContent></Card>;
}

export function EmptyState({ title = "Sin resultados", description = "No existen registros para los filtros actuales." }: { title?: string; description?: string }) {
  return <Card><CardContent className="flex min-h-48 flex-col items-center justify-center text-center"><Inbox className="mb-3 size-8 text-slate-300" /><p className="font-medium">{title}</p><p className="mt-1 text-sm text-slate-500">{description}</p></CardContent></Card>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <Card className="border-rose-200"><CardContent className="flex min-h-40 flex-col items-center justify-center text-center"><AlertCircle className="mb-3 size-8 text-rose-500" /><p className="font-medium">No fue posible cargar la información</p><p className="mt-1 max-w-lg text-sm text-slate-500">{message}</p>{retry && <Button variant="outline" className="mt-4" onClick={retry}><RefreshCw className="mr-2 size-4" />Reintentar</Button>}</CardContent></Card>;
}

export function fecha(value: any) {
  if (!value) return "—";
  const millis = typeof value.toMillis === "function" ? value.toMillis() : value.seconds ? value.seconds * 1000 : NaN;
  return Number.isFinite(millis) ? new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(millis) : String(value);
}

