/**
 * lib/fcm-token-helper.ts
 * Helper genérico para gestión de tokens FCM (D-NOTIF-02 D7).
 *
 * Encapsula el acceso al token sin conocimiento de dominio (eventos, usuarios, etc.).
 * Los servicios de identidad (auth-service) pueden usarlo para limpiar tokens
 * sin acoplarse directamente a Firebase Messaging.
 */

import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import { app } from './firebase'

/**
 * Obtiene el token FCM actual, si:
 * - El navegador soporta Web Push (isSupported)
 * - El usuario tiene permiso para notificaciones
 * - Existe un service worker registrado
 *
 * Retorna `null` si cualquiera de las condiciones no se cumple o si hay error.
 */
export async function obtenerTokenActual(): Promise<string | null> {
  if (typeof window === 'undefined') return null

  try {
    const supported = await isSupported()
    if (!supported) return null

    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return null
    }

    const messaging = getMessaging(app)
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY

    if (!vapidKey) {
      console.warn('[fcm] config: falta NEXT_PUBLIC_FIREBASE_VAPID_KEY en env')
      return null
    }

    const registration = await navigator.serviceWorker.ready
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    })

    return token || null
  } catch (err) {
    console.error('[fcm] Error obteniendo token:', err)
    return null
  }
}
