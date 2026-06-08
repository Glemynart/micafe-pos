import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { initializeApp, getApps, getApp } from "firebase/app"
import { getFirestore, doc, updateDoc } from "firebase/firestore"

// Initialize Firebase for server context (without persistent cache which breaks Node.js)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp()
const db = getFirestore(app)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    
    // Webhook structure according to Wompi Docs
    const { event, data, signature, timestamp } = body
    
    if (event !== 'transaction.updated') {
      return NextResponse.json({ message: 'Event ignored' }, { status: 200 })
    }

    const transaction = data.transaction
    
    const secret = process.env.WOMPI_EVENTS_SECRET
    if (!secret) {
      console.error('WOMPI_EVENTS_SECRET no configurado — rechazando webhook')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    if (!signature || !signature.properties || !signature.checksum) {
      console.error('Firma ausente en webhook de Wompi')
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    let stringToHash = ''
    for (const prop of signature.properties) {
      const parts = prop.split('.')
      let val: any = body
      for (const p of parts) val = val[p]
      stringToHash += val
    }
    stringToHash += timestamp
    stringToHash += secret

    const hash = crypto.createHash('sha256').update(stringToHash).digest('hex')

    if (hash !== signature.checksum) {
      console.error('Firma inválida en webhook de Wompi')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Process APPROVED transactions
    if (transaction.status === 'APPROVED') {
      const reservaId = transaction.reference
      
      if (reservaId) {
        console.log(`Marcando reserva ${reservaId} como pagada...`)
        try {
          const reservaRef = doc(db, 'reservas', reservaId)
          await updateDoc(reservaRef, {
            estadoPago: 'pagado',
            referenciaPago: transaction.id
          })
          console.log(`Reserva ${reservaId} actualizada con éxito.`)
        } catch (dbError) {
          console.error(`Error actualizando Firebase para la reserva ${reservaId}:`, dbError)
          // We still return 200 to Wompi so it doesn't retry infinitely, or maybe 500 so they retry?
          // Wompi retries if it receives != 200
          return NextResponse.json({ error: 'Failed to update DB' }, { status: 500 })
        }
      }
    } else {
      console.log(`Transacción en estado: ${transaction.status}. No se requiere acción.`)
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
