import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

interface BloqueAgenda { reservaId: string; estado: 'hold' | 'confirmado'; holdExpira: string | null; creadoEn: string }
interface AgendaDoc { empresaId?: unknown; mesaId?: unknown; espacioId?: unknown; bloques?: Record<string, BloqueAgenda> }
interface ReservaHoldInput {
  reservaData: { clienteNombre: string; clienteEmail: string; clienteTelefono: string; mesaId: string; espacioId: string; fechaInicio: string; fechaFin: string; estadoPago: 'pendiente'; estadoReserva: 'activa'; montoTotal: number; referenciaPago: string; fechaCreacion: string }
  fechaLocal: string; bloquesSolicitados: string[]
}
const HOLD_TTL_MS = 15 * 60 * 1000

function esBloqueOcupado(bloque: BloqueAgenda, ahora: Date) {
  return bloque.estado === 'confirmado' || (!!bloque.holdExpira && new Date(bloque.holdExpira) > ahora)
}
function validarInput(body: any): body is ReservaHoldInput {
  const r = body?.reservaData
  return !!r && typeof r.clienteNombre === 'string' && typeof r.clienteEmail === 'string' && typeof r.clienteTelefono === 'string'
    && typeof r.mesaId === 'string' && r.mesaId.length > 0 && typeof r.espacioId === 'string' && typeof r.fechaInicio === 'string'
    && typeof r.fechaFin === 'string' && typeof r.montoTotal === 'number' && r.estadoPago === 'pendiente' && r.estadoReserva === 'activa'
    && typeof body.fechaLocal === 'string' && body.fechaLocal.length > 0 && Array.isArray(body.bloquesSolicitados)
    && body.bloquesSolicitados.every((b: unknown) => typeof b === 'string')
}

export async function crearHoldPublico(req: Request, db: FirebaseFirestore.Firestore = getAdminDb()) {
  try {
    const body = await req.json()
    if (!validarInput(body)) return NextResponse.json({ error: 'Datos de reserva inválidos' }, { status: 400 })
    const { reservaData, fechaLocal, bloquesSolicitados } = body
    const reservaRef = db.collection('reservas').doc()
    const agendaRef = db.collection('agendas').doc(`${reservaData.mesaId}_${fechaLocal}`)
    const mesaRef = db.collection('mesas').doc(reservaData.mesaId)
    const holdExpira = new Date(Date.now() + HOLD_TTL_MS).toISOString()
    const ahora = new Date()

    await db.runTransaction(async (tx) => {
      const mesaSnap = await tx.get(mesaRef)
      if (!mesaSnap.exists) throw new Error('MESA_NO_ENCONTRADA')
      const mesa = mesaSnap.data() as { empresaId?: unknown; espacioId?: unknown }
      if (typeof mesa.empresaId !== 'string' || !mesa.empresaId || mesa.espacioId !== reservaData.espacioId) throw new Error('MESA_INCONSISTENTE')
      const empresaSnap = await tx.get(db.collection('empresas').doc(mesa.empresaId))
      const estadoEmpresa = empresaSnap.exists ? empresaSnap.data()?.estado : undefined
      if (estadoEmpresa !== 'trial' && estadoEmpresa !== 'activa') throw new Error('EMPRESA_NO_OPERATIVA')
      const agendaSnap = await tx.get(agendaRef)
      const agenda = agendaSnap.exists ? agendaSnap.data() as AgendaDoc : null
      if (agenda && (agenda.empresaId !== mesa.empresaId || agenda.mesaId !== reservaData.mesaId || agenda.espacioId !== reservaData.espacioId)) throw new Error('AGENDA_INCONSISTENTE')
      const bloquesActuales = agenda?.bloques || {}
      for (const b of bloquesSolicitados) if (bloquesActuales[b] && bloquesActuales[b].reservaId !== reservaRef.id && esBloqueOcupado(bloquesActuales[b], ahora)) throw new Error('BLOQUE_OCUPADO')
      const nuevosBloques = { ...bloquesActuales }
      for (const b of bloquesSolicitados) nuevosBloques[b] = { reservaId: reservaRef.id, estado: 'hold', holdExpira, creadoEn: ahora.toISOString() }
      tx.set(agendaRef, { mesaId: reservaData.mesaId, espacioId: reservaData.espacioId, fecha: fechaLocal, materializado: true, bloques: nuevosBloques, actualizadoEn: ahora.toISOString(), empresaId: mesa.empresaId })
      tx.set(reservaRef, { ...reservaData, id: reservaRef.id, holdExpira, fechaLocal, bloques: bloquesSolicitados, empresaId: mesa.empresaId })
    })
    return NextResponse.json({ reservaId: reservaRef.id })
  } catch (error: any) {
    if (error?.message === 'BLOQUE_OCUPADO') return NextResponse.json({ error: 'BLOQUE_OCUPADO' }, { status: 409 })
    if (['MESA_NO_ENCONTRADA', 'MESA_INCONSISTENTE', 'AGENDA_INCONSISTENTE', 'EMPRESA_NO_OPERATIVA'].includes(error?.message)) return NextResponse.json({ error: 'Reserva inválida' }, { status: 409 })
    console.error('Error en /api/reservas/hold:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return crearHoldPublico(req)
}
