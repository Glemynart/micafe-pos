import { httpsCallable } from 'firebase/functions'
import { getFirebaseFunctions } from './firebase'

export interface ItemSeparacion {
  uid: string
  cantidad: number
}

/** La separación se ejecuta atómicamente en Functions; el actor no viaja en el payload. */
export async function separarCuenta(pedidoOrigenId: string, itemsToMove: ItemSeparacion[]): Promise<string> {
  const commandId = `salon:separarCuentaSalonV1:${crypto.randomUUID()}`
  const ejecutar = httpsCallable<{
    commandId: string
    idempotencyKey: string
    correlationId: string
    causationId: null
    motivo: null
    payload: { pedidoOrigenId: string; itemsToMove: ItemSeparacion[] }
  }, { pedidoNuevoId: string }>(getFirebaseFunctions(), 'separarCuentaSalonV1')
  const resultado = await ejecutar({
    commandId,
    idempotencyKey: commandId,
    correlationId: `corr-${commandId}`,
    causationId: null,
    motivo: null,
    payload: { pedidoOrigenId, itemsToMove },
  })
  return resultado.data.pedidoNuevoId
}
