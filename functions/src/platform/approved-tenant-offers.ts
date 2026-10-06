import { HttpsError } from "firebase-functions/v2/https";

/**
 * Gate I's durable Product Owner approval is the authority for these terms.
 * Keep this server-only projection aligned with:
 * docs/goals/evidence/G-SAAS-02-E2-2-GATE-I-COMMERCIAL-OFFER-APPROVAL-2026-10-06.md
 * The browser may select the opaque Gate I approval code and dates, never the
 * commercial terms. A future approval must be added with reviewed evidence.
 */
export type TerminosOfertaTenantAprobada = {
  ofertaId: string;
  empresaIdObjetivo: string;
  nombreEmpresaObjetivo: string;
  planIdBase: string;
  planVersionBase: number;
  periodicidad: "ANUAL";
  precioAcordado: { importe: number; moneda: "COP" };
  motivoCodigo: string;
  referenciaAprobacion: string;
};

const APROBACIONES: Record<string, TerminosOfertaTenantAprobada> = {
  GATE_I_OFFER_1: {
    ofertaId: "oferta-distribuidora-jimenez-2026",
    empresaIdObjetivo: "distribuidora-las-jimenez",
    nombreEmpresaObjetivo: "Distribuidora Las Jiménez",
    planIdBase: "mvp_comercial",
    planVersionBase: 2,
    periodicidad: "ANUAL",
    precioAcordado: { importe: 1_600_000, moneda: "COP" },
    motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion: "G-SAAS-02-PO-OFFER-DISTRIBUIDORA-LAS-JIMENEZ-2026-10-06",
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
] as const;

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

const RUNTIME_STAGING = "micafe-pos-staging";

export function exigirRuntimeOfertaTenantStaging(
  projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT,
): void {
  if (projectId !== RUNTIME_STAGING) {
    throw new HttpsError("failed-precondition", "OFERTA_COMERCIAL_RUNTIME_DENIED");
  }
}
