import { NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import { enviarPushAdmins } from '@/lib/notificaciones-push'

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const idToken = authHeader.split('Bearer ')[1]
    const decoded = await getAdminAuth().verifyIdToken(idToken)

    const db = getAdminDb()
    const userDoc = await db.collection('usuarios').doc(decoded.uid).get()
    const rol = userDoc.data()?.rol

    if (rol !== 'admin' && rol !== 'cajero') {
      return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 })
    }

    const body = await req.json()
    const { title, message, url } = body

    if (!title || typeof title !== 'string' || !message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Se requieren title y message (string)' }, { status: 400 })
    }

    const result = await enviarPushAdmins({
      title,
      body: message,
      url: typeof url === 'string' ? url : undefined,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('Error enviando notificacion:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
