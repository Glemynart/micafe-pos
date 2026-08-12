/** Contratos B3: autoridad comercial separada del lifecycle de Empresa. */
export type EstadoPlan = "BORRADOR" | "PUBLICADA" | "RETIRADA";
export type EstadoSuscripcion = "trialing" | "active" | "past_due" | "suspended" | "canceled";
export type EstadoEmpresaLifecycle = "trial" | "activa" | "suspendida" | "cancelada" | "archivada" | "eliminada";

export interface PrecioPlan {
  importe: number;
  moneda: string;
}

export interface FiscalidadContrato {
  pais?: string;
  modalidad?: string;
  habilitada?: boolean;
}

export interface SnapshotContrato {
  schemaVersion: 1;
  planId: string;
  planVersion: number;
  codigoPlan: string;
  periodicidad: "ANUAL";
  precio: PrecioPlan;
  capacidades: string[];
  limites: Record<string, { unidad: string; valor: number }>;
  sedeConceptual: { cantidad: 1 };
  fiscalidad: FiscalidadContrato | null;
  vigencia: { inicio: string; fin: string };
}

export interface PlanVersion {
  planId: string; codigo: string; planVersion: number; estado: EstadoPlan;
  capacidades: string[]; limites: Record<string, { unidad: string; valor: number }>;
  periodicidad: "MENSUAL" | "ANUAL" | "SIN_VENCIMIENTO";
  /** Optional for historical catalog versions; mandatory for ANUAL MT-U9. */
  precio?: PrecioPlan;
  grandfathered: boolean; revision: number; schemaVersion: 1;
}
export interface Suscripcion {
  empresaId: string; planId: string; planVersion: number; estado: EstadoSuscripcion;
  trialInicio?: string; trialFin?: string; periodoInicio?: string; periodoFin?: string;
  graceFin?: string; cancelacionProgramadaPara?: string; canceladaEn?: string;
  /** Present only on new annual MT-U9 subscriptions; never rewritten. */
  snapshotContrato?: SnapshotContrato;
  ultimoPagoAnualId?: string;
  revision: number; schemaVersion: 1;
}
export interface EmpresaLifecycle { estado: EstadoEmpresaLifecycle; revision: number; empresaId?: string }

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
export function esIdComercial(valor: unknown): valor is string { return typeof valor === "string" && ID.test(valor); }
/** Fecha de negocio UTC canónica; nunca recibe texto en Date. */
export function esFechaComercial(valor: unknown): valor is string {
  if (typeof valor !== "string") return false; const m = FECHA.exec(valor); if (!m) return false;
  const y = Number(m[1]), mes = Number(m[2]), d = Number(m[3]); if (y < 1 || mes < 1 || mes > 12 || d < 1) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
}
export function fechaComercialUtc(reloj: Date = new Date()): string { if (!Number.isFinite(reloj.getTime())) throw new Error("RELOJ_SERVIDOR_INVALIDO"); return reloj.toISOString().slice(0, 10); }
export function rangoComercialValido(inicio: unknown, fin: unknown): inicio is string { return esFechaComercial(inicio) && esFechaComercial(fin) && inicio < fin; }
export function readinessComercial(s: Suscripcion, hoy = fechaComercialUtc()): boolean {
  if (s.estado === "trialing") return !!s.trialInicio && !!s.trialFin && rangoComercialValido(s.trialInicio, s.trialFin) && hoy < s.trialFin;
  if (s.estado === "active") return !!s.periodoInicio && !!s.periodoFin && rangoComercialValido(s.periodoInicio, s.periodoFin) && hoy < s.periodoFin && (!s.cancelacionProgramadaPara || hoy < s.cancelacionProgramadaPara);
  return s.estado === "past_due" && !!s.graceFin && esFechaComercial(s.graceFin) && hoy < s.graceFin;
}
export const transicionesSuscripcion: Record<EstadoSuscripcion, readonly EstadoSuscripcion[]> = {
  trialing: ["active", "suspended", "canceled"], active: ["past_due", "suspended", "canceled"],
  past_due: ["active", "suspended", "canceled"], suspended: ["active", "canceled"], canceled: ["active"],
};
export const transicionesEmpresa: Record<EstadoEmpresaLifecycle, readonly EstadoEmpresaLifecycle[]> = {
  trial: ["activa", "suspendida", "cancelada"], activa: ["suspendida", "cancelada"],
  suspendida: ["activa", "cancelada"], cancelada: ["activa", "archivada"], archivada: ["cancelada", "eliminada"], eliminada: [],
};
