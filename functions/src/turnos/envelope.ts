import { esTextoCanonico, normalizarTexto } from "../../../lib/configuracion/normalizacion";
import {
  type EnvelopeAbrirTurno,
  ErrorContratoAperturaTurno,
  type PayloadAbrirTurno,
} from "./contracts";

const IDENTIFICADOR_OPACO = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ETIQUETA_HTML = /<\/?[a-z][^>]*>/i;
const CONTENIDO_SECRETO = /(?:token|secret|api[_-]?key|password|pin|credential|authorization|bearer)\s*(?:=|:)/i;

function esRegistro(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exigirClavesExactas(value: Record<string, unknown>, claves: readonly string[]): void {
  if (Object.keys(value).some((clave) => !claves.includes(clave))) {
    throw new ErrorContratoAperturaTurno();
  }
}

function exigirIdentificador(value: unknown): string {
  if (typeof value !== "string" || !IDENTIFICADOR_OPACO.test(value)) {
    throw new ErrorContratoAperturaTurno();
  }
  return value;
}

function normalizarNotasApertura(value: unknown): string {
  if (typeof value !== "string") throw new ErrorContratoAperturaTurno();
  const normalizado = normalizarTexto(value);
  if (!esTextoCanonico(normalizado, 0, 240)
    || ETIQUETA_HTML.test(normalizado)
    || CONTENIDO_SECRETO.test(normalizado)) {
    throw new ErrorContratoAperturaTurno();
  }
  return normalizado;
}

function validarCausationId(value: unknown): null {
  if (value === undefined || value === null) return null;
  throw new ErrorContratoAperturaTurno();
}

function validarMotivo(value: unknown): null {
  if (value === undefined || value === null) return null;
  throw new ErrorContratoAperturaTurno();
}

function validarPayload(value: unknown): PayloadAbrirTurno {
  if (!esRegistro(value)) throw new ErrorContratoAperturaTurno();
  exigirClavesExactas(value, ["baseApertura", "notasApertura"]);
  if (!Number.isSafeInteger(value.baseApertura) || (value.baseApertura as number) < 0) {
    throw new ErrorContratoAperturaTurno();
  }
  return {
    baseApertura: value.baseApertura as number,
    notasApertura: value.notasApertura === undefined ? "" : normalizarNotasApertura(value.notasApertura),
  };
}

/**
 * Valida y canonicaliza la intención cerrada de apertura. Es intencionalmente
 * pura: tenant, actor, permisos y lifecycle no pertenecen al payload.
 */
export function validarEnvelopeAbrirTurno(value: unknown): EnvelopeAbrirTurno {
  if (!esRegistro(value)) throw new ErrorContratoAperturaTurno();
  exigirClavesExactas(value, [
    "commandId",
    "idempotencyKey",
    "correlationId",
    "causationId",
    "motivo",
    "payload",
  ]);
  return {
    commandId: exigirIdentificador(value.commandId),
    idempotencyKey: exigirIdentificador(value.idempotencyKey),
    correlationId: exigirIdentificador(value.correlationId),
    causationId: validarCausationId(value.causationId),
    motivo: validarMotivo(value.motivo),
    payload: validarPayload(value.payload),
  };
}
