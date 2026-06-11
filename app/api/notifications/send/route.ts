import { NextResponse } from 'next/server'
import { getAdminDb, getAdminMessaging } from '@/lib/firebase-admin'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { title, message } = body

    if (!title || !message) {
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    }

    const db = getAdminDb()
    const messaging = getAdminMessaging()

    // Buscar usuarios que sean administradores y tengan fcmTokens
    const adminsSnapshot = await db.collection('usuarios')
      .where('rol', '==', 'admin')
      .get()

    let tokensEnviados = 0

    for (const doc of adminsSnapshot.docs) {
      const data = doc.data()
      const tokens = data.fcmTokens || []

      if (tokens.length > 0) {
        // Enviar a todos los tokens del admin
        for (const token of tokens) {
          try {
            await messaging.send({
              token,
              notification: {
                title,
                body: message,
              },
            })
            tokensEnviados++
          } catch (error) {
            console.error(`Error enviando a token ${token}:`, error)
          }
        }
      }
    }

    return NextResponse.json({ success: true, tokensEnviados })
  } catch (error: any) {
    console.error('Error enviando notificacion:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
