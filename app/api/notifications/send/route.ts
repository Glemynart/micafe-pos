import { NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import { enviarPushAdmins } from '@/lib/notificaciones-push'
import { procesarSolicitudPush } from '@/lib/notificaciones-push-endpoint'
import type { ClaimsPush } from '@/lib/notificaciones-push-auth'

// D-NOTIF-02 D3: '*' es seguro porque la auth es Bearer idToken (no cookies),
// sin Access-Control-Allow-Credentials.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function jsonCors(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  const resultado = await procesarSolicitudPush(req, {
    verifyIdToken: async (token, checkRevoked) =>
      await getAdminAuth().verifyIdToken(token, checkRevoked) as ClaimsPush,
    obtenerMembresia: async (empresaId, uid) => {
      const snap = await getAdminDb().collection('membresias').doc(`${empresaId}_${uid}`).get()
      return snap.exists ? snap.data() : undefined
    },
    enviarPushAdmins,
  })

  return jsonCors(resultado.body, resultado.status)
}
