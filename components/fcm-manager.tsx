'use client'

import { useEffect, useState } from 'react'
import { useAuthContext } from '@/contexts/auth-context'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'
import { app, db } from '@/lib/firebase'
import { leerContenidoPush } from '@/lib/fcm-notification-content'
import { registrarFirebasePushServiceWorker } from '@/lib/firebase-push-registration'
import { doc, updateDoc, arrayUnion } from 'firebase/firestore'
import { toast } from 'sonner'
import { Bell, X } from 'lucide-react'

export function FcmManager() {
  const { usuario } = useAuthContext()
  const puedeRecibirAgenda = usuario?.rol === 'admin' || usuario?.rol === 'vendedor'
  const [messagingInstance, setMessagingInstance] = useState<any>(null)
  const [needsPermission, setNeedsPermission] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        setNeedsPermission(true)
      }
    }

    if (typeof window !== 'undefined') {
      isSupported().then((supported) => {
        if (supported) {
          const messaging = getMessaging(app)
          setMessagingInstance(messaging)
        }
      })
    }
  }, [])

  // Auto-fetch token when messagingInstance and usuario are ready, if permission is already granted
  useEffect(() => {
    if (messagingInstance && puedeRecibirAgenda && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        requestPermissionAndGetToken(false)
      }
    }
  }, [messagingInstance, usuario, puedeRecibirAgenda])

  const requestPermissionAndGetToken = async (fromButton: boolean = true) => {
    if (!messagingInstance || !usuario) return

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
    if (!vapidKey) {
      console.error('[FCM] config: falta NEXT_PUBLIC_FIREBASE_VAPID_KEY en env')
      if (fromButton) toast.error('Error de configuración: falta VAPID key.')
      return
    }

    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        setNeedsPermission(false)
        // Mantener FCM separado del service worker PWA que controla el scope raíz.
        const registration = await registrarFirebasePushServiceWorker(navigator.serviceWorker)

        const currentToken = await getToken(messagingInstance, {
          vapidKey,
          serviceWorkerRegistration: registration
        })

        if (currentToken) {
          if (usuario) {
            const userRef = doc(db, 'usuarios', usuario.uid)
            await updateDoc(userRef, {
              fcmTokens: arrayUnion(currentToken)
            })
          }
          if (fromButton) toast.success('Notificaciones activadas')
        } else {
          console.error('[FCM] No se pudo obtener token de registro')
          if (fromButton) toast.error('No se pudo activar las notificaciones. Verifica tu red.')
        }
      } else {
        if (fromButton) toast.error('Permiso de notificaciones denegado')
      }
    } catch (error: any) {
      console.error('[FCM] Error:', error)
      if (fromButton) toast.error('Error: ' + error.message)
    }
  }

  useEffect(() => {
    if (!messagingInstance) return

    const unsubscribe = onMessage(messagingInstance, (payload) => {
      const content = leerContenidoPush(payload)
      if (!content) return
      toast(content.title, {
        description: content.body,
        duration: 10000,
        position: 'top-center',
      })
    })

    return () => unsubscribe()
  }, [messagingInstance])

  if (needsPermission && puedeRecibirAgenda) {
    return (
      <div className="mx-auto mb-6 flex w-full max-w-[1440px] flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 text-foreground shadow-xs sm:flex-nowrap" role="region" aria-label="Notificaciones del negocio">
        <div className="rounded-xl bg-primary/5 p-2.5 text-primary">
          <Bell className="size-5" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold">
            {usuario?.rol === 'vendedor' ? 'Recordatorios de pedidos' : 'Alertas operativas'}
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {usuario?.rol === 'vendedor'
              ? 'Activa las notificaciones para recibir avisos de tu agenda de pedidos.'
              : 'Activa las notificaciones para recibir avisos operativos de tu empresa.'}
          </p>
        </div>
        <button
          onClick={() => requestPermissionAndGetToken(true)}
          className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-ring"
        >
          Activar
        </button>
        <button type="button" onClick={() => setNeedsPermission(false)} aria-label="Recordar más tarde las notificaciones" className="flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" /></button>
      </div>
    )
  }

  return null
}
