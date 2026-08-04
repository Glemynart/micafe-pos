import { httpsCallable } from 'firebase/functions'
import { getFirebaseFunctions } from './firebase'

/** La unión se ejecuta atómicamente en Functions; el actor se deriva de la sesión. */
export async function unirCuentas(pedidoDestinoId: string, pedidosOrigenIds: string[]): Promise<void> {
  const commandId = `salon:unirCuentasSalonV1:${crypto.randomUUID()}`
  const ejecutar = httpsCallable(getFirebaseFunctions(), 'unirCuentasSalonV1')
  await ejecutar({
    commandId,
    idempotencyKey: commandId,
    correlationId: `corr-${commandId}`,
    causationId: null,
    motivo: null,
    payload: { pedidoDestinoId, pedidosOrigenIds },
  })
}
