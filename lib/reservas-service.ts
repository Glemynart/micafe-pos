import { db } from './firebase'
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  where,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  increment,
  runTransaction,
} from 'firebase/firestore'
import { tenantQuery, getEmpresaId, stampEmpresaId, withEmpresaId } from '@/lib/tenant'
import { registrarVenta } from '@/lib/ventas-service'

export interface Reserva {
  id: string
  clienteNombre: string
  clienteEmail: string
  clienteTelefono: string
  mesaId: string // ID de la sala de reuniones
  espacioId: string // ID del espacio al que pertenece la mesa
  fechaInicio: string // ISO string o timestamp
  fechaFin: string
  estadoPago: 'pendiente' | 'pagado' | 'fallido'
  estadoReserva: 'activa' | 'completada' | 'cancelada'
  montoTotal: number
  referenciaPago: string // Transacción Wompi
  fechaCreacion: string
  holdExpira?: string  // ISO — solo en reservas con hold activo
  fechaLocal?: string  // YYYY-MM-DD en TZ local del cliente — evita recálculo TZ en servidor
  bloques?: string[]   // claves de hora "08","09",... — evita reparse de ISO en servidor
}

// ─── AGENDA ──────────────────────────────────────────────────────────────────

export interface BloqueAgenda {
  reservaId: string
  estado: 'hold' | 'confirmado'
  holdExpira: string | null // ISO; null cuando estado === 'confirmado'
  creadoEn: string          // ISO
}

interface AgendaDoc {
  mesaId: string
  espacioId: string
  fecha: string             // YYYY-MM-DD local
  materializado: boolean
  bloques: Record<string, BloqueAgenda>
  actualizadoEn: string
}

function agendaId(mesaId: string, fechaLocal: string): string {
  return `${mesaId}_${fechaLocal}`
}

function bloquesDeRango(fechaInicio: string, fechaFin: string): string[] {
  const inicio = new Date(fechaInicio)
  const fin = new Date(fechaFin)
  const bloques: string[] = []
  const h = inicio.getHours()
  const hFin = fin.getHours()
  for (let i = h; i < hFin; i++) {
    bloques.push(i.toString().padStart(2, '0'))
  }
  return bloques
}

// MT-U3 Capa 4 (§4.5) — getBloquesOcupados y crearReservaConHold corren desde
// la landing pública `/reservar` SIN sesión de Firebase Auth. El helper de
// tenant ambiental (`lib/tenant.ts`) exige `auth.currentUser` y lanzaría en
// cada visitante anónimo — por eso estas dos funciones ya NO tocan Firestore
// directo: delegan a rutas server-side (`/api/reservas/disponibilidad`,
// `/api/reservas/hold`) que corren con Admin SDK y resuelven el tenant de
// forma explícita (§3.6), igual que el webhook de Wompi (deuda de MT-U11)
// y los scripts de migración. El contrato público de ambas funciones
// (firma, tipos, mensaje de error 'BLOQUE_OCUPADO') no cambia — cero cambios
// en `app/reservar/page.tsx`.
//
// confirmarAgenda/liberarAgenda (abajo) SÍ siguen escribiendo Firestore
// directo desde el cliente: solo actualizan bloques de una agenda que ya
// existe (creada por /api/reservas/hold, ya con empresaId) preservándolo vía
// spread — no crean documentos nuevos, así que no necesitan resolver tenant.

/**
 * Lee la agenda de una mesa para un día. Si no existe, el servidor la
 * materializa vacía y estampada. Devuelve las claves de hora ocupadas,
 * ej: ["08","09","13"].
 */
export async function getBloquesOcupados(mesaId: string, fechaLocal: string, slug: string): Promise<string[]> {
  const params = new URLSearchParams({ mesaId, fechaLocal, slug })
  const res = await fetch(`/api/reservas/disponibilidad?${params.toString()}`)
  if (!res.ok) {
    throw new Error('No se pudo consultar la disponibilidad de la agenda.')
  }
  const data = (await res.json()) as { bloquesOcupados: string[] }
  return data.bloquesOcupados
}

/**
 * Claim transaccional: crea la reserva y reclama los bloques de agenda
 * en una sola transacción server-side. Lanza `Error('BLOQUE_OCUPADO')` si
 * algún bloque está ocupado (mismo contrato que la versión previa).
 */
export async function crearReservaConHold(
  reservaData: Omit<Reserva, 'id'>,
  fechaLocal: string,
  bloquesSolicitados: string[],
  slug: string
): Promise<string> {
  const res = await fetch('/api/reservas/hold', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reservaData, fechaLocal, bloquesSolicitados, slug }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error === 'BLOQUE_OCUPADO' ? 'BLOQUE_OCUPADO' : 'No se pudo crear la reserva.')
  }

  const data = (await res.json()) as { reservaId: string }
  return data.reservaId
}

/**
 * Confirma los bloques de agenda como pagados (idempotente).
 * Solo actúa sobre bloques que aún pertenecen a esta reserva.
 */
export async function confirmarAgenda(
  reservaId: string,
  mesaId: string,
  fechaLocal: string,
  bloquesSolicitados: string[]
): Promise<void> {
  const agendaRef = doc(db, 'agendas', agendaId(mesaId, fechaLocal))

  await runTransaction(db, async (tx) => {
    const agendaSnap = await tx.get(agendaRef)
    if (!agendaSnap.exists()) return

    const data = agendaSnap.data() as AgendaDoc
    const nuevosBloques = { ...data.bloques }
    let cambio = false

    for (const b of bloquesSolicitados) {
      const bloque = nuevosBloques[b]
      if (bloque && bloque.reservaId === reservaId && bloque.estado !== 'confirmado') {
        nuevosBloques[b] = { ...bloque, estado: 'confirmado', holdExpira: null }
        cambio = true
      }
    }

    if (cambio) {
      tx.set(agendaRef, { ...data, bloques: nuevosBloques, actualizadoEn: new Date().toISOString() })
    }
  })
}

/**
 * Libera bloques de agenda (pago fallido / cancelación).
 * Solo elimina bloques que aún pertenecen a esta reserva y no están confirmados.
 */
export async function liberarAgenda(
  reservaId: string,
  mesaId: string,
  fechaLocal: string,
  bloquesSolicitados: string[]
): Promise<void> {
  const agendaRef = doc(db, 'agendas', agendaId(mesaId, fechaLocal))

  await runTransaction(db, async (tx) => {
    const agendaSnap = await tx.get(agendaRef)
    if (!agendaSnap.exists()) return

    const data = agendaSnap.data() as AgendaDoc
    const nuevosBloques = { ...data.bloques }
    let cambio = false

    for (const b of bloquesSolicitados) {
      const bloque = nuevosBloques[b]
      if (bloque && bloque.reservaId === reservaId && bloque.estado === 'hold') {
        delete nuevosBloques[b]
        cambio = true
      }
    }

    if (cambio) {
      tx.set(agendaRef, { ...data, bloques: nuevosBloques, actualizadoEn: new Date().toISOString() })
    }
  })
}

const COLLECTION_NAME = 'reservas'

// IDs de reservas cuya cancelación automática ya está en vuelo.
// Evita lanzar cancelarReserva() dos veces sobre el mismo doc mientras la
// transacción anterior aún no ha completado (ej: dos snapshots consecutivos
// o dos tabs con la suscripción activa al mismo tiempo).
const _cleanupInFlight = new Set<string>()

// ─── LECTURA PARA EL POS ────────────────────────────────────────────────────────

/**
 * Suscribe a las reservas activas del día actual o futuras.
 */
export function suscribirReservasActivas(callback: (reservas: Reserva[], nuevas: Reserva[]) => void) {
  let unsubscribe = () => {}
  let cancelado = false

  tenantQuery(
    collection(db, COLLECTION_NAME),
    where('estadoReserva', '==', 'activa')
  ).then((q) => {
    if (cancelado) return
    unsubscribe = onSnapshot(q, (snapshot) => {
      const reservas = snapshot.docs.map(d => ({
        ...(d.data() as Omit<Reserva, 'id'>),
        id: d.id,
      })).sort((a, b) => new Date(a.fechaInicio).getTime() - new Date(b.fechaInicio).getTime())

      const nuevas = snapshot.docChanges()
        .filter(change => change.type === 'added')
        .map(change => ({ ...change.doc.data(), id: change.doc.id } as Reserva))

      // Cancelar holds expirados en cada snapshot.
      // cancelarReserva() es idempotente: si el doc ya está cancelado, no escribe.
      const ahora = new Date()
      reservas
        .filter(r =>
          r.estadoPago === 'pendiente' &&
          r.holdExpira != null &&
          new Date(r.holdExpira) < ahora &&
          !_cleanupInFlight.has(r.id)
        )
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

/**
 * Trae las reservas de una mesa específica para verificar disponibilidad.
 */
export async function getReservasMesa(mesaId: string, fechaDia: string): Promise<Reserva[]> {
  // fechaDia es "YYYY-MM-DD". Parsemos explícitamente en la zona horaria local 
  // para evitar que new Date("YYYY-MM-DD") lo asuma como UTC y nos devuelva el día anterior.
  const [year, month, day] = fechaDia.split('-').map(Number)
  
  const inicioDia = new Date(year, month - 1, day)
  inicioDia.setHours(0, 0, 0, 0)
  
  const finDia = new Date(year, month - 1, day)
  finDia.setHours(23, 59, 59, 999)

  // Solo usamos un filtro de igualdad (mesaId) para que Firebase use el índice automático
  // de un solo campo. Si mezclamos con fechaInicio (desigualdad) o estadoReserva, Firebase
  // arrojará un error de "missing composite index" y fallará la consulta, mostrando todo libre.
  const q = await tenantQuery(
    collection(db, COLLECTION_NAME),
    where('mesaId', '==', mesaId)
  )

  const snapshot = await getDocs(q)
  const todas = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Reserva, 'id'>) }))
  
  // Filtramos en memoria el estado y la fecha para reemplazar los índices faltantes
  const inicioIso = inicioDia.toISOString()
  const finIso = finDia.toISOString()

  return todas.filter(r => {
    const esActivaOCompletada = r.estadoReserva === 'activa' || r.estadoReserva === 'completada'
    const enRangoDeFecha = r.fechaInicio >= inicioIso && r.fechaInicio <= finIso
    return esActivaOCompletada && enRangoDeFecha
  })
}

// ─── ESCRITURA ────────────────────────────────────────────────────────────────

export async function crearReserva(reserva: Omit<Reserva, 'id'>): Promise<string> {
  const newRef = doc(collection(db, COLLECTION_NAME))
  await setDoc(newRef, await stampEmpresaId({ ...reserva, id: newRef.id }))
  return newRef.id
}

export async function actualizarEstadoPago(reservaId: string, estadoPago: Reserva['estadoPago'], referencia?: string) {
  const updateData: any = { estadoPago }
  if (referencia) updateData.referenciaPago = referencia
  await updateDoc(doc(db, COLLECTION_NAME, reservaId), updateData)
}

export async function cancelarReserva(reservaId: string): Promise<void> {
  const reservaRef = doc(db, COLLECTION_NAME, reservaId)

  await runTransaction(db, async (tx) => {
    // ── LECTURAS (todas antes de cualquier escritura) ─────────────────────────

    const reservaSnap = await tx.get(reservaRef)
    if (!reservaSnap.exists()) throw new Error('Reserva no encontrada')

    const reservaData = reservaSnap.data() as Reserva
    if (reservaData.estadoReserva === 'cancelada') return // idempotente

    // Derivar coordenadas de agenda con fallback UTC-5 Colombia (igual que el webhook de Wompi)
    const mesaId = reservaData.mesaId || ''
    const colombiaOffsetMs = -5 * 60 * 60 * 1000

    let fechaLocal = reservaData.fechaLocal || ''
    if (mesaId && !fechaLocal && reservaData.fechaInicio) {
      const d = new Date(new Date(reservaData.fechaInicio).getTime() + colombiaOffsetMs)
      fechaLocal = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    }

    let bloques: string[] = reservaData.bloques ? [...reservaData.bloques] : []
    if (mesaId && !bloques.length && reservaData.fechaInicio && reservaData.fechaFin) {
      const hInicio = new Date(new Date(reservaData.fechaInicio).getTime() + colombiaOffsetMs).getUTCHours()
      const hFin    = new Date(new Date(reservaData.fechaFin).getTime()    + colombiaOffsetMs).getUTCHours()
      for (let h = hInicio; h < hFin; h++) bloques.push(h.toString().padStart(2, '0'))
    }

    const agendaDocId = mesaId && fechaLocal && bloques.length ? `${mesaId}_${fechaLocal}` : null
    const agendaRef   = agendaDocId ? doc(db, 'agendas', agendaDocId) : null
    const agendaSnap  = agendaRef ? await tx.get(agendaRef) : null

    // ── ESCRITURAS ───────────────────────────────────────────────────────────

    tx.update(reservaRef, { estadoReserva: 'cancelada' })

    if (agendaRef && agendaSnap?.exists()) {
      const agendaData = agendaSnap.data() as AgendaDoc
      const nuevosBloques: Record<string, BloqueAgenda> = { ...agendaData.bloques }
      let cambio = false

      for (const b of bloques) {
        if (nuevosBloques[b]?.reservaId === reservaId) {
          delete nuevosBloques[b]
          cambio = true
        }
      }

      if (cambio) {
        tx.set(agendaRef, { ...agendaData, bloques: nuevosBloques, actualizadoEn: new Date().toISOString() })
      }
    }
  })
}

/**
 * Completa una reserva de forma atómica e idempotente (fuente única de verdad).
 *
 * - Lee la reserva dentro de la transacción y usa `estadoPago` como discriminador:
 *   solo crea venta cuando la reserva aún NO estaba pagada (las pagadas por Wompi
 *   ya tienen su venta creada por el webhook).
 * - Idempotente: si la reserva ya está completada, retorna sin escribir nada.
 * - Consecutivo y venta se generan en la misma transacción → sin duplicados ante
 *   doble-click, reintentos de red o carrera con el webhook (todos guardan sobre
 *   `estadoPago` y escriben `reservas/{id}`, lo que fuerza la serialización).
 *
 * MODELO B: cobrar una reserva pendiente exige un turno real. Si se debe crear
 * venta y no se proveen `turnoId`/`cajeroId`, lanza 'TURNO_REQUERIDO'. El Admin
 * solo invoca esta función sobre reservas ya pagadas (no crea venta).
 */
export async function completarReserva(params: {
  reservaId: string
  turnoId?: string
  cajeroId?: string
  cajeroNombre?: string
  metodoPago?: 'efectivo' | 'transferencia'
}): Promise<void> {
  const reservaRef = doc(db, COLLECTION_NAME, params.reservaId)

  // 1. Lectura preliminar fuera de la transacción para verificar necesidad de venta
  const reservaSnapInitial = await getDoc(reservaRef)
  if (!reservaSnapInitial.exists()) throw new Error('Reserva no encontrada')

  const rInitial = reservaSnapInitial.data() as Reserva
  if (rInitial.estadoReserva === 'completada') return // idempotente
  if (rInitial.estadoReserva === 'cancelada') throw new Error('No se puede completar una reserva cancelada')

  const necesitaVenta = rInitial.estadoPago !== 'pagado'
  if (necesitaVenta && (!params.turnoId || !params.cajeroId)) {
    throw new Error('TURNO_REQUERIDO')
  }

  // 2. Si necesita venta, ejecutar la Saga de Ventas B7
  if (necesitaVenta) {
    const metodoPago = (params.metodoPago ?? 'transferencia') as 'efectivo' | 'transferencia'
    await registrarVenta({
      turnoId: params.turnoId!,
      cajeroId: params.cajeroId!,
      cajeroNombre: params.cajeroNombre,
      espacioId: rInitial.espacioId || 'salas-coworking',
      clienteNombre: rInitial.clienteNombre,
      items: [
        {
          id: `reserva-${params.reservaId}`,
          nombre: `Reserva sala: ${rInitial.mesaId}`,
          cantidad: 1,
          precioUnitario: rInitial.montoTotal,
          costoUnitario: 0,
          subtotal: rInitial.montoTotal,
          base: rInitial.montoTotal,
          impuestoTipo: "excluido",
          impuestoTarifa: 0,
          impuestoValor: 0,
        },
      ],
      totales: {
        subtotalBase: rInitial.montoTotal,
        totalINC: 0,
        totalExcluido: rInitial.montoTotal,
        total: rInitial.montoTotal,
      },
      regimenAlMomento: 'no_responsable',
      metodoPago,
      estado: 'pagada',
    })
  }

  // 3. Transacción para actualizar la reserva y liberar/confirmar agenda
  await runTransaction(db, async (tx) => {
    const reservaSnap = await tx.get(reservaRef)
    if (!reservaSnap.exists()) throw new Error('Reserva no encontrada')

    const r = reservaSnap.data() as Reserva
    if (r.estadoReserva === 'completada') return

    // Derivar coordenadas de agenda
    const colombiaOffsetMs = -5 * 60 * 60 * 1000
    const mesaId = r.mesaId ?? ''
    let fechaLocal = r.fechaLocal ?? ''
    if (mesaId && !fechaLocal && r.fechaInicio) {
      const d = new Date(new Date(r.fechaInicio).getTime() + colombiaOffsetMs)
      fechaLocal = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    }
    const bloques = r.bloques ?? []

    const agendaDocId = mesaId && fechaLocal && bloques.length > 0 ? `${mesaId}_${fechaLocal}` : null
    const agendaRef   = agendaDocId ? doc(db, 'agendas', agendaDocId) : null
    const agendaSnap  = agendaRef ? await tx.get(agendaRef) : null

    tx.update(reservaRef, {
      estadoReserva: 'completada',
      estadoPago: 'pagado',
      fechaCompletada: new Date().toISOString(),
    })

    if (agendaRef && agendaSnap?.exists()) {
      const agendaData = agendaSnap.data() as AgendaDoc
      const nuevosBloques: Record<string, BloqueAgenda> = { ...agendaData.bloques }
      let cambio = false

      for (const b of bloques) {
        const bloque = nuevosBloques[b]
        if (bloque && bloque.reservaId === params.reservaId && bloque.estado !== 'confirmado') {
          nuevosBloques[b] = { ...bloque, estado: 'confirmado', holdExpira: null }
          cambio = true
        }
      }

      if (cambio) {
        tx.set(agendaRef, { ...agendaData, bloques: nuevosBloques, actualizadoEn: new Date().toISOString() })
      }
    }
  })
}
