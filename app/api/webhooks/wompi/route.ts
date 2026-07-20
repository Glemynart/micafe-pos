import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase-admin'
import { enviarPushAdmins } from '@/lib/notificaciones-push'

function getDb() {
  return getAdminDb()
}

export async function POST(req: Request) {
  try {
    if ((req.headers.get('content-type') || '').split(';')[0] !== 'application/json') {
      return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 })
    }

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

      if (typeof reservaId !== 'string' || !reservaId.trim()) {
        return NextResponse.json({ error: 'Invalid reference' }, { status: 400 })
      }

      try {
        const db = getDb()
        let pushData: { clienteNombre: string; fechaInicio: string; fechaFin: string } | null = null

        // MT-U3 Capa 4 (§2.5, §4.2, §4.5): candidato de fallback resuelto UNA
        // sola vez, ANTES de la transacción — nunca dentro. Se usa solo si la
        // reserva (leída dentro de la transacción) no trae `empresaId` propio
        // (reserva legacy, creada antes de que `/api/reservas/hold` empezara
        // a estampar). Con un solo tenant este fallback es correcto; deja de
        // serlo en cuanto exista una segunda empresa (MT-U11).
        const fundacionalSnap = await db.collection('empresas').where('esFundacional', '==', true).limit(1).get()
        const empresaIdFundacional = fundacionalSnap.empty ? null : fundacionalSnap.docs[0].id

        await db.runTransaction(async (t) => {
          const reservaRef = db.collection('reservas').doc(reservaId)
          const reservaDoc = await t.get(reservaRef)

          if (!reservaDoc.exists) {
            console.error(`Reserva ${reservaId} no encontrada`)
            throw new Error('Reservation not found')
          }

          const reservaData = reservaDoc.data()

          if (reservaData?.estadoPago === 'pagado') {
            console.log(`Reserva ${reservaId} ya estaba pagada. Ignorando webhook por idempotencia.`)
            pushData = null
            return
          }

          // El tenant se deriva de la reserva (§4.2): es la fuente autoritativa,
          // no una sesión. Fallback a la fundacional solo para reservas legacy.
          const empresaId: string | null = reservaData?.empresaId ?? empresaIdFundacional
          if (!empresaId) {
            throw new Error(
              `No se pudo resolver empresaId para la reserva ${reservaId}: no tiene el campo y no existe ninguna empresa fundacional.`
            )
          }
          if (!reservaData?.empresaId) {
            console.warn(
              `[wompi-webhook] Reserva ${reservaId} sin empresaId propio — usando fallback a la empresa fundacional (legacy).`
            )
          }

          pushData = {
            clienteNombre: reservaData?.clienteNombre || 'Cliente',
            fechaInicio: reservaData?.fechaInicio || '',
            fechaFin: reservaData?.fechaFin || '',
          }

          // 1. Actualizar Reserva
          t.update(reservaRef, {
            estadoPago: 'pagado',
            referenciaPago: transaction.id,
          })

          // 2. Confirmar bloques de agenda (fuente autoritativa)
          const mesaId: string = reservaData?.mesaId || ''

          // fechaLocal y bloques persisten desde el cliente en hora local correcta.
          // Fallback para reservas creadas antes de este fix: recalcular desde ISO
          // usando TZ de Colombia (UTC-5) para evitar el mismatch de timezone.
          let fechaLocal: string = reservaData?.fechaLocal || ''
          let bloquesReserva: string[] = reservaData?.bloques || []

          if (mesaId && !fechaLocal) {
            // Fallback: derivar fechaLocal en TZ Colombia (UTC-5) desde el ISO string
            const fechaInicio: string = reservaData?.fechaInicio || ''
            if (fechaInicio) {
              const tsMs = new Date(fechaInicio).getTime()
              const colombiaOffsetMs = -5 * 60 * 60 * 1000
              const localMs = tsMs + colombiaOffsetMs
              const localDate = new Date(localMs)
              const y = localDate.getUTCFullYear()
              const mo = String(localDate.getUTCMonth() + 1).padStart(2, '0')
              const d = String(localDate.getUTCDate()).padStart(2, '0')
              fechaLocal = `${y}-${mo}-${d}`
            }
          }

          if (mesaId && !bloquesReserva.length) {
            // Fallback: derivar bloques desde ISO strings en TZ Colombia
            const fechaInicio: string = reservaData?.fechaInicio || ''
            const fechaFin: string = reservaData?.fechaFin || ''
            if (fechaInicio && fechaFin) {
              const colombiaOffsetMs = -5 * 60 * 60 * 1000
              const hInicio = new Date(new Date(fechaInicio).getTime() + colombiaOffsetMs).getUTCHours()
              const hFin = new Date(new Date(fechaFin).getTime() + colombiaOffsetMs).getUTCHours()
              for (let h = hInicio; h < hFin; h++) {
                bloquesReserva.push(h.toString().padStart(2, '0'))
              }
            }
          }

          if (mesaId && fechaLocal && bloquesReserva.length) {
            const agendaDocId = `${mesaId}_${fechaLocal}`
            const agendaRef = db.collection('agendas').doc(agendaDocId)
            const agendaSnap = await t.get(agendaRef)

            if (agendaSnap.exists) {
              const agendaData = agendaSnap.data() as any
              const bloques = { ...(agendaData.bloques || {}) }
              let cambio = false
              for (const key of bloquesReserva) {
                if (bloques[key] && bloques[key].reservaId === reservaId && bloques[key].estado !== 'confirmado') {
                  bloques[key] = { ...bloques[key], estado: 'confirmado', holdExpira: null }
                  cambio = true
                }
              }
              if (cambio) {
                // Defensivo: si la agenda es legacy y no trae empresaId, se ancla aquí.
                t.set(agendaRef, {
                  ...agendaData,
                  bloques,
                  actualizadoEn: new Date().toISOString(),
                  empresaId: agendaData.empresaId ?? empresaId,
                })
              }
            }
          }

          // 3. Crear Venta
          const configRef = db.collection('configuracion').doc('general')
          const configSnap = await t.get(configRef)
          const nuevoConsecutivo = (configSnap.exists ? (configSnap.data()?.consecutivo_actual || 0) : 0) + 1

          t.set(configRef, { consecutivo_actual: nuevoConsecutivo }, { merge: true })

          const nuevaVentaRef = db.collection('ventas').doc()
          t.set(nuevaVentaRef, {
            empresaId,
            consecutivo: nuevoConsecutivo,
            fecha: new Date(),
            turnoId: 'reserva-web',
            cajeroId: 'wompi',
            espacioId: reservaData?.espacioId || 'salas-coworking',
            clienteNombre: reservaData?.clienteNombre || 'Cliente Web',
            metodoPago: 'transferencia',
            estado: 'pagada',
            origenReserva: reservaId,
            items: [
              {
                id: `reserva-${reservaId}`,
                nombre: `Reserva sala: ${reservaData?.mesaId || 'web'}`,
                cantidad: 1,
                precioUnitario: reservaData?.montoTotal || 0,
                costoUnitario: 0,
                subtotal: reservaData?.montoTotal || 0,
              },
            ],
            totales: {
              subtotal: reservaData?.montoTotal || 0,
              iva: 0,
              impoconsumo: 0,
              total: reservaData?.montoTotal || 0,
            },
          })

          // 4. Acreditar tesorería — espejo de registrarVenta(transferencia)
          const montoTotal: number = reservaData?.montoTotal || 0
          if (montoTotal > 0) {
            const bancolombiaRef = db.collection('cuentas_bancarias').doc('bancolombia')
            t.set(bancolombiaRef, { saldo: FieldValue.increment(montoTotal) }, { merge: true })
            t.set(db.collection('transacciones_financieras').doc(), {
              empresaId,
              cuentaId: 'bancolombia',
              cuentaNombre: 'Bancolombia',
              tipo: 'ingreso',
              monto: montoTotal,
              concepto: `Venta #${nuevoConsecutivo}`,
              categoria: 'ventas',
              referencia: nuevaVentaRef.id,
              usuarioId: 'wompi',
              usuarioNombre: 'Wompi (Reserva Web)',
              espacioId: reservaData?.espacioId || 'salas-coworking',
              fecha: new Date(),
            })
          }
        })
        
        console.log(`Reserva ${reservaId} pagada y Venta generada exitosamente.`)

        if (pushData) {
          const pd = pushData as { clienteNombre: string; fechaInicio: string; fechaFin: string }
          const colombiaOffsetMs = -5 * 60 * 60 * 1000
          let fechaHora = ''
          if (pd.fechaInicio) {
            const d = new Date(new Date(pd.fechaInicio).getTime() + colombiaOffsetMs)
            const dia = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
            const hInicio = `${String(d.getUTCHours()).padStart(2, '0')}:00`
            let hFin = ''
            if (pd.fechaFin) {
              const dFin = new Date(new Date(pd.fechaFin).getTime() + colombiaOffsetMs)
              hFin = `${String(dFin.getUTCHours()).padStart(2, '0')}:00`
            }
            fechaHora = hFin ? `${dia} ${hInicio}-${hFin}` : `${dia} ${hInicio}`
          }
          enviarPushAdmins({
            title: 'Nueva reserva recibida',
            body: `${pd.clienteNombre} — ${fechaHora}`,
            url: '/admin/reservas',
          }).catch(err => console.error('[push] Error notificando reserva:', err))
        }
      } catch (dbError: any) {
        if (dbError.message === 'Reservation not found') {
          return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
        }
        console.error(`Error actualizando Firebase para la reserva ${reservaId}:`, dbError)
        return NextResponse.json({ error: 'Failed to update DB' }, { status: 500 })
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
