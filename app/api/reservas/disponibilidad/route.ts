import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

/**
 * MT-U3 Capa 4 (§4.5) — disponibilidad de agenda para la landing pública `/reservar`.
 *
 * Corre server-side con Admin SDK porque el visitante no tiene sesión de
 * Firebase Auth (no hay `auth.currentUser` del que leer un claim `empresaId`):
 * el helper de tenant ambiental (`lib/tenant.ts`) no aplica aquí — es la vía
 * explícita de §3.6, igual que el webhook de Wompi y los scripts de
 * migración: resuelve el tenant por `esFundacional==true`, nunca lo decide el
 * cliente.
 *
 * Reemplaza la lectura/materialización que antes hacía `getBloquesOcupados`
 * directo contra Firestore desde el navegador (ver `lib/reservas-service.ts`).
 */

interface BloqueAgenda {
  reservaId: string
  estado: 'hold' | 'confirmado'
  holdExpira: string | null
  creadoEn: string
}

function esBloqueOcupado(bloque: BloqueAgenda, ahora: Date): boolean {
  if (bloque.estado === 'confirmado') return true
  if (!bloque.holdExpira) return false
  return new Date(bloque.holdExpira) > ahora
}

async function resolverEmpresaIdFundacional(db: FirebaseFirestore.Firestore): Promise<string> {
  const snap = await db.collection('empresas').where('esFundacional', '==', true).limit(1).get()
  if (snap.empty) {
    throw new Error('No existe ninguna empresa con esFundacional==true.')
  }
  return snap.docs[0].id
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const mesaId = searchParams.get('mesaId')
    const fechaLocal = searchParams.get('fechaLocal')

    if (!mesaId || !fechaLocal) {
      return NextResponse.json({ error: 'mesaId y fechaLocal son obligatorios' }, { status: 400 })
    }

    const db = getAdminDb()
    const agendaRef = db.collection('agendas').doc(`${mesaId}_${fechaLocal}`)
    const snap = await agendaRef.get()
    const ahora = new Date()

    if (snap.exists) {
      const data = snap.data() as { bloques?: Record<string, BloqueAgenda> }
      const bloquesOcupados = Object.entries(data.bloques || {})
        .filter(([, bloque]) => esBloqueOcupado(bloque, ahora))
        .map(([hora]) => hora)
      return NextResponse.json({ bloquesOcupados })
    }

    // Agenda no existe: combinación mesa+fecha sin reservas previas. Se
    // materializa vacía y estampada — evita que quede huérfana (MT-U3 §3.2).
    const empresaId = await resolverEmpresaIdFundacional(db)
    await agendaRef.set({
      mesaId,
      espacioId: 'salas-coworking',
      fecha: fechaLocal,
      materializado: true,
      bloques: {},
      actualizadoEn: new Date().toISOString(),
      empresaId,
    })

    return NextResponse.json({ bloquesOcupados: [] })
  } catch (error) {
    console.error('Error en /api/reservas/disponibilidad:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
