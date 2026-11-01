import {
  claimsPushAutorizados,
  puedeEnviarPushTenant,
  type ClaimsPush,
  type MembresiaPush,
} from "./notificaciones-push-auth"

const MAX_BODY_BYTES = 4096
const MAX_TITLE_LENGTH = 120
const MAX_MESSAGE_LENGTH = 1000

class BodyTooLargeError extends Error {}

export type ResultadoEndpointPush = {
  status: number
  body: Record<string, unknown>
}

export type DependenciasEndpointPush = {
  verifyIdToken: (idToken: string, checkRevoked: true) => Promise<ClaimsPush>
  obtenerMembresia: (empresaId: string, uid: string) => Promise<MembresiaPush | undefined>
  enviarPushAdmins: (params: {
    empresaId: string
    title: string
    body: string
    url?: string
  }) => Promise<{ enviados: number; purgados: number }>
  registrarError?: (nombre: string) => void
}

async function leerCuerpoLimitado(req: Request): Promise<string> {
  const reader = req.body?.getReader()
  if (!reader) return ""

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
    throw new Error("BODY_READ_FAILED")
  }

  return Buffer.concat(chunks, totalBytes).toString("utf8")
}

function esRutaInternaPermitida(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false
  try {
    const url = new URL(value, "https://dusema.invalid")
    return url.origin === "https://dusema.invalid"
      && (url.pathname === "/admin" || url.pathname.startsWith("/admin/")
        || url.pathname === "/pos" || url.pathname.startsWith("/pos/"))
  } catch {
    return false
  }
}

function resultado(status: number, body: Record<string, unknown>): ResultadoEndpointPush {
  return { status, body }
}

/** Ejecuta la autorización y validación del endpoint sin acoplarlas a Next o Firebase Admin. */
export async function procesarSolicitudPush(
  req: Request,
  deps: DependenciasEndpointPush,
): Promise<ResultadoEndpointPush> {
  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ") || authHeader.length > 8192) {
      return resultado(401, { error: "No autorizado" })
    }

    const idToken = authHeader.slice("Bearer ".length).trim()
    if (!idToken) return resultado(401, { error: "No autorizado" })

    // La revocación y la membresía actual invalidan sesiones o roles obsoletos.
    const decoded = await deps.verifyIdToken(idToken, true)
    if (!claimsPushAutorizados(decoded)) {
      return resultado(403, { error: "Permisos insuficientes" })
    }

    const empresaId = decoded.empresaId as string
    const uid = decoded.uid as string
    const membresia = await deps.obtenerMembresia(empresaId, uid)
    if (!puedeEnviarPushTenant(decoded, membresia)) {
      return resultado(403, { error: "Permisos insuficientes" })
    }

    const contentLength = req.headers.get("content-length")
    const declaredLength = contentLength ? Number(contentLength) : 0
    if (contentLength && (!Number.isSafeInteger(declaredLength) || declaredLength < 0)) {
      return resultado(400, { error: "Solicitud inválida" })
    }
    if (declaredLength > MAX_BODY_BYTES) {
      return resultado(413, { error: "Solicitud demasiado grande" })
    }

    let rawBody: string
    try {
      rawBody = await leerCuerpoLimitado(req)
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return resultado(413, { error: "Solicitud demasiado grande" })
      }
      throw error
    }
    if (rawBody.length === 0) return resultado(400, { error: "Solicitud inválida" })

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return resultado(400, { error: "Solicitud inválida" })
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return resultado(400, { error: "Solicitud inválida" })
    }

    const { title, message, url } = body as Record<string, unknown>
    if (typeof title !== "string" || !title.trim() || title.length > MAX_TITLE_LENGTH
      || typeof message !== "string" || !message.trim() || message.length > MAX_MESSAGE_LENGTH
      || (url !== undefined && (typeof url !== "string" || !esRutaInternaPermitida(url)))) {
      return resultado(400, { error: "Campos de notificación inválidos" })
    }

    const enviado = await deps.enviarPushAdmins({
      empresaId,
      title: title.trim(),
      body: message,
      url: typeof url === "string" ? url : undefined,
    })
    return resultado(200, { success: true, ...enviado })
  } catch (error) {
    const nombre = error instanceof Error ? error.name : "unknown"
    if (deps.registrarError) deps.registrarError(nombre)
    else console.error("Error enviando notificacion:", nombre)
    return resultado(500, { error: "No fue posible enviar la notificación." })
  }
}
