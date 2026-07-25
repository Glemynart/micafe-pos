import { HttpsError } from "firebase-functions/v2/https";
import type { EnvelopePlataforma } from "./contracts";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function exigirId(value: unknown, codigo = "IDENTIFICADOR_INVALIDO"): string {
  if (typeof value !== "string" || !ID.test(value)) {
    throw new HttpsError("invalid-argument", codigo);
  }
  return value;
}

export function exigirMotivo(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128 || !ID.test(value)) {
    throw new HttpsError("invalid-argument", "MOTIVO_INVALIDO");
  }
  return value;
}

export function validarEnvelope(value: unknown): asserts value is EnvelopePlataforma {
  if (!value || typeof value !== "object") {
    throw new HttpsError("invalid-argument", "ENVELOPE_PLATAFORMA_INVALIDO");
  }
  const data = value as Record<string, unknown>;
  exigirId(data.commandId, "COMMAND_ID_INVALIDO");
  exigirId(data.idempotencyKey, "IDEMPOTENCY_KEY_INVALIDA");
  exigirId(data.correlationId, "CORRELACION_INVALIDA");
  if (data.causationId !== null) exigirId(data.causationId, "CAUSACION_INVALIDA");
  exigirMotivo(data.motivoCodigo);
}

