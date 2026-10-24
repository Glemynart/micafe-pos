/** Contratos B3: autoridad comercial separada del lifecycle de Empresa. */
export type EstadoPlan = "BORRADOR" | "PUBLICADA" | "RETIRADA";
export type EstadoSuscripcion = "trialing" | "active" | "past_due" | "suspended" | "canceled";
export type EstadoEmpresaLifecycle = "trial" | "activa" | "suspendida" | "cancelada" | "archivada" | "eliminada";

export interface PrecioPlan {
  importe: number;
  moneda: string;
}

export type EstadoOfertaComercialTenant = "BORRADOR" | "APROBADA" | "CONSUMIDA" | "REVOCADA" | "EXPIRADA";

/** ADR-SAAS-061: excepción comercial auditable, nunca una versión pública de Plan. */
interface OfertaComercialTenantBase {
  ofertaId: string;
  empresaIdObjetivo: string;
  planIdBase: string;
  planVersionBase: number;
  periodicidad: "ANUAL";
  precioAcordado: PrecioPlan;
  estado: EstadoOfertaComercialTenant;
  iniciaEn: string;
  expiraEn: string | null;
  motivoCodigo: string;
  referenciaAprobacion: string;
  revision: number;
  consumidaPor?: { empresaId: string; provisionamientoId: string };
}

export interface OfertaComercialTenantV1 extends OfertaComercialTenantBase {
  schemaVersion: 1;
}

/** ADR-SAAS-087: duración y aceptación explícitas para el caso autorizado de Diana. */
export interface OfertaComercialTenantV2 extends OfertaComercialTenantBase {
  schemaVersion: 2;
  trialDias: 15;
  referenciaAceptacionCliente: string;
  trialInicio?: string;
  trialFin?: string;
}

export type OfertaComercialTenant = OfertaComercialTenantV1 | OfertaComercialTenantV2;

export interface FiscalidadContrato {
  pais?: string;
  modalidad?: string;
  habilitada?: boolean;
}

interface SnapshotContratoBase {
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

export interface SnapshotContratoV1 extends SnapshotContratoBase {
  schemaVersion: 1;
}

/** Snapshot contractual versionado para una excepción de Trial autorizada. */
export interface SnapshotContratoV2 extends SnapshotContratoBase {
  schemaVersion: 2;
  trialDias: 15;
  ofertaComercialId: string;
  referenciaAceptacionCliente: string;
}

export type SnapshotContrato = SnapshotContratoV1 | SnapshotContratoV2;

/** Runtime guard for durable annual contract snapshots read by lifecycle paths. */
export function esSnapshotContratoCompatible(value: unknown): value is SnapshotContrato {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  const precio = snapshot.precio as Record<string, unknown> | null;
  const vigencia = snapshot.vigencia as Record<string, unknown> | null;
  const sede = snapshot.sedeConceptual as Record<string, unknown> | null;
  const limites = snapshot.limites;
  const fiscalidad = snapshot.fiscalidad;
  if ((snapshot.schemaVersion !== 1 && snapshot.schemaVersion !== 2)
    || typeof snapshot.planId !== "string" || !esIdComercial(snapshot.planId)
    || !Number.isSafeInteger(snapshot.planVersion) || (snapshot.planVersion as number) < 1
    || typeof snapshot.codigoPlan !== "string" || !snapshot.codigoPlan.trim()
    || snapshot.periodicidad !== "ANUAL"
    || !precio || !Number.isSafeInteger(precio.importe) || (precio.importe as number) <= 0
    || typeof precio.moneda !== "string" || !/^[A-Z]{3}$/.test(precio.moneda)
    || !Array.isArray(snapshot.capacidades) || !snapshot.capacidades.every((item) => typeof item === "string" && item.length > 0)
    || !limites || typeof limites !== "object" || Array.isArray(limites)
    || !sede || sede.cantidad !== 1
    || (fiscalidad !== null && (!fiscalidad || typeof fiscalidad !== "object" || Array.isArray(fiscalidad)))
    || !vigencia || !rangoComercialValido(vigencia.inicio, vigencia.fin)) return false;

  if (snapshot.schemaVersion === 1) {
    return !("trialDias" in snapshot)
      && !("ofertaComercialId" in snapshot)
      && !("referenciaAceptacionCliente" in snapshot);
  }

  return snapshot.trialDias === 15
    && snapshot.ofertaComercialId === "oferta-distribuidora-jimenez-2026"
    && snapshot.referenciaAceptacionCliente === "G-SAAS-02-DIANA-TRIAL-15-DIAS-ACEPTADO-2026-10-23"
    && Date.parse(`${vigencia.fin}T00:00:00.000Z`) - Date.parse(`${vigencia.inicio}T00:00:00.000Z`) === 15 * 86_400_000;
}

/**
 * Relación contractual append-only para una empresa que ya conserva una
 * suscripción histórica. La relación es la autoridad del contrato nuevo; el
 * documento raíz `suscripciones/{empresaId}` permanece compatible con
 * lectores legacy y no se reescribe para borrar evidencia anterior.
 */
export interface RelacionContractual {
  schemaVersion: 1;
  relacionId: string;
  empresaId: string;
  estado: EstadoSuscripcion;
  planId: string;
  planVersion: number;
  snapshotContrato: SnapshotContrato;
  origen: "bootstrap" | "transicion_contractual";
  relacionAnteriorId: string | null;
  trialInicio?: string;
  trialFin?: string;
  periodoInicio?: string;
  periodoFin?: string;
  cancelacionProgramadaPara?: string;
  canceladaEn?: string;
  ultimoPagoAnualId?: string;
  revision: number;
  creadaEn?: unknown;
  actualizadaEn?: unknown;
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
export function calcularVigenciaTrialUtc(reloj: Date, dias: number): { inicio: string; fin: string } {
  if (!Number.isFinite(reloj.getTime()) || !Number.isSafeInteger(dias) || dias < 1) {
    throw new Error("TRIAL_VIGENCIA_INVALIDA");
  }
  const inicio = fechaComercialUtc(reloj);
  const fin = fechaComercialUtc(new Date(reloj.getTime() + dias * 86_400_000));
  if (Date.parse(`${fin}T00:00:00.000Z`) - Date.parse(`${inicio}T00:00:00.000Z`) !== dias * 86_400_000) {
    throw new Error("TRIAL_VIGENCIA_INVALIDA");
  }
  return { inicio, fin };
}
export function rangoComercialValido(inicio: unknown, fin: unknown): inicio is string { return esFechaComercial(inicio) && esFechaComercial(fin) && inicio < fin; }
export function readinessComercial(s: Suscripcion, hoy = fechaComercialUtc()): boolean {
  if (s.snapshotContrato && !esSnapshotContratoCompatible(s.snapshotContrato)) return false;
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
