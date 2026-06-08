import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : undefined

function getDb() {
  if (!getApps().length) {
    if (!serviceAccount) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT no configurado')
    }
    initializeApp({ credential: cert(serviceAccount) })
  }
  return getFirestore()
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

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

    const hashBuffer = Buffer.from(hash)
    const sigBuffer = Buffer.from(signature.checksum)
    if (hashBuffer.length !== sigBuffer.length || !crypto.timingSafeEqual(hashBuffer, sigBuffer)) {
      console.error('Firma inválida en webhook de Wompi')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    if (transaction.status === 'APPROVED') {
      const reservaId = transaction.reference

      if (reservaId) {
        try {
          const db = getDb()
          await db.collection('reservas').doc(reservaId).update({
            estadoPago: 'pagado',
            referenciaPago: transaction.id,
          })
          console.log(`Reserva ${reservaId} actualizada con exito.`)
        } catch (dbError) {
          console.error(`Error actualizando Firebase para la reserva ${reservaId}:`, dbError)
          return NextResponse.json({ error: 'Failed to update DB' }, { status: 500 })
        }
      }
    } else {
      console.log(`Transaccion en estado: ${transaction.status}. No se requiere accion.`)
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
