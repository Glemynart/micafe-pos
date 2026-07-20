import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

async function resolverEmpresaIdFundacional(db: FirebaseFirestore.Firestore): Promise<string> {
  const snap = await db.collection('empresas').where('esFundacional', '==', true).limit(1).get()
  if (snap.empty) throw new Error('No existe ninguna empresa con esFundacional==true.')
  return snap.docs[0].id
}

/** Catálogo público de salas; la landing no lee `mesas` directamente. */
export async function GET() {
  try {
    const db = getAdminDb()
    const empresaId = await resolverEmpresaIdFundacional(db)
    const snap = await db.collection('mesas').where('empresaId', '==', empresaId).get()
    const salas = snap.docs
      .map((doc) => ({ id: doc.id, nombre: doc.data().nombre }))
      .filter((s): s is { id: string; nombre: string } =>
        typeof s.nombre === 'string' && s.nombre.toLowerCase().includes('sala')
      )

    return NextResponse.json({ salas })
  } catch (error) {
    console.error('Error en /api/reservas/salas:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
