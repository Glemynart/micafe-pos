'use client'

import { useEffect, useState } from 'react'
import { useAuthContext } from '@/contexts/auth-context'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'
import { app, db } from '@/lib/firebase'
import { doc, updateDoc, arrayUnion } from 'firebase/firestore'
import { toast } from 'sonner'

const VAPID_KEY = 'BCXrfXDchBreItMWiwD6Zb3EDPynDGDfKY7rybkrtjFBbJVqk8BrdYJFEo1PniSoqWE_b3D28LftB5zB-ehN_m0'

export function FcmManager() {
  const { usuario } = useAuthContext()
  const [messagingInstance, setMessagingInstance] = useState<any>(null)

  useEffect(() => {
    // Only init messaging in the browser and if supported
    if (typeof window !== 'undefined') {
      isSupported().then((supported) => {
        if (supported) {
          const messaging = getMessaging(app)
          setMessagingInstance(messaging)
        }
      })
    }
  }, [])

  useEffect(() => {
    if (!usuario || usuario.rol !== 'admin' || !messagingInstance) return

    const requestPermissionAndGetToken = async () => {
      try {
        const permission = await Notification.requestPermission()
        if (permission === 'granted') {
          // Get the FCM token
          const currentToken = await getToken(messagingInstance, {
            vapidKey: VAPID_KEY
          })

          if (currentToken) {
            // Save token to admin user's document
            const userRef = doc(db, 'usuarios', usuario.uid)
            await updateDoc(userRef, {
              fcmTokens: arrayUnion(currentToken)
            })
            console.log('[FCM] Token guardado exitosamente.')
          } else {
            console.log('[FCM] No se pudo obtener el token.')
          }
        }
      } catch (error) {
        console.error('[FCM] Error al obtener permiso o token:', error)
      }
    }

    requestPermissionAndGetToken()

    // Listen to foreground messages
    const unsubscribe = onMessage(messagingInstance, (payload) => {
      console.log('[FCM] Mensaje recibido en primer plano:', payload)
      const { title, body } = payload.notification || {}
      if (title && body) {
        toast(title, {
          description: body,
          duration: 10000,
          position: 'top-right',
        })
      }
    })

    return () => {
      unsubscribe()
    }
  }, [usuario, messagingInstance])

  return null // Invisible component
}
