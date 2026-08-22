interface BloqueAgenda {
  reservaId: string
}

type ResultadoCancelacion = 'CANCELABLE' | 'YA_CANCELADA' | 'RESERVA_AJENA' | 'RESERVA_NO_CANCELABLE' | 'RESERVA_INCONSISTENTE' | 'EMPRESA_NO_OPERATIVA'

export function evaluarCancelacionPublica(
  reserva: Record<string, unknown>,
  ahora: Date
): ResultadoCancelacion {
  if (typeof reserva.empresaId !== 'string' || !reserva.empresaId) return 'RESERVA_AJENA'
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
  return db.runTransaction(async (tx) => {
    const reservaRef = db.collection('reservas').doc(reservaId)
    const reservaSnap = await tx.get(reservaRef)
    if (!reservaSnap.exists) return 'RESERVA_NO_ENCONTRADA'

    const reserva = reservaSnap.data() as Record<string, unknown>
    const resultadoCancelacion = evaluarCancelacionPublica(reserva, ahora)
    if (resultadoCancelacion !== 'CANCELABLE') return resultadoCancelacion

    const referenciaPago = typeof reserva.referenciaPago === 'string' ? reserva.referenciaPago : ''
    if (referenciaPago) {
      const intentSnap = await tx.get(db.collection('intenciones_pago_reserva').doc(referenciaPago))
      if (intentSnap.exists) {
        const intent = intentSnap.data() as Record<string, unknown>
        if (intent.empresaId !== reserva.empresaId || intent.reservaId !== reservaId) return 'RESERVA_INCONSISTENTE'
        if (intent.estado !== 'CREADA') return 'RESERVA_NO_CANCELABLE'
      }
    }

    const empresaSnap = await tx.get(db.collection('empresas').doc(reserva.empresaId as string))
    const estadoEmpresa = empresaSnap.exists ? empresaSnap.data()?.estado : undefined
    if (estadoEmpresa !== 'trial' && estadoEmpresa !== 'activa') return 'EMPRESA_NO_OPERATIVA'

    const mesaId = typeof reserva.mesaId === 'string' ? reserva.mesaId : ''
    const fechaLocal = typeof reserva.fechaLocal === 'string' ? reserva.fechaLocal : ''
    const bloques = Array.isArray(reserva.bloques) ? reserva.bloques.filter((b): b is string => typeof b === 'string') : []

    if (!mesaId || !fechaLocal || bloques.length === 0) return 'RESERVA_INCONSISTENTE'

    const mesaRef = db.collection('mesas').doc(mesaId)
    const mesaSnap = await tx.get(mesaRef)
    if (!mesaSnap.exists) return 'RESERVA_INCONSISTENTE'
    const mesa = mesaSnap.data() as { empresaId?: unknown, espacioId?: unknown }
    if (mesa.empresaId !== reserva.empresaId || mesa.espacioId !== reserva.espacioId) return 'RESERVA_INCONSISTENTE'

    const agendaRef = db.collection('agendas').doc(`${mesaId}_${fechaLocal}`)
    const agendaSnap = await tx.get(agendaRef)
    if (!agendaSnap.exists) return 'RESERVA_INCONSISTENTE'

    const agenda = agendaSnap.data() as { empresaId?: unknown, mesaId?: unknown, espacioId?: unknown, bloques?: Record<string, BloqueAgenda> }
    if (agenda.empresaId !== reserva.empresaId || agenda.mesaId !== mesaId || agenda.espacioId !== reserva.espacioId) {
      return 'RESERVA_INCONSISTENTE'
    }

    tx.update(reservaRef, { estadoReserva: 'cancelada' })
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
