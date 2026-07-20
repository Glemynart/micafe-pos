import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

interface BloqueAgenda {
  reservaId: string
}

type ResultadoCancelacion = 'CANCELABLE' | 'YA_CANCELADA' | 'RESERVA_AJENA' | 'RESERVA_NO_CANCELABLE'

function esInputValido(body: unknown): body is { reservaId: string } {
  return !!body
    && typeof (body as { reservaId?: unknown }).reservaId === 'string'
    && (body as { reservaId: string }).reservaId.trim().length > 0
}

async function resolverEmpresaIdFundacional(db: FirebaseFirestore.Firestore): Promise<string> {
  const snap = await db.collection('empresas').where('esFundacional', '==', true).limit(1).get()
  if (snap.empty) throw new Error('EMPRESA_FUNDACIONAL_NO_ENCONTRADA')
  return snap.docs[0].id
}

export function evaluarCancelacionPublica(
  reserva: Record<string, unknown>,
  empresaIdFundacional: string,
  ahora: Date
): ResultadoCancelacion {
  if (reserva.empresaId !== empresaIdFundacional) return 'RESERVA_AJENA'
  if (reserva.estadoReserva === 'cancelada') return 'YA_CANCELADA'

  const holdExpira = typeof reserva.holdExpira === 'string' ? new Date(reserva.holdExpira) : null
  const holdVigente = holdExpira !== null && !Number.isNaN(holdExpira.getTime()) && holdExpira > ahora
  if (reserva.estadoReserva !== 'activa' || reserva.estadoPago !== 'pendiente' || !holdVigente) {
    return 'RESERVA_NO_CANCELABLE'
  }

  return 'CANCELABLE'
}

export async function cancelarHoldPendiente(
  db: FirebaseFirestore.Firestore,
  reservaId: string,
  ahora: Date = new Date()
): Promise<ResultadoCancelacion | 'RESERVA_NO_ENCONTRADA'> {
  const empresaIdFundacional = await resolverEmpresaIdFundacional(db)

  return db.runTransaction(async (tx) => {
    const reservaRef = db.collection('reservas').doc(reservaId)
    const reservaSnap = await tx.get(reservaRef)
    if (!reservaSnap.exists) return 'RESERVA_NO_ENCONTRADA'

    const reserva = reservaSnap.data() as Record<string, unknown>
    const resultadoCancelacion = evaluarCancelacionPublica(reserva, empresaIdFundacional, ahora)
    if (resultadoCancelacion !== 'CANCELABLE') return resultadoCancelacion

    const mesaId = typeof reserva.mesaId === 'string' ? reserva.mesaId : ''
    const fechaLocal = typeof reserva.fechaLocal === 'string' ? reserva.fechaLocal : ''
    const bloques = Array.isArray(reserva.bloques) ? reserva.bloques.filter((b): b is string => typeof b === 'string') : []

    tx.update(reservaRef, { estadoReserva: 'cancelada' })
    if (!mesaId || !fechaLocal || bloques.length === 0) return 'CANCELABLE'

    const agendaRef = db.collection('agendas').doc(`${mesaId}_${fechaLocal}`)
    const agendaSnap = await tx.get(agendaRef)
    if (!agendaSnap.exists) return 'CANCELABLE'

    const agenda = agendaSnap.data() as { bloques?: Record<string, BloqueAgenda> }
    const nuevosBloques = { ...(agenda.bloques || {}) }
    let cambio = false
    for (const bloque of bloques) {
      if (nuevosBloques[bloque]?.reservaId === reservaId) {
        delete nuevosBloques[bloque]
        cambio = true
      }
    }
    if (cambio) tx.update(agendaRef, { bloques: nuevosBloques, actualizadoEn: ahora.toISOString() })
    return 'CANCELABLE'
  })
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
    if (resultado === 'RESERVA_NO_CANCELABLE') {
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
