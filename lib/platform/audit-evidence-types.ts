export type CompatibilidadEvidenciaAuditoria = "SOPORTADA" | "INVALIDA" | "NO_SOPORTADA";

export interface ProyeccionEvidenciaAuditoria {
  id: string;
  schemaVersion?: number;
  evidenciaId?: string;
  tipo?: string;
  resultado?: string;
  compatibilidadSchemaVersion: CompatibilidadEvidenciaAuditoria;
  diagnosticoCompatibilidad?: string;
  detalle?: Record<string, unknown>;
  detalleDiagnostico?: { campos: string[]; tipos: Record<string, string> };
  correlacionId?: string;
  registradoEn?: unknown;
  actor?: { uid?: string | null; tipo?: string };
  agregado?: { id?: string; tipo?: string };
  motivo?: { codigo?: string; resumen?: string | null };
}
