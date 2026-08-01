'use client'

import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/lib/firebase";
import type { EntradaBootstrapEmpresarial, ResultadoBootstrapEmpresarial } from "@/lib/bootstrap/contrato";

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

const functions = () => getFirebaseFunctions("us-central1");

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

export type EstadoCredencialInicial = "SIN_PROVISIONAR" | "PENDIENTE_ACTIVACION" | "EXPIRADA" | "ACTIVA";
export type EstadoAccesoAdministradorInicial = "DISPONIBLE" | "ACTIVO" | "BLOQUEADO" | "CREDENCIAL_TEMPORAL_PENDIENTE" | "CREDENCIAL_EXPIRADA";
// Contrato reutilizado tal cual desde `lib/bootstrap/contrato.ts` — el mismo
// que valida `functions/src/bootstrap/service.ts` — para que un cambio de
// payload en el Bootstrap canónico lo detecte el compilador aquí, no un E2E.
export type { ResultadoBootstrapEmpresarial };
export type TipoAlertaOperador =
  | "BOOTSTRAP_RECUPERABLE"
  | "ADMINISTRADOR_PENDIENTE_ACTIVAR"
  | "CREDENCIAL_TEMPORAL_EXPIRADA"
  | "EMPRESA_SIN_SUSCRIPCION"
  | "TRIAL_PROXIMO_VENCER"
  | "ONBOARDING_DETENIDO"
  | "READINESS_OPERATIVO_INCOMPLETO"
  | "EMPRESA_SUSPENDIDA"
  | "INCONSISTENCIA_CANONICA";

export interface ResumenOperadorSaas {
  empresasTotal: number;
  alertas: Array<{
    tipo: TipoAlertaOperador;
    empresaId: string;
    empresaNombre: string;
    severidad: "CRITICA" | "ADVERTENCIA";
  }>;
  fuentesDegradadas: Array<{ empresaId: string; fuente: "DETALLE_EMPRESA" | "ONBOARDING" }>;
}

export const obtenerResumenOperador = () =>
  invocar<ResumenOperadorSaas>("obtenerResumenOperadorSaas");

export const obtenerDetalleEmpresa = (empresaId: string) =>
  invocar<{
    empresa: Record<string, any>;
    suscripcion: Record<string, any> | null;
    versionPlan: { planId: string; planVersion: number; codigo: string | null; estado: string | null } | null;
    diagnosticoConfiguracion: {
      disponible: boolean;
      readiness: {
        operativa: { lista: boolean; causas: readonly string[] };
        fiscal: { lista: boolean; causas: readonly string[] };
      } | null;
      modulosHabilitados: string[];
    };
    provisionamiento: Record<string, any> | null;
    adminInicial: { rol: string | null; estado: string | null; activo: boolean | null } | null;
    credencialInicial: { estado: EstadoCredencialInicial; incorporacionId: string | null; puedeReemitir: boolean };
    estadoAccesoInicial: EstadoAccesoAdministradorInicial;
  }>(
    "obtenerDetalleEmpresaPlataformaSaas",
    { empresaId },
  );

// Campos de negocio del contrato canónico (`EntradaBootstrapEmpresarial`) más
// el envelope de plataforma que ya produce `envelope()` — sin redeclarar
// ninguno de los dos. El envelope de dominio exige `causationId: string`,
// pero `envelope()` emite `causationId: null` para un comando raíz (lo
// normaliza `solicitarBootstrapEmpresarial` en el backend, ver
// functions/src/platform/operations.ts), así que se compone en vez de
// intersectar con el contrato de dominio completo.
export type SolicitudBootstrap = ReturnType<typeof envelope>
  & Omit<EntradaBootstrapEmpresarial, "commandId" | "idempotencyKey" | "correlationId" | "causationId">;

export const solicitarBootstrap = (entrada: SolicitudBootstrap) =>
  invocar<ResultadoBootstrapEmpresarial>(
    "solicitarBootstrapEmpresarialSaas",
    entrada,
  );

/** ADR-SAAS-013 §4 — primera emisión o reemisión (§4.4) de la credencial operativa inicial del admin de un tenant ya existente. */
export const provisionarCredencialInicial = (empresaId: string) =>
  invocar<{ estado: "EMITIDA" | "REEMITIDA" | "YA_EXISTENTE"; codigo: string; pinTemporal: string | null }>(
    "provisionarCredencialInicialTenantSaas",
    { ...envelope("BACKOFFICE_PROVISIONAR_CREDENCIAL_INICIAL"), empresaId },
  );

/** ADR-SAAS-013 §4.4.1 — rotación explícita de una temporal vigente sin reexponer su PIN. */
export const reemitirCredencialInicialTemporal = (empresaId: string, incorporacionId: string) =>
  invocar<{ estado: "REEMITIDA" | "YA_EXISTENTE"; codigo: string; pinTemporal: string | null }>(
    "reemitirCredencialInicialTemporalSaas",
    {
      ...envelope("REEMISION_ADMINISTRATIVA_PIN_NO_ENTREGADO"),
      empresaId,
      incorporacionId,
    },
  );

export const desbloquearAdministradorInicial = (empresaId: string) =>
  invocar<{ empresaId: string; estado: "DESBLOQUEADA"; idempotente: boolean }>(
    "desbloquearAdministradorInicialTenantSaas",
    { ...envelope("BACKOFFICE_DESBLOQUEAR_ADMINISTRADOR_INICIAL"), empresaId },
  );

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
