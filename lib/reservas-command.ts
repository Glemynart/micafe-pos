import { getFunctions, httpsCallable } from "firebase/functions";

type ReservaCommandPayload = Record<string, unknown>;

function commandId(operacion: string, reservaId: string) {
  return `reserva_${operacion}_${reservaId}`;
}

export async function ejecutarComandoReserva<T>(
  operacion: "cancelar" | "completar",
  reservaId: string,
  payload: ReservaCommandPayload,
): Promise<T> {
  const id = commandId(operacion, reservaId);
  const ejecutar = httpsCallable<{
    commandId: string;
    idempotencyKey: string;
    correlationId: string;
    causationId: string;
    payload: ReservaCommandPayload;
  }, T>(getFunctions(), `${operacion}ReservaOperativaV1`);
  const respuesta = await ejecutar({
    commandId: id,
    idempotencyKey: id,
    correlationId: `reserva_corr_${operacion}_${reservaId}`,
    causationId: id,
    payload: { reservaId, ...payload },
  });
  return respuesta.data;
}
