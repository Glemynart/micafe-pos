import { httpsCallable } from 'firebase/functions'
import { getFirebaseFunctions } from './firebase'

/** El traslado conserva la identidad del pedido y se confirma en una transacción server-side. */
export async function trasladarCuenta(pedidoId: string, mesaDestinoId: string): Promise<void> {
  const commandId = `salon:trasladarCuentaSalonV1:${crypto.randomUUID()}`
  const ejecutar = httpsCallable(getFirebaseFunctions(), 'trasladarCuentaSalonV1')
  await ejecutar({
    commandId,
    idempotencyKey: commandId,
    correlationId: `corr-${commandId}`,
    causationId: null,
    motivo: null,
    payload: { pedidoId, mesaDestinoId },
  })
}
