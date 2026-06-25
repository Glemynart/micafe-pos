import { getAdminDb, getAdminMessaging } from './firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

interface PushParams {
  title: string
  body: string
  url?: string
}

const TOKEN_INVALID_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
])

export async function enviarPushAdmins(params: PushParams): Promise<{ enviados: number; purgados: number }> {
  const db = getAdminDb()
  const messaging = getAdminMessaging()

  const adminsSnap = await db.collection('usuarios')
    .where('rol', '==', 'admin')
    .get()

  let enviados = 0
  let purgados = 0

  for (const userDoc of adminsSnap.docs) {
    const tokens: string[] = userDoc.data().fcmTokens || []
    if (tokens.length === 0) continue

    const tokensInvalidos: string[] = []

    for (const token of tokens) {
      try {
        await messaging.send({
          token,
          notification: { title: params.title, body: params.body },
          data: params.url ? { url: params.url } : undefined,
        })
        enviados++
      } catch (err: any) {
        const code = err?.code || err?.errorInfo?.code || ''
        if (TOKEN_INVALID_CODES.has(code)) {
          tokensInvalidos.push(token)
        } else {
          console.error(`[push] Error enviando a token ${token.slice(0, 12)}...:`, code || err?.message)
        }
      }
    }

    if (tokensInvalidos.length > 0) {
      try {
        await db.collection('usuarios').doc(userDoc.id).update({
          fcmTokens: FieldValue.arrayRemove(...tokensInvalidos)
        })
        purgados += tokensInvalidos.length
        console.log(`[push] Purgados ${tokensInvalidos.length} tokens inválidos de ${userDoc.id}`)
      } catch (err) {
        console.error(`[push] Error purgando tokens de ${userDoc.id}:`, err)
      }
    }
  }

  return { enviados, purgados }
}
