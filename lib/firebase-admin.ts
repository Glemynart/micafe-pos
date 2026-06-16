import { cert, getApps, initializeApp, App } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { getAuth } from 'firebase-admin/auth'

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : undefined

export function getFirebaseAdminApp(): App {
  if (!getApps().length) {
    if (!serviceAccount) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT no configurado')
    }
    initializeApp({ credential: cert(serviceAccount) })
  }
  return getApps()[0]
}

export function getAdminDb() {
  getFirebaseAdminApp()
  return getFirestore()
}

export function getAdminMessaging() {
  getFirebaseAdminApp()
  return getMessaging()
}

export function getAdminAuth() {
  getFirebaseAdminApp()
  return getAuth()
}
