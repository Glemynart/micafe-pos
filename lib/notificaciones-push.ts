import { getAdminDb, getAdminMessaging } from './firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

interface PushParams {
  empresaId: string
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

  // La membresía activa decide quién administra este tenant. El perfil global
  // solo aporta los tokens FCM que necesita el envío.
  const membresiasSnap = await db.collection('membresias')
    .where('empresaId', '==', params.empresaId)
    .get()
  const adminUids = membresiasSnap.docs
    .map((doc) => doc.data())
    .filter((membresia) => membresia.rol === 'admin'
      && membresia.estado === 'activa'
      && membresia.activo === true
      && typeof membresia.uid === 'string')
    .map((membresia) => membresia.uid as string)

  const admins = adminUids.length > 0
    ? await db.getAll(...adminUids.map((uid) => db.collection('usuarios').doc(uid)))
    : []

  let enviados = 0
  let purgados = 0

  for (const userDoc of admins) {
    const perfil = userDoc.data()
    const tokens = Array.isArray(perfil?.fcmTokens)
      ? perfil.fcmTokens.filter((token): token is string => typeof token === 'string')
      : []
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
