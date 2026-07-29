import { createHash } from "node:crypto";
import {
  ABRIR_TURNO_OPERATIVO_V1,
  type BorradoresConfirmacionAperturaTurno,
  type EnvelopeAbrirTurno,
  type ReferenciasOperacionAperturaTurno,
  type ResultadoAbrirTurno,
} from "./contracts";
import { crearIdentificadorInterno } from "./identificadores";

export const OPERACIONES_COMANDOS_COLLECTION = "operaciones_comandos";
export const OPERACIONES_COMMAND_IDEMPOTENCY_COLLECTION = "operaciones_command_idempotency";
export const OPERACIONES_AUDITORIA_COLLECTION = "operaciones_auditoria";

function serializarCanonico(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serializarCanonico).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([clave, item]) => `${JSON.stringify(clave)}:${serializarCanonico(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** La identidad del reintento no forma parte de la intención semántica. */
export function crearHuellaSemanticaAperturaTurno(envelope: EnvelopeAbrirTurno): string {
  return createHash("sha256")
    .update(serializarCanonico({
      tipo: ABRIR_TURNO_OPERATIVO_V1,
      causationId: envelope.causationId,
      motivo: envelope.motivo,
      payload: envelope.payload,
    }))
    .digest("hex");
}

export function crearReferenciasOperacionAperturaTurno(
  empresaId: string,
  envelope: Pick<EnvelopeAbrirTurno, "commandId" | "idempotencyKey">,
  efecto: { turnoId: string; actorUid: string },
): ReferenciasOperacionAperturaTurno {
  return {
    turnoId: efecto.turnoId,
    turnoPath: `turnos/${efecto.turnoId}`,
    candadoPath: `turnos_activos/${crearIdentificadorInterno(empresaId, efecto.actorUid)}`,
    reciboPath: `${OPERACIONES_COMANDOS_COLLECTION}/${crearIdentificadorInterno(empresaId, envelope.commandId)}`,
    indiceIdempotenciaPath: `${OPERACIONES_COMMAND_IDEMPOTENCY_COLLECTION}/${crearIdentificadorInterno(empresaId, envelope.idempotencyKey)}`,
    auditoriaPath: `${OPERACIONES_AUDITORIA_COLLECTION}/${crearIdentificadorInterno(empresaId, envelope.commandId)}`,
  };
}

export function crearBorradoresConfirmacionAperturaTurno(input: {
  empresaId: string;
  envelope: EnvelopeAbrirTurno;
  huella: string;
  actor: { uid: string; rolEfectivo: string };
  resultado: ResultadoAbrirTurno;
  referencias: ReferenciasOperacionAperturaTurno;
}): BorradoresConfirmacionAperturaTurno {
  const { empresaId, envelope, huella, actor, resultado, referencias } = input;
  return {
    recibo: {
      empresaId,
      commandId: envelope.commandId,
      idempotencyKey: envelope.idempotencyKey,
      tipo: ABRIR_TURNO_OPERATIVO_V1,
      huella,
      actor,
      correlationId: envelope.correlationId,
      // R1-A reserva motivo para ajustes/correcciones; apertura siempre audita null.
      motivo: null,
      resultado,
      referencias,
      estado: "CONFIRMADO",
    },
    indice: {
      empresaId,
      idempotencyKey: envelope.idempotencyKey,
      commandId: envelope.commandId,
      huella,
      reciboPath: referencias.reciboPath,
    },
    auditoria: {
      empresaId,
      tipo: "TurnoAbierto",
      resultado: "CONFIRMADO",
      actor,
      comando: {
        id: envelope.commandId,
        tipo: ABRIR_TURNO_OPERATIVO_V1,
        idempotencyKey: envelope.idempotencyKey,
        huella,
        correlationId: envelope.correlationId,
      },
      motivo: null,
      intencion: envelope.payload,
      referencias,
    },
  };
}
