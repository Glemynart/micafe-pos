/**
 * lib/notificaciones-cliente.ts
 * Emisor único de eventos de notificación push (D-NOTIF-02).
 *
 * Describe un evento genérico ({title, message, url?}); no conoce su origen
 * funcional (login, turno u otro futuro) ni decide destinatarios — eso lo
 * resuelve el backend en /api/notifications/send. Mismo camino para cualquier
 * plataforma (Web, PWA, Electron): la única diferencia entre ellas es si la
 * base de la API debe resolverse same-origin (vacía) o absoluta (empaquetado).
 */
import { auth } from './firebase'

export interface NotificarParams {
  title: string
  message: string
  url?: string
}

const ENDPOINT_PATH = '/api/notifications/send'
const MAX_INTENTOS = 2
const BACKOFF_MS = 800
const HTTP_REINTENTABLES = new Set([429])

function resolverBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || ''
}

/** Heurística platform-neutral: un origen servido por http/https puede resolver
 *  una URL relativa; cualquier otro protocolo (p. ej. `app:` de electron-serve)
 *  es un empaquetado sin servidor propio y necesita base absoluta. */
function esContextoSinServidorPropio(): boolean {
  if (typeof window === 'undefined') return false
  const protocolo = window.location.protocol
  return protocolo !== 'http:' && protocolo !== 'https:'
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function enviarConReintento(params: NotificarParams): Promise<void> {
  const base = resolverBaseUrl()

  if (!base && esContextoSinServidorPropio()) {
    console.error(
      '[push] config: falta NEXT_PUBLIC_APP_URL en un build empaquetado (cross-origin). Evento no enviado.'
    )
    return
  }

  let idToken: string | null = null
  try {
    idToken = (await auth.currentUser?.getIdToken()) ?? null
  } catch (err) {
    console.error('[push] token: no se pudo obtener el idToken.', err)
    return
  }

  const body = JSON.stringify({
    title: params.title,
    message: params.message,
    ...(params.url ? { url: params.url } : {}),
  })

  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      const res = await fetch(`${base}${ENDPOINT_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body,
      })

      if (res.ok) return

      const debeReintentar = res.status >= 500 || HTTP_REINTENTABLES.has(res.status)
      if (debeReintentar && intento < MAX_INTENTOS) {
        await esperar(BACKOFF_MS)
        continue
      }

      const causa = res.status >= 500 || HTTP_REINTENTABLES.has(res.status) ? 'http-5xx' : 'http-4xx'
      console.error(`[push] ${causa}: status ${res.status} tras ${intento} intento(s).`)
      return
    } catch (err) {
      if (intento < MAX_INTENTOS) {
        await esperar(BACKOFF_MS)
        continue
      }
      console.error('[push] network: fallo de red tras reintento.', err)
      return
    }
  }
}

/**
 * Único punto de entrada para emitir un evento de notificación push, desde
 * cualquier consumidor (login, turno, futuros eventos) y cualquier plataforma.
 * Fire-and-forget en beneficio del destinatario: nunca lanza ni bloquea al
 * llamador; los errores quedan en el log con prefijo `[push]`.
 */
export function notificar(params: NotificarParams): void {
  if (typeof window === 'undefined') return
  void enviarConReintento(params)
}
