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
  /**
   * Referencia opaca a la obligación de auditoría de plataforma (ADR-SAAS-012 Anexo A)
   * asociada a la solicitud/finalización de este provisionamiento. No es autoridad de
   * dominio: permite que un reintento idempotente recupere el mismo identificador ya
   * generado en lugar de perderlo. `null` cuando el provisionamiento no fue solicitado
   * por la capa de plataforma (p. ej. bootstrap de autoservicio).
   */
  obligacionId?: string | null;
  obligacionCompletadoId?: string | null;
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
  /** Ver `ProvisionamientoEmpresarial.obligacionId`/`obligacionCompletadoId`. */
  obligacionId?: string | null;
  obligacionCompletadoId?: string | null;
}
