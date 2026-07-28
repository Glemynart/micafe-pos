import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

/** Catálogo público de salas, acotado por el slug público del tenant. */
export async function listarSalasPublicas(req: Request, db: FirebaseFirestore.Firestore = getAdminDb()) {
  try {
    const slug = new URL(req.url).searchParams.get('slug')?.trim()
    if (!slug) return NextResponse.json({ error: 'slug es obligatorio' }, { status: 400 })

    const empresaSnap = await db.collection('empresas').where('slug', '==', slug).limit(2).get()
    if (empresaSnap.size !== 1) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const empresa = empresaSnap.docs[0].data()
    if (empresa.estado !== 'trial' && empresa.estado !== 'activa') {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
    }

    const empresaId = empresaSnap.docs[0].id
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

export async function GET(req: Request) {
  return listarSalasPublicas(req)
}
