import { NextResponse } from 'next/server'
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin'
import { enviarPushAdmins } from '@/lib/notificaciones-push'
import { claimsPushAutorizados, puedeEnviarPushTenant, type ClaimsPush, type MembresiaPush } from '@/lib/notificaciones-push-auth'

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

const MAX_BODY_BYTES = 4096
const MAX_TITLE_LENGTH = 120
const MAX_MESSAGE_LENGTH = 1000

class BodyTooLargeError extends Error {}

async function leerCuerpoLimitado(req: Request): Promise<string> {
  const reader = req.body?.getReader()
  if (!reader) return ''

  const chunks: Buffer[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new BodyTooLargeError()
      }
      chunks.push(Buffer.from(value))
    }
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw error
    throw new Error('BODY_READ_FAILED')
  }

  return Buffer.concat(chunks, totalBytes).toString('utf8')
}

function esRutaInternaPermitida(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return false
  try {
    const url = new URL(value, 'https://dusema.invalid')
    return url.origin === 'https://dusema.invalid'
      && (url.pathname === '/admin' || url.pathname.startsWith('/admin/')
        || url.pathname === '/pos' || url.pathname.startsWith('/pos/'))
  } catch {
    return false
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ') || authHeader.length > 8192) {
      return jsonCors({ error: 'No autorizado' }, 401)
    }

    const idToken = authHeader.slice('Bearer '.length).trim()
    if (!idToken) return jsonCors({ error: 'No autorizado' }, 401)

    // Rechaza tokens revocados y valida contra la membresía actual, no solo
    // contra claims que pueden quedar obsoletos hasta que expire el token.
    const decoded = await getAdminAuth().verifyIdToken(idToken, true) as ClaimsPush

    if (!claimsPushAutorizados(decoded)) {
      return jsonCors({ error: 'Permisos insuficientes' }, 403)
    }

    const empresaId = decoded.empresaId as string
    const uid = decoded.uid as string
    const db = getAdminDb()
    const membresiaSnap = await db.collection('membresias').doc(`${empresaId}_${uid}`).get()
    const membresia = membresiaSnap.data() as MembresiaPush | undefined
    if (!membresiaSnap.exists || !puedeEnviarPushTenant(decoded, membresia)) {
      return jsonCors({ error: 'Permisos insuficientes' }, 403)
    }

    const contentLength = req.headers.get('content-length')
    const declaredLength = contentLength ? Number(contentLength) : 0
    if (contentLength && (!Number.isSafeInteger(declaredLength) || declaredLength < 0)) {
      return jsonCors({ error: 'Solicitud inválida' }, 400)
    }
    if (declaredLength > MAX_BODY_BYTES) {
      return jsonCors({ error: 'Solicitud demasiado grande' }, 413)
    }
    let rawBody: string
    try {
      rawBody = await leerCuerpoLimitado(req)
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return jsonCors({ error: 'Solicitud demasiado grande' }, 413)
      }
      throw error
    }
    if (rawBody.length === 0) {
      return jsonCors({ error: 'Solicitud inválida' }, 400)
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return jsonCors({ error: 'Solicitud inválida' }, 400)
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonCors({ error: 'Solicitud inválida' }, 400)
    }

    const { title, message, url } = body as Record<string, unknown>

    if (typeof title !== 'string' || !title.trim() || title.length > MAX_TITLE_LENGTH
      || typeof message !== 'string' || !message.trim() || message.length > MAX_MESSAGE_LENGTH
      || (url !== undefined && (typeof url !== 'string' || !esRutaInternaPermitida(url)))) {
      return jsonCors({ error: 'Campos de notificación inválidos' }, 400)
    }

    const result = await enviarPushAdmins({
      empresaId,
      title: title.trim(),
      body: message,
      url: typeof url === 'string' ? url : undefined,
    })

    return jsonCors({ success: true, ...result })
  } catch (error) {
    console.error('Error enviando notificacion:', error instanceof Error ? error.name : 'unknown')
    return jsonCors({ error: 'No fue posible enviar la notificación.' }, 500)
  }
}
