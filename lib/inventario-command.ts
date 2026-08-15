import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/lib/firebase";

export interface InventarioEnvelope {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  motivo?: string | null;
  payload: Record<string, unknown>;
}

export function crearEnvelopeInventario(payload: Record<string, unknown>, motivo?: string | null): InventarioEnvelope {
  const commandId = `inventario:${crypto.randomUUID()}`;
  return {
    commandId,
    idempotencyKey: commandId,
    correlationId: `inventario:${crypto.randomUUID()}`,
    motivo: motivo ?? null,
    payload,
  };
}

export async function ejecutarComandoInventario<TResult>(nombre: string, envelope: InventarioEnvelope): Promise<TResult> {
  const callable = httpsCallable<InventarioEnvelope, TResult>(getFirebaseFunctions(), nombre);
  return (await callable(envelope)).data;
}
