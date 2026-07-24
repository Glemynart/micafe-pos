'use client'

import { getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseApp } from "@/lib/firebase";

export const FACULTADES_PLATAFORMA = [
  "OPERADORES_GOBERNAR",
  "COMERCIAL_GOBERNAR",
  "BOOTSTRAP_EMPRESARIAL_SOLICITAR",
  "LIFECYCLE_GOBERNAR",
  "CONSERVACION_GOBERNAR",
  "PLATAFORMA_CONSULTAR",
] as const;

export type FacultadPlataforma = (typeof FACULTADES_PLATAFORMA)[number];
export type RecursoPlataforma =
  | "empresas"
  | "planes"
  | "suscripciones"
  | "operadores"
  | "soporte"
  | "provisionamientos";

export interface ContextoPlataforma {
  uid: string;
  estado: "ACTIVO";
  facultades: FacultadPlataforma[];
  versionAutorizacion: number;
}

const functions = () => getFunctions(getFirebaseApp(), "us-central1");

async function invocar<T>(nombre: string, data: unknown = {}): Promise<T> {
  const result = await httpsCallable(functions(), nombre)(data);
  return result.data as T;
}

export const consultarContexto = () =>
  invocar<ContextoPlataforma>("consultarContextoPlataforma");

export const listarRecursos = (
  recurso: RecursoPlataforma,
  opciones: { limite?: number; estado?: string; empresaId?: string; cursor?: string } = {},
) => invocar<{ items: Record<string, any>[]; cursor: string | null }>(
  "listarRecursosPlataformaSaas",
  { recurso, ...opciones },
);

export const obtenerDetalleEmpresa = (empresaId: string) =>
  invocar<{ empresa: Record<string, any>; suscripcion: Record<string, any> | null; provisionamiento: Record<string, any> | null }>(
    "obtenerDetalleEmpresaPlataformaSaas",
    { empresaId },
  );

export const solicitarBootstrap = (entrada: Record<string, unknown>) =>
  invocar<Record<string, unknown>>("solicitarBootstrapEmpresarialSaas", entrada);

export const comandoOperador = (
  accion: "incorporar" | "facultades" | "suspender" | "reactivar" | "revocar",
  entrada: Record<string, unknown>,
) => {
  const nombres = {
    incorporar: "incorporarOperadorSaas",
    facultades: "cambiarFacultadesOperadorSaas",
    suspender: "suspenderOperadorSaas",
    reactivar: "reactivarOperadorSaas",
    revocar: "revocarOperadorSaas",
  };
  return invocar<Record<string, unknown>>(nombres[accion], entrada);
};

export const comandoComercial = (tipo: string, entrada: Record<string, unknown>) =>
  invocar<Record<string, unknown>>("ejecutarComandoComercialSaas", { tipo, entrada });

export const solicitarSoporte = (entrada: Record<string, unknown>) =>
  invocar<Record<string, unknown>>("solicitarSoporteSaas", entrada);

export const transicionarSoporte = (destino: string, entrada: Record<string, unknown>) =>
  invocar<Record<string, unknown>>("transicionarSoporteSaas", { destino, entrada });

export const listarSoporteTenant = () =>
  invocar<{ items: Record<string, any>[] }>("listarSoporteTenantSaas");

export const consultarAuditoria = (filtro: Record<string, unknown>, cursor?: string) =>
  invocar<{ items: Record<string, any>[]; cursor: string | null }>(
    "consultarAuditoriaPlataformaSaas",
    { filtro, limite: 50, ...(cursor ? { cursor } : {}) },
  );

export function envelope(motivoCodigo: string) {
  const id = crypto.randomUUID();
  return {
    commandId: id,
    idempotencyKey: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    causationId: null,
    motivoCodigo,
  };
}

export function mensajeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "No fue posible completar la operación.";
  if (raw.includes("PLATFORM_CONTEXT_STALE")) return "La autorización cambió. Actualiza tu sesión e intenta de nuevo.";
  if (raw.includes("PLATFORM_ACCESS_DENIED")) return "No tienes autorización para esta operación.";
  if (raw.includes("CONFLICTO_REVISION")) return "El registro cambió. Recarga antes de reintentar.";
  return raw.replace(/^FirebaseError:\s*/i, "");
}
