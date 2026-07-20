import { NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase-admin'
import { enviarPushAdmins } from '@/lib/notificaciones-push'

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
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonCors({ error: 'No autorizado' }, 401)
    }

    const idToken = authHeader.split('Bearer ')[1]
    const decoded = await getAdminAuth().verifyIdToken(idToken)

    const rol = decoded.rol

    if ((rol !== 'admin' && rol !== 'cajero' && rol !== 'supervisor') || typeof decoded.empresaId !== 'string') {
      return jsonCors({ error: 'Permisos insuficientes' }, 403)
    }

    const body = await req.json()
    const { title, message, url } = body

    if (!title || typeof title !== 'string' || !message || typeof message !== 'string') {
      return jsonCors({ error: 'Se requieren title y message (string)' }, 400)
    }

    const result = await enviarPushAdmins({
      empresaId: decoded.empresaId,
      title,
      body: message,
      url: typeof url === 'string' ? url : undefined,
    })

    return jsonCors({ success: true, ...result })
  } catch (error: any) {
    console.error('Error enviando notificacion:', error)
    return jsonCors({ error: error.message }, 500)
  }
}
