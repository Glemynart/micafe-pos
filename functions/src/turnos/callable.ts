import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { validarEnvelopeAbrirTurno } from "./envelope";
import { ErrorContratoAperturaTurno, type ResultadoAbrirTurno } from "./contracts";
import { ejecutarAperturaTurnoOperativo } from "./executor";

const REGION = "us-central1";

function errorTransportable(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  if (code === 10 || code === "aborted") return new HttpsError("aborted", "No fue posible abrir el turno.", { code: "ABORTED" });
  if (code === 14 || code === "unavailable") return new HttpsError("unavailable", "No fue posible abrir el turno.", { code: "UNAVAILABLE" });
  logger.error("turnos_open_failed", { errorType: error instanceof Error ? error.name : "unknown" });
  return new HttpsError("internal", "No fue posible abrir el turno.");
}

export async function manejarAbrirTurnoOperativo(
  db: any,
  request: { auth?: { uid: string; token: Record<string, unknown> }; data: unknown },
): Promise<ResultadoAbrirTurno> {
  if (!request.auth) throw new HttpsError("unauthenticated", "Autenticación requerida.", { code: "AUTH_REQUIRED" });
  const empresaId = request.auth.token.empresaId;
  if (typeof empresaId !== "string" || !empresaId.trim()) {
    throw new HttpsError("permission-denied", "Acceso denegado.", { code: "TENANT_ACCESS_DENIED" });
  }
  try {
    const envelope = validarEnvelopeAbrirTurno(request.data);
    return await ejecutarAperturaTurnoOperativo(db, { empresaId, actorUid: request.auth.uid }, envelope);
  } catch (error) {
    if (error instanceof ErrorContratoAperturaTurno) {
      throw new HttpsError("invalid-argument", "Datos de apertura inválidos.", { code: error.code });
    }
    throw errorTransportable(error);
  }
}

export const abrirTurnoOperativoV1 = onCall(
  { region: REGION },
  async (request): Promise<ResultadoAbrirTurno> => manejarAbrirTurnoOperativo(getFirestore(), request),
);
