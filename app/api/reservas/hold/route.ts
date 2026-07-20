import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'

/**
 * MT-U3 Capa 4 (§4.5) — creación de reserva + hold de agenda desde la landing
 * pública `/reservar`.
 *
 * Corre server-side con Admin SDK: el visitante no tiene sesión de Firebase
 * Auth, así que el helper de tenant ambiental no puede resolver `empresaId`
 * (no hay claim que leer). Es la vía explícita de §3.6 — igual que el webhook
 * de Wompi y los scripts de migración: el tenant se resuelve por
 * `esFundacional==true`, nunca lo decide el cliente (regla de oro
 * ADR-SAAS-001).
 *
 * Reemplaza la transacción que antes ejecutaba `crearReservaConHold` directo
 * contra Firestore desde el navegador (ver `lib/reservas-service.ts`). La
 * validación de forma espeja la que hoy exige `firestore.rules` para
 * `reservas.create` anónimo — aquí es necesaria porque Admin SDK evade esas
 * reglas por diseño.
 */

interface BloqueAgenda {
  reservaId: string
  estado: 'hold' | 'confirmado'
  holdExpira: string | null
  creadoEn: string
}

interface AgendaDoc {
  bloques?: Record<string, BloqueAgenda>
}

interface ReservaHoldInput {
  reservaData: {
    clienteNombre: string
    clienteEmail: string
    clienteTelefono: string
    mesaId: string
    espacioId: string
    fechaInicio: string
    fechaFin: string
    estadoPago: 'pendiente'
    estadoReserva: 'activa'
    montoTotal: number
    referenciaPago: string
    fechaCreacion: string
  }
  fechaLocal: string
  bloquesSolicitados: string[]
}

const HOLD_TTL_MS = 15 * 60 * 1000 // 15 minutos — igual que crearReservaConHold

function esBloqueOcupado(bloque: BloqueAgenda, ahora: Date): boolean {
  if (bloque.estado === 'confirmado') return true
  if (!bloque.holdExpira) return false
  return new Date(bloque.holdExpira) > ahora
}

async function resolverEmpresaIdFundacional(db: FirebaseFirestore.Firestore): Promise<string> {
  const snap = await db.collection('empresas').where('esFundacional', '==', true).limit(1).get()
  if (snap.empty) {
    throw new Error('No existe ninguna empresa con esFundacional==true.')
  }
  return snap.docs[0].id
}

function validarInput(body: any): body is ReservaHoldInput {
  const r = body?.reservaData
  return (
    !!r &&
    typeof r.clienteNombre === 'string' &&
    typeof r.clienteEmail === 'string' &&
    typeof r.clienteTelefono === 'string' &&
    typeof r.mesaId === 'string' && r.mesaId.length > 0 &&
    typeof r.espacioId === 'string' &&
    typeof r.fechaInicio === 'string' &&
    typeof r.fechaFin === 'string' &&
    typeof r.montoTotal === 'number' &&
    r.estadoPago === 'pendiente' &&
    r.estadoReserva === 'activa' &&
    typeof body.fechaLocal === 'string' && body.fechaLocal.length > 0 &&
    Array.isArray(body.bloquesSolicitados) &&
    body.bloquesSolicitados.every((b: unknown) => typeof b === 'string')
  )
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!validarInput(body)) {
      return NextResponse.json({ error: 'Datos de reserva inválidos' }, { status: 400 })
    }

    const { reservaData, fechaLocal, bloquesSolicitados } = body
    const db = getAdminDb()

    // MT-U3 §2.5: resuelto UNA sola vez, antes de la transacción.
    const empresaId = await resolverEmpresaIdFundacional(db)

    const reservaRef = db.collection('reservas').doc()
    const agendaRef = db.collection('agendas').doc(`${reservaData.mesaId}_${fechaLocal}`)
    const holdExpira = new Date(Date.now() + HOLD_TTL_MS).toISOString()
    const ahora = new Date()

    await db.runTransaction(async (tx) => {
      const agendaSnap = await tx.get(agendaRef)
      const bloquesActuales: Record<string, BloqueAgenda> = agendaSnap.exists
        ? ((agendaSnap.data() as AgendaDoc).bloques || {})
        : {}

      for (const b of bloquesSolicitados) {
        const bloque = bloquesActuales[b]
        if (bloque && bloque.reservaId !== reservaRef.id && esBloqueOcupado(bloque, ahora)) {
          throw new Error('BLOQUE_OCUPADO')
        }
      }

      const nuevosBloques = { ...bloquesActuales }
      for (const b of bloquesSolicitados) {
        nuevosBloques[b] = {
          reservaId: reservaRef.id,
          estado: 'hold',
          holdExpira,
          creadoEn: new Date().toISOString(),
        }
      }

      tx.set(agendaRef, {
        mesaId: reservaData.mesaId,
        espacioId: reservaData.espacioId,
        fecha: fechaLocal,
        materializado: true,
        bloques: nuevosBloques,
        actualizadoEn: new Date().toISOString(),
        empresaId,
      })

      tx.set(reservaRef, {
        ...reservaData,
        id: reservaRef.id,
        holdExpira,
        fechaLocal,
        bloques: bloquesSolicitados,
        empresaId,
      })
    })

    return NextResponse.json({ reservaId: reservaRef.id })
  } catch (error: any) {
    if (error?.message === 'BLOQUE_OCUPADO') {
      return NextResponse.json({ error: 'BLOQUE_OCUPADO' }, { status: 409 })
    }
    console.error('Error en /api/reservas/hold:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
