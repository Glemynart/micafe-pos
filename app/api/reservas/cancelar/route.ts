import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { cancelarHoldPendiente } from './service'

function esInputValido(body: unknown): body is { reservaId: string } {
  return !!body
    && typeof (body as { reservaId?: unknown }).reservaId === 'string'
    && (body as { reservaId: string }).reservaId.trim().length > 0
}
/** Liberación pública de un hold pendiente; las coordenadas se derivan de la reserva. */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!esInputValido(body)) return NextResponse.json({ error: 'reservaId inválido' }, { status: 400 })

    const db = getAdminDb()
    const resultado = await cancelarHoldPendiente(db, body.reservaId)

    if (resultado === 'YA_CANCELADA') return NextResponse.json({ ok: true, cancelada: false })
    if (resultado === 'RESERVA_AJENA' || resultado === 'RESERVA_NO_ENCONTRADA') {
      return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })
    }
    if (resultado === 'RESERVA_NO_CANCELABLE' || resultado === 'RESERVA_INCONSISTENTE' || resultado === 'EMPRESA_NO_OPERATIVA') {
      return NextResponse.json({ error: 'La reserva ya no puede cancelarse' }, { status: 409 })
    }

    return NextResponse.json({ ok: true, cancelada: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'EMPRESA_FUNDACIONAL_NO_ENCONTRADA') {
      return NextResponse.json({ error: 'Configuración de reservas no disponible' }, { status: 503 })
    }
    console.error('Error en /api/reservas/cancelar:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
