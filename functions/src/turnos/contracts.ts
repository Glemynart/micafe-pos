/** Contratos puros de R1-A. No son una Callable ni una autoridad de tenant. */
export const ABRIR_TURNO_OPERATIVO_V1 = "abrirTurnoOperativoV1" as const;

export interface PayloadAbrirTurno {
  baseApertura: number;
  notasApertura: string;
}

export interface EnvelopeAbrirTurno {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: string | null;
  motivo: string | null;
  payload: PayloadAbrirTurno;
}

export interface ResultadoAbrirTurno {
  commandId: string;
  turnoId: string;
  cajeroId: string;
  estado: "abierto";
  correlationId: string;
}

export interface ReferenciasOperacionAperturaTurno {
  turnoId: string;
  turnoPath: string;
  candadoPath: string;
  reciboPath: string;
  indiceIdempotenciaPath: string;
  auditoriaPath: string;
}

export interface BorradorReciboAperturaTurno {
  empresaId: string;
  commandId: string;
  idempotencyKey: string;
  tipo: typeof ABRIR_TURNO_OPERATIVO_V1;
  huella: string;
  actor: { uid: string; rolEfectivo: string };
  correlationId: string;
  motivo: null;
  resultado: ResultadoAbrirTurno;
  referencias: ReferenciasOperacionAperturaTurno;
  estado: "CONFIRMADO";
}

export interface BorradorIndiceIdempotenciaAperturaTurno {
  empresaId: string;
  idempotencyKey: string;
  commandId: string;
  huella: string;
  reciboPath: string;
}

export interface BorradorAuditoriaAperturaTurno {
  empresaId: string;
  tipo: "TurnoAbierto";
  resultado: "CONFIRMADO";
  actor: { uid: string; rolEfectivo: string };
  comando: {
    id: string;
    tipo: typeof ABRIR_TURNO_OPERATIVO_V1;
    idempotencyKey: string;
    huella: string;
    correlationId: string;
  };
  motivo: null;
  intencion: PayloadAbrirTurno;
  referencias: ReferenciasOperacionAperturaTurno;
}

export interface BorradoresConfirmacionAperturaTurno {
  recibo: BorradorReciboAperturaTurno;
  indice: BorradorIndiceIdempotenciaAperturaTurno;
  auditoria: BorradorAuditoriaAperturaTurno;
}

export class ErrorContratoAperturaTurno extends Error {
  readonly code = "PAYLOAD_INVALID" as const;

  constructor() {
    super("PAYLOAD_INVALID");
    this.name = "ErrorContratoAperturaTurno";
  }
}
