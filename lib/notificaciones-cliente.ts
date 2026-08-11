/**
 * lib/notificaciones-cliente.ts
 * Emisor unico de eventos de notificacion push (D-NOTIF-02).
 *
 * Describe un evento generico ({title, message, url?}); no conoce su origen
 * funcional ni decide destinatarios: eso lo resuelve el backend en
 * /api/notifications/send. El canal soportado es Web/PWA.
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

/** Un contexto servido por http/https puede resolver una URL relativa. */
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
    console.error('[push] config: falta NEXT_PUBLIC_APP_URL. Evento no enviado.')
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
 * Unico punto de entrada para emitir un evento de notificacion push desde
 * Web/PWA. Fire-and-forget: nunca lanza ni bloquea al llamador.
 */
export function notificar(params: NotificarParams): void {
  if (typeof window === 'undefined') return
  void enviarConReintento(params)
}
