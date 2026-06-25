import { cert, getApps, initializeApp, App, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { getAuth } from 'firebase-admin/auth'
import * as fs from 'fs'

function loadCredential() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT
  if (inline && inline.trim().length > 2) {
    try { return cert(JSON.parse(inline)) } catch { /* fall through */ }
  }

  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  ].filter(Boolean) as string[]

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return cert(JSON.parse(fs.readFileSync(p, 'utf8')))
    } catch { /* fall through */ }
  }

  try { return applicationDefault() } catch { /* fall through */ }

  throw new Error(
    'Firebase Admin: no se encontró credencial.\n' +
    '  Opción 1: FIREBASE_SERVICE_ACCOUNT=<json inline>\n' +
    '  Opción 2: FIREBASE_SERVICE_ACCOUNT_PATH=<ruta al .json>\n' +
    '  Opción 3: GOOGLE_APPLICATION_CREDENTIALS=<ruta al .json>\n' +
    '  Opción 4: Application Default Credentials (gcloud auth)'
  )
}

export function getFirebaseAdminApp(): App {
  if (!getApps().length) {
    initializeApp({ credential: loadCredential() })
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
