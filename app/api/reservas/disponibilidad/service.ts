import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

interface BloqueAgenda { reservaId: string; estado: 'hold' | 'confirmado'; holdExpira: string | null; creadoEn: string }
function esBloqueOcupado(bloque: BloqueAgenda, ahora: Date) { return bloque.estado === 'confirmado' || (!!bloque.holdExpira && new Date(bloque.holdExpira) > ahora) }

export async function consultarDisponibilidad(req: Request, db: FirebaseFirestore.Firestore = getAdminDb()) {
  try {
    const { searchParams } = new URL(req.url)
    const mesaId = searchParams.get('mesaId')
    const fechaLocal = searchParams.get('fechaLocal')
    if (!mesaId || !fechaLocal) return NextResponse.json({ error: 'mesaId y fechaLocal son obligatorios' }, { status: 400 })
    const mesaRef = db.collection('mesas').doc(mesaId)
    const agendaRef = db.collection('agendas').doc(`${mesaId}_${fechaLocal}`)
    const result = await db.runTransaction(async (tx) => {
      const mesaSnap = await tx.get(mesaRef)
      if (!mesaSnap.exists) throw new Error('MESA_NO_ENCONTRADA')
      const mesa = mesaSnap.data() as { empresaId?: unknown; espacioId?: unknown }
      if (typeof mesa.empresaId !== 'string' || !mesa.empresaId || typeof mesa.espacioId !== 'string') throw new Error('MESA_INCONSISTENTE')
      const empresaSnap = await tx.get(db.collection('empresas').doc(mesa.empresaId))
      const estadoEmpresa = empresaSnap.exists ? empresaSnap.data()?.estado : undefined
      if (estadoEmpresa !== 'trial' && estadoEmpresa !== 'activa') throw new Error('EMPRESA_NO_OPERATIVA')
      const agendaSnap = await tx.get(agendaRef)
      const ahora = new Date()
      if (agendaSnap.exists) {
        const agenda = agendaSnap.data() as { empresaId?: unknown; mesaId?: unknown; espacioId?: unknown; bloques?: Record<string, BloqueAgenda> }
        if (agenda.empresaId !== mesa.empresaId || agenda.mesaId !== mesaId || agenda.espacioId !== mesa.espacioId) throw new Error('AGENDA_INCONSISTENTE')
        return Object.entries(agenda.bloques || {}).filter(([, bloque]) => esBloqueOcupado(bloque, ahora)).map(([hora]) => hora)
      }
      tx.set(agendaRef, { mesaId, espacioId: mesa.espacioId, fecha: fechaLocal, materializado: true, bloques: {}, actualizadoEn: ahora.toISOString(), empresaId: mesa.empresaId })
      return []
    })
    return NextResponse.json({ bloquesOcupados: result })
  } catch (error: any) {
    if (['MESA_NO_ENCONTRADA', 'MESA_INCONSISTENTE', 'AGENDA_INCONSISTENTE', 'EMPRESA_NO_OPERATIVA'].includes(error?.message)) return NextResponse.json({ error: 'Agenda no disponible' }, { status: 409 })
    console.error('Error en /api/reservas/disponibilidad:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
