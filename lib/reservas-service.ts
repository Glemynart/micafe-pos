import {
  collection,
  doc,
  onSnapshot,
  where,
  getDoc,
  getDocs,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { tenantQuery } from '@/lib/tenant'
import { ejecutarComandoReserva } from '@/lib/reservas-command'

export interface Reserva {
  id: string
  clienteNombre: string
  clienteEmail: string
  clienteTelefono: string
  mesaId: string
  espacioId: string
  fechaInicio: string
  fechaFin: string
  estadoPago: 'pendiente' | 'pagado' | 'fallido'
  estadoReserva: 'activa' | 'completada' | 'cancelada'
  montoTotal: number
  referenciaPago: string
  fechaCreacion: string
  holdExpira?: string
  fechaLocal?: string
  bloques?: string[]
}

// La disponibilidad y el hold público corren en rutas server-side porque el
// visitante no tiene una sesión Firebase. Las operaciones internas del POS
// también pasan por Functions; este módulo conserva únicamente lecturas y la
// intención de comando.

export async function getBloquesOcupados(mesaId: string, fechaLocal: string, slug: string): Promise<string[]> {
  const params = new URLSearchParams({ mesaId, fechaLocal, slug })
  const res = await fetch(`/api/reservas/disponibilidad?${params.toString()}`)
  if (!res.ok) throw new Error('No se pudo consultar la disponibilidad de la agenda.')
  const data = (await res.json()) as { bloquesOcupados: string[] }
  return data.bloquesOcupados
}

export async function crearReservaConHold(
  cliente: { nombre: string; email: string; telefono: string },
  mesaId: string,
  fechaLocal: string,
  bloquesSolicitados: string[],
  slug: string,
): Promise<{ reservaId: string; checkout: { amountInCents: number; currency: 'COP'; reference: string; signature: string; publicKey: string } }> {
  const res = await fetch('/api/reservas/hold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, mesaId, fechaLocal, bloquesSolicitados, cliente }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error === 'BLOQUE_OCUPADO' ? 'BLOQUE_OCUPADO' : 'No se pudo crear la reserva.')
  }
  return await res.json()
}

const COLLECTION_NAME = 'reservas'
const _cleanupInFlight = new Set<string>()

export function suscribirReservasActivas(callback: (reservas: Reserva[], nuevas: Reserva[]) => void) {
  let unsubscribe = () => {}
  let cancelado = false

  tenantQuery(collection(db, COLLECTION_NAME), where('estadoReserva', '==', 'activa')).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snapshot) => {
      const reservas = snapshot.docs.map(d => ({
        ...(d.data() as Omit<Reserva, 'id'>),
        id: d.id,
      })).sort((a, b) => new Date(a.fechaInicio).getTime() - new Date(b.fechaInicio).getTime())

      const nuevas = snapshot.docChanges()
        .filter(change => change.type === 'added')
        .map(change => ({ ...change.doc.data(), id: change.doc.id } as Reserva))

      const ahora = new Date()
      reservas
        .filter(r => r.estadoPago === 'pendiente' && r.holdExpira != null && new Date(r.holdExpira) < ahora && !_cleanupInFlight.has(r.id))
        .forEach(r => {
          _cleanupInFlight.add(r.id)
          cancelarReserva(r.id)
            .catch(err => console.warn('[reservas-cleanup]', r.id, err))
            .finally(() => _cleanupInFlight.delete(r.id))
        })

      callback(reservas, nuevas)
    })
  })

  return () => {
    cancelado = true
    unsubscribe()
  }
}

export async function getReservasMesa(mesaId: string, fechaDia: string): Promise<Reserva[]> {
  const [year, month, day] = fechaDia.split('-').map(Number)
  const inicioDia = new Date(year, month - 1, day)
  inicioDia.setHours(0, 0, 0, 0)
  const finDia = new Date(year, month - 1, day)
  finDia.setHours(23, 59, 59, 999)

  const q = await tenantQuery(collection(db, COLLECTION_NAME), where('mesaId', '==', mesaId))
  const snapshot = await getDocs(q)
  const todas = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Reserva, 'id'>) }))
  const inicioIso = inicioDia.toISOString()
  const finIso = finDia.toISOString()

  return todas.filter(r => {
    const esActivaOCompletada = r.estadoReserva === 'activa' || r.estadoReserva === 'completada'
    const enRangoDeFecha = r.fechaInicio >= inicioIso && r.fechaInicio <= finIso
    return esActivaOCompletada && enRangoDeFecha
  })
}

export async function cancelarReserva(reservaId: string): Promise<void> {
  await ejecutarComandoReserva('cancelar', reservaId, {})
}

export async function completarReserva(params: {
  reservaId: string
  turnoId?: string
  metodoPago?: 'efectivo' | 'transferencia'
}): Promise<void> {
  const reservaSnap = await getDoc(doc(db, COLLECTION_NAME, params.reservaId))
  if (!reservaSnap.exists()) throw new Error('Reserva no encontrada')
  const reserva = reservaSnap.data() as Reserva
  if (reserva.estadoReserva === 'completada') return
  if (reserva.estadoReserva === 'cancelada') throw new Error('No se puede completar una reserva cancelada')

  await ejecutarComandoReserva('completar', params.reservaId, {
    ...(reserva.estadoPago !== 'pagado' ? {
      turnoId: params.turnoId,
      metodoPago: params.metodoPago ?? 'transferencia',
    } : {}),
  })
}
