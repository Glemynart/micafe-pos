/**
 * Contratos B5 — Bootstrap Empresarial Atómico e Idempotente.
 * Conforme a ADR-SAAS-007 y MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md
 */

export type EstadoProvisionamiento =
  | "REQUESTED"
  | "CORE_COMMITTED"
  | "CLAIMS_ISSUED"
  | "COMPLETED"
  | "RETRYABLE_FAILURE"
  | "REJECTED";

export interface ProvisionamientoEmpresarial {
  provisionamientoId: string;
  idempotencyKey: string;
  fingerprint: string;
  ownerUid: string;
  empresaId: string;
  nombreComercial: string;
  paisFiscal: string;
  planId: string;
  planVersion: number;
  estado: EstadoProvisionamiento;
  ultimoPasoConfirmado?: "REQUESTED" | "CORE_COMMITTED" | "CLAIMS_ISSUED" | "COMPLETED";
  errorRecuperable?: string | null;
  schemaVersion: 1;
  creadoEn: unknown;
  actualizadoEn: unknown;
}

export interface EntradaBootstrapEmpresarial {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string;
  ownerUid: string;
  empresaId: string;
  nombreComercial: string;
  paisFiscal: string;
  planId: string;
  planVersion: number;
  trialDias?: number;
}

export interface ResultadoBootstrapEmpresarial {
  provisionamientoId: string;
  empresaId: string;
  estado: EstadoProvisionamiento;
  claimsEmitidos: boolean;
  idempotente: boolean;
}
