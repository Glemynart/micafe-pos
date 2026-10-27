import { createHash } from "node:crypto";
import {
  esSnapshotContratoCompatible,
  readinessComercial,
  type SnapshotContrato,
  type Suscripcion,
} from "../../../lib/suscripciones/contrato";

export const CONCESION_REPORTES_DIANA = {
  empresaId: "distribuidora-las-jimenez",
  concesionId: "reports-diana-mvp-comercial-v2",
  capacidad: "reports",
  planId: "mvp_comercial",
  planVersion: 2,
  precioCop: 1_600_000,
  trialDias: 15,
  ofertaComercialId: "oferta-distribuidora-jimenez-2026",
  referenciaAceptacionCliente: "G-SAAS-02-DIANA-TRIAL-15-DIAS-ACEPTADO-2026-10-23",
} as const;

export interface ConcesionCapacidadReportes {
  schemaVersion: 1;
  concesionId: typeof CONCESION_REPORTES_DIANA.concesionId;
  empresaId: typeof CONCESION_REPORTES_DIANA.empresaId;
  capacidad: typeof CONCESION_REPORTES_DIANA.capacidad;
  planId: typeof CONCESION_REPORTES_DIANA.planId;
  planVersion: typeof CONCESION_REPORTES_DIANA.planVersion;
  tipoContrato: "SUSCRIPCION" | "RELACION_CONTRACTUAL";
  contratoId: string;
  revisionContratoAlConceder: number;
  huellaSnapshotContrato: string;
  concedidaPor: string;
  commandId: string;
  creadaEn: unknown;
}

export interface VinculoContratoReportes {
  tipoContrato: ConcesionCapacidadReportes["tipoContrato"];
  contratoId: string;
  revision: number;
}

function canonizar(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonizar);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonizar(item)]),
  );
}

export function huellaSnapshotContrato(snapshot: SnapshotContrato): string {
  return createHash("sha256").update(JSON.stringify(canonizar(snapshot))).digest("hex");
}

export function esContratoActualElegibleParaReportes(
  empresaId: string,
  estadoEmpresa: unknown,
  suscripcion: Suscripcion,
  hoy: string,
): boolean {
  const snapshot = suscripcion.snapshotContrato;
  if (empresaId !== CONCESION_REPORTES_DIANA.empresaId
    || (estadoEmpresa !== "trial" && estadoEmpresa !== "activa")
    || suscripcion.empresaId !== CONCESION_REPORTES_DIANA.empresaId
    || suscripcion.planId !== CONCESION_REPORTES_DIANA.planId
    || suscripcion.planVersion !== CONCESION_REPORTES_DIANA.planVersion
    || (suscripcion.estado !== "trialing" && suscripcion.estado !== "active")
    || !snapshot
    || !esSnapshotContratoCompatible(snapshot)
    || snapshot.planId !== CONCESION_REPORTES_DIANA.planId
    || snapshot.planVersion !== CONCESION_REPORTES_DIANA.planVersion
    || snapshot.periodicidad !== "ANUAL"
    || snapshot.precio.importe !== CONCESION_REPORTES_DIANA.precioCop
    || snapshot.precio.moneda !== "COP"
    || snapshot.capacidades.includes(CONCESION_REPORTES_DIANA.capacidad)
    || snapshot.schemaVersion !== 2
    || snapshot.trialDias !== CONCESION_REPORTES_DIANA.trialDias
    || snapshot.ofertaComercialId !== CONCESION_REPORTES_DIANA.ofertaComercialId
    || snapshot.referenciaAceptacionCliente !== CONCESION_REPORTES_DIANA.referenciaAceptacionCliente) {
    return false;
  }

  if (suscripcion.estado === "trialing" && estadoEmpresa !== "trial") return false;
  if (suscripcion.estado === "active" && estadoEmpresa !== "activa") return false;
  return readinessComercial(suscripcion, hoy);
}

export function esConcesionReportesEfectiva(
  concesion: unknown,
  empresaId: string,
  estadoEmpresa: unknown,
  suscripcion: Suscripcion,
  contratoVigente: VinculoContratoReportes,
  revocada: boolean,
  hoy: string,
): concesion is ConcesionCapacidadReportes {
  if (revocada || !concesion || typeof concesion !== "object" || Array.isArray(concesion)) return false;
  const data = concesion as Partial<ConcesionCapacidadReportes>;
  const snapshot = suscripcion.snapshotContrato;
  return !!snapshot
    && data.schemaVersion === 1
    && data.concesionId === CONCESION_REPORTES_DIANA.concesionId
    && data.empresaId === CONCESION_REPORTES_DIANA.empresaId
    && data.capacidad === CONCESION_REPORTES_DIANA.capacidad
    && data.planId === CONCESION_REPORTES_DIANA.planId
    && data.planVersion === CONCESION_REPORTES_DIANA.planVersion
    && data.tipoContrato === contratoVigente.tipoContrato
    && data.contratoId === contratoVigente.contratoId
    && Number.isSafeInteger(data.revisionContratoAlConceder)
    && (data.revisionContratoAlConceder as number) > 0
    && (data.revisionContratoAlConceder as number) <= contratoVigente.revision
    && typeof data.huellaSnapshotContrato === "string"
    && data.huellaSnapshotContrato === huellaSnapshotContrato(snapshot)
    && esContratoActualElegibleParaReportes(
      empresaId,
      estadoEmpresa,
      suscripcion,
      hoy,
    );
}
