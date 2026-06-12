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
      } else if (Notification.permission === 'granted') {
        // If already granted, we can try fetching token directly on load
        requestPermissionAndGetToken(false)
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

  const requestPermissionAndGetToken = async (fromButton: boolean = true) => {
    if (!usuario || usuario.rol !== 'admin' || !messagingInstance) return
    
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        setNeedsPermission(false)
        const currentToken = await getToken(messagingInstance, {
          vapidKey: VAPID_KEY
        })

        if (currentToken) {
          const userRef = doc(db, 'usuarios', usuario.uid)
          await updateDoc(userRef, {
            fcmTokens: arrayUnion(currentToken)
          })
          if (fromButton) toast.success('Notificaciones activadas')
        }
      } else {
        if (fromButton) toast.error('Permiso de notificaciones denegado')
      }
    } catch (error) {
      console.error('[FCM] Error:', error)
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

  if (usuario) {
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
            Estado: {typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'No Soportado'}
          </p>
        </div>
        {typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted' && (
          <button
            onClick={() => requestPermissionAndGetToken(true)}
            className="bg-blue-500 hover:bg-blue-600 transition-colors text-white px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap"
          >
            Activar
          </button>
        )}
      </div>
    )
  }

  return null
}
