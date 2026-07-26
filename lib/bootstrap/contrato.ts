/**
 * Contratos B5 — Bootstrap Empresarial Atómico e Idempotente.
 * Conforme a ADR-SAAS-007 y MT-ARQUITECTURA-SAAS-MULTIEMPRESA.md
 */

export type EstadoProvisionamiento =
  | "REQUESTED"
  | "CORE_COMMITTED"
  | "CREDENTIAL_ISSUED"
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
  ultimoPasoConfirmado?: "REQUESTED" | "CORE_COMMITTED" | "CREDENTIAL_ISSUED" | "CLAIMS_ISSUED" | "COMPLETED";
  errorRecuperable?: string | null;
  /**
   * ADR-SAAS-013 §7.4 — registro de la credencial operativa inicial emitida
   * en el paso H (entre CORE_COMMITTED y CLAIMS_ISSUED). Nunca guarda el
   * PIN: solo la referencia necesaria para trazabilidad y para que un
   * reintento idempotente confirme que ya se emitió, sin poder reexponerlo.
   */
  credencialInicial?: { codigo: string; incorporacionId: string; entregadaEn: unknown } | null;
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
  /**
   * ADR-SAAS-013 (Capa 4) — exactamente uno de `ownerUid`/`nombreAdministrador`.
   * `ownerUid`: reutiliza un principal de Firebase Auth ya existente (p. ej.
   * alguien que ya es operador de plataforma). `nombreAdministrador`: no
   * existe ningún UID todavía — el propio Bootstrap crea el principal ancla
   * (sin email/password, deshabilitado hasta que el paso de claims lo
   * habilite) y lo persiste para que un reintento lo reutilice en vez de
   * crear uno nuevo.
   */
  ownerUid?: string;
  nombreAdministrador?: string;
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
  /**
   * ADR-SAAS-013 — credencial operativa inicial del admin. `pinTemporal` es
   * `null` en cualquier respuesta que no sea la emisión original: nunca se
   * reexpone un PIN ya entregado (ni en reintentos ni en réplicas
   * idempotentes). El llamador que necesite recuperar el acceso usa el
   * comando de reprovisionamiento (ADR-SAAS-013 §4.4), no este resultado.
   */
  credencialInicial?: { codigo: string; pinTemporal: string | null } | null;
}
