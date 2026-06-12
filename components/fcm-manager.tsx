'use client'

import { useEffect, useState } from 'react'
import { useAuthContext } from '@/contexts/auth-context'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'
import { app, db } from '@/lib/firebase'
import { doc, updateDoc, arrayUnion } from 'firebase/firestore'
import { toast } from 'sonner'
import { Bell } from 'lucide-react'

const VAPID_KEY = 'BCXrfXDchBreItMWiwD6Zb3EDPynDGDfKY7rybkrtjFBbJVqk8BrdYJFEo1PniSoqWE_b3D28LftB5zB-ehN_m0'

export function FcmManager() {
  const { usuario } = useAuthContext()
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
    if (messagingInstance && usuario?.rol === 'admin' && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        requestPermissionAndGetToken(false)
      }
    }
  }, [messagingInstance, usuario])

  const requestPermissionAndGetToken = async (fromButton: boolean = true) => {
    if (!messagingInstance || !usuario) return
    
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        setNeedsPermission(false)
        // Registrar el SW manualmente con un nombre nuevo para romper cualquier caché
        const registration = await navigator.serviceWorker.register('/firebase-push-sw.js')
        await navigator.serviceWorker.ready
        
        const currentToken = await getToken(messagingInstance, {
          vapidKey: VAPID_KEY,
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
      const { title, body } = payload.notification || {}
      if (title && body) {
        toast(title, {
          description: body,
          duration: 10000,
          position: 'top-center',
        })
      }
    })

    return () => unsubscribe()
  }, [messagingInstance])

  if (usuario?.rol === 'admin') {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-sm bg-[#051D41]/95 backdrop-blur-md border border-blue-500/30 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-4">
        <div className="bg-blue-500/20 p-2 rounded-full">
          <Bell className="w-5 h-5 text-blue-400" />
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-sm text-white/90">
            Alertas de Turnos
          </h4>
          <p className="text-[11px] text-white/60 leading-tight mt-0.5">
            Activa las notificaciones para enterarte cuando se abran o cierren turnos.
          </p>
        </div>
        <button
          onClick={() => requestPermissionAndGetToken(true)}
          className="bg-blue-500 hover:bg-blue-600 transition-colors text-white px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap"
        >
          Activar
        </button>
      </div>
    )
  }

  return null
}
