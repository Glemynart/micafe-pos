import { db } from './firebase'
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  updateDoc,
  serverTimestamp,
  increment,
  runTransaction,
  getDoc,
} from 'firebase/firestore'

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

const HOLD_TTL_MS = 15 * 60 * 1000 // 15 minutos

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

function esBloqueOcupado(bloque: BloqueAgenda, ahora: Date): boolean {
  if (bloque.estado === 'confirmado') return true
  if (!bloque.holdExpira) return false
  return new Date(bloque.holdExpira) > ahora
}

/**
 * Lee la agenda de una mesa para un día. Si no existe o no está materializada,
 * la construye a partir de las reservas existentes (materialización perezosa).
 * Devuelve las claves de hora ocupadas, ej: ["08","09","13"].
 */
export async function getBloquesOcupados(mesaId: string, fechaLocal: string): Promise<string[]> {
  const agendaRef = doc(db, 'agendas', agendaId(mesaId, fechaLocal))
  const agendaSnap = await getDoc(agendaRef)
  const ahora = new Date()

  if (agendaSnap.exists()) {
    const data = agendaSnap.data() as AgendaDoc
    return Object.entries(data.bloques || {})
      .filter(([, bloque]) => esBloqueOcupado(bloque, ahora))
      .map(([hora]) => hora)
  }

  // Agenda no existe: combinación mesa+fecha sin reservas previas.
  // La materializamos vacía para evitar leer la colección reservas (datos PII).
  // crearReservaConHold materializa la agenda con los bloques reales al crear la primera reserva.
  await setDoc(agendaRef, {
    mesaId,
    espacioId: 'salas-coworking',
    fecha: fechaLocal,
    materializado: true,
    bloques: {},
    actualizadoEn: new Date().toISOString(),
  })

  return []
}

/**
 * Claim transaccional: crea la reserva y reclama los bloques de agenda
 * en una sola transacción. Lanza error si algún bloque está ocupado.
 */
export async function crearReservaConHold(
  reservaData: Omit<Reserva, 'id'>,
  fechaLocal: string,
  bloquesSolicitados: string[]
): Promise<string> {
  const reservaRef = doc(collection(db, 'reservas'))
  const agendaRef = doc(db, 'agendas', agendaId(reservaData.mesaId, fechaLocal))
  const holdExpira = new Date(Date.now() + HOLD_TTL_MS).toISOString()
  const ahora = new Date()

  await runTransaction(db, async (tx) => {
    const agendaSnap = await tx.get(agendaRef)
    const bloquesActuales: Record<string, BloqueAgenda> =
      agendaSnap.exists() ? (agendaSnap.data() as AgendaDoc).bloques : {}

    // Verificar que ningún bloque solicitado esté ocupado
    for (const b of bloquesSolicitados) {
      const bloque = bloquesActuales[b]
      if (bloque && bloque.reservaId !== reservaRef.id && esBloqueOcupado(bloque, ahora)) {
        throw new Error('BLOQUE_OCUPADO')
      }
    }

    // Escribir holds en la agenda
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
    })

    tx.set(reservaRef, {
      ...reservaData,
      id: reservaRef.id,
      holdExpira,
      fechaLocal,
      bloques: bloquesSolicitados,
    })
  })

  return reservaRef.id
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
  const q = query(
    collection(db, COLLECTION_NAME),
    where('estadoReserva', '==', 'activa')
  )

  return onSnapshot(q, (snapshot) => {
    const reservas = snapshot.docs.map(d => ({
      id: d.id,
      ...(d.data() as Omit<Reserva, 'id'>)
    })).sort((a, b) => new Date(a.fechaInicio).getTime() - new Date(b.fechaInicio).getTime())

    const nuevas = snapshot.docChanges()
      .filter(change => change.type === 'added')
      .map(change => ({ id: change.doc.id, ...change.doc.data() } as Reserva))

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
  const q = query(
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
  await setDoc(newRef, { ...reserva, id: newRef.id })
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
  const configRef = doc(db, 'configuracion', 'general')
  const nuevaVentaRef = doc(collection(db, 'ventas'))

  await runTransaction(db, async (tx) => {
    // ── LECTURAS (todas antes de cualquier escritura) ─────────────────────────

    const reservaSnap = await tx.get(reservaRef)
    if (!reservaSnap.exists()) throw new Error('Reserva no encontrada')

    const r = reservaSnap.data() as Reserva
    if (r.estadoReserva === 'completada') return // idempotente
    if (r.estadoReserva === 'cancelada') throw new Error('No se puede completar una reserva cancelada')

    const necesitaVenta = r.estadoPago !== 'pagado'

    if (necesitaVenta && (!params.turnoId || !params.cajeroId)) {
      throw new Error('TURNO_REQUERIDO')
    }

    let nuevoConsecutivo = 0
    if (necesitaVenta) {
      const configSnap = await tx.get(configRef)
      nuevoConsecutivo = (configSnap.exists() ? (configSnap.data().consecutivo_actual || 0) : 0) + 1
    }

    // Derivar coordenadas de agenda con fallback UTC-5 Colombia (igual que cancelarReserva)
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

    // ── ESCRITURAS ────────────────────────────────────────────────────────────

    if (necesitaVenta) {
      const metodoPago = params.metodoPago ?? 'transferencia'
      const cuentaId = metodoPago === 'efectivo' ? 'caja-principal' : 'bancolombia'
      const cuentaNombre = metodoPago === 'efectivo' ? 'Caja Registradora' : 'Bancolombia'

      tx.set(configRef, { consecutivo_actual: nuevoConsecutivo }, { merge: true })
      tx.set(nuevaVentaRef, {
        consecutivo: nuevoConsecutivo,
        fecha: serverTimestamp(),
        turnoId: params.turnoId,
        cajeroId: params.cajeroId,
        espacioId: r.espacioId || 'salas-coworking',
        clienteNombre: r.clienteNombre,
        metodoPago,
        estado: 'pagada',
        origenReserva: params.reservaId,
        items: [
          {
            id: `reserva-${params.reservaId}`,
            nombre: `Reserva sala: ${r.mesaId}`,
            cantidad: 1,
            precioUnitario: r.montoTotal,
            costoUnitario: 0,
            subtotal: r.montoTotal,
          },
        ],
        totales: {
          subtotal: r.montoTotal,
          iva: 0,
          impoconsumo: 0,
          total: r.montoTotal,
        },
      })
      tx.update(doc(db, 'cuentas_bancarias', cuentaId), { saldo: increment(r.montoTotal) })
      tx.set(doc(collection(db, 'transacciones_financieras')), {
        cuentaId,
        cuentaNombre,
        tipo: 'ingreso',
        monto: r.montoTotal,
        concepto: `Venta #${nuevoConsecutivo}`,
        categoria: 'ventas',
        referencia: nuevaVentaRef.id,
        usuarioId: params.cajeroId,
        usuarioNombre: params.cajeroNombre ?? params.cajeroId,
        espacioId: r.espacioId ?? 'salas-coworking',
        fecha: serverTimestamp(),
      })
    }

    tx.update(reservaRef, {
      estadoReserva: 'completada',
      estadoPago: 'pagado',
      fechaCompletada: new Date().toISOString(),
    })

    // Confirmar bloques de agenda (idempotente — no toca bloques ya confirmados ni de otras reservas)
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
