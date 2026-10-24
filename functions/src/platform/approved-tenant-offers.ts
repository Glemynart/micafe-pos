import { HttpsError } from "firebase-functions/v2/https";

/**
 * Gate I's durable Product Owner approval is the authority for these terms.
 * Keep this server-only projection aligned with:
 * docs/goals/evidence/G-SAAS-02-E2-2-GATE-I-COMMERCIAL-OFFER-APPROVAL-2026-10-06.md
 * The browser may select the opaque Gate I approval code and dates, never the
 * commercial terms. A future approval must be added with reviewed evidence.
 */
export type TerminosOfertaTenantAprobada = {
  schemaVersion: 1 | 2;
  ofertaId: string;
  empresaIdObjetivo: string;
  nombreEmpresaObjetivo: string;
  planIdBase: string;
  planVersionBase: number;
  periodicidad: "ANUAL";
  precioAcordado: { importe: number; moneda: string };
  motivoCodigo: string;
  referenciaAprobacion: string;
  trialDias?: 15;
  referenciaAceptacionCliente?: string;
};

const APROBACIONES: Record<string, TerminosOfertaTenantAprobada> = {
  GATE_I_OFFER_1: {
    schemaVersion: 2,
    ofertaId: "oferta-distribuidora-jimenez-2026",
    empresaIdObjetivo: "distribuidora-las-jimenez",
    nombreEmpresaObjetivo: "Distribuidora Las Jiménez",
    planIdBase: "mvp_comercial",
    planVersionBase: 2,
    periodicidad: "ANUAL",
    precioAcordado: { importe: 1_600_000, moneda: "COP" },
    motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion: "G-SAAS-02-PO-OFFER-DISTRIBUIDORA-LAS-JIMENEZ-2026-10-06",
    trialDias: 15,
    referenciaAceptacionCliente: "G-SAAS-02-DIANA-TRIAL-15-DIAS-ACEPTADO-2026-10-23",
  },
};

const CAMPOS_COMERCIALES_NO_CONFIABLES = [
  "empresaId",
  "empresaIdObjetivo",
  "nombreEmpresaObjetivo",
  "ofertaId",
  "referenciaAprobacion",
  "planId",
  "planVersion",
  "planIdBase",
  "planVersionBase",
  "periodicidad",
  "precioAcordado",
  "importe",
  "moneda",
  "motivo",
  "schemaVersion",
  "trialDias",
  "referenciaAceptacionCliente",
] as const;

/** Exact server-side allow-list used again when Bootstrap reads persisted terms. */
export function esOfertaTrial15Autorizada(value: Partial<TerminosOfertaTenantAprobada>): boolean {
  const aprobada = APROBACIONES.GATE_I_OFFER_1;
  return value.schemaVersion === 2
    && value.ofertaId === aprobada.ofertaId
    && value.empresaIdObjetivo === aprobada.empresaIdObjetivo
    && value.planIdBase === aprobada.planIdBase
    && value.planVersionBase === aprobada.planVersionBase
    && value.periodicidad === aprobada.periodicidad
    && value.precioAcordado?.importe === aprobada.precioAcordado.importe
    && value.precioAcordado?.moneda === aprobada.precioAcordado.moneda
    && value.motivoCodigo === aprobada.motivoCodigo
    && value.referenciaAprobacion === aprobada.referenciaAprobacion
    && value.trialDias === aprobada.trialDias
    && value.referenciaAceptacionCliente === aprobada.referenciaAceptacionCliente;
}

export function esExcepcionTrial15Autorizada(value: {
  schemaVersion: unknown;
  ofertaId: unknown;
  empresaIdObjetivo: unknown;
  trialDias: unknown;
  referenciaAceptacionCliente: unknown;
}): boolean {
  const aprobada = APROBACIONES.GATE_I_OFFER_1;
  return value.schemaVersion === 2
    && value.ofertaId === aprobada.ofertaId
    && value.empresaIdObjetivo === aprobada.empresaIdObjetivo
    && value.trialDias === aprobada.trialDias
    && value.referenciaAceptacionCliente === aprobada.referenciaAceptacionCliente;
}

export function esTenantConTrial15Autorizado(empresaId: unknown): boolean {
  return empresaId === APROBACIONES.GATE_I_OFFER_1.empresaIdObjetivo;
}

export function resolverTerminosOfertaTenantAprobada(
  codigoAprobacion: unknown,
  entrada?: unknown,
): TerminosOfertaTenantAprobada {
  if (typeof codigoAprobacion !== "string" || codigoAprobacion.length === 0) {
    throw new HttpsError("invalid-argument", "OFERTA_COMERCIAL_APROBACION_INVALIDA");
  }

  if (entrada && typeof entrada === "object" && !Array.isArray(entrada)) {
    const data = entrada as Record<string, unknown>;
    if (CAMPOS_COMERCIALES_NO_CONFIABLES.some((campo) => Object.prototype.hasOwnProperty.call(data, campo))) {
      throw new HttpsError("invalid-argument", "OFERTA_COMERCIAL_TERMINOS_CLIENTE_NO_ADMITIDOS");
    }
  }

  const aprobacion = Object.hasOwn(APROBACIONES, codigoAprobacion)
    ? APROBACIONES[codigoAprobacion]
    : undefined;
  if (!aprobacion) {
    throw new HttpsError("failed-precondition", "OFERTA_COMERCIAL_APROBACION_NOT_FOUND");
  }

  return { ...aprobacion, precioAcordado: { ...aprobacion.precioAcordado } };
}

const PROJECT_IDS_RUNTIME_PERMITIDOS = new Set(["micafe-pos", "micafe-pos-staging"]);

export function exigirRuntimeOfertaTenantPermitido(
  projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT,
): void {
  if (!projectId || !PROJECT_IDS_RUNTIME_PERMITIDOS.has(projectId)) {
    throw new HttpsError("failed-precondition", "OFERTA_COMERCIAL_RUNTIME_DENIED");
  }
}
