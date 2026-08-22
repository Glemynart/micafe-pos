import { NextResponse } from 'next/server'

/**
 * La URL legacy de Next ya no procesa pagos. El webhook seguro vive en la
 * Function `wompiReservasWebhookV1` y requiere configuración externa explícita.
 */
export async function procesarWebhookWompi(_req: Request) {
  return NextResponse.json({ error: 'Webhook migrado y no activado' }, { status: 503 })
}
