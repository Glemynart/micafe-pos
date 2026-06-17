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

  if (agendaSnap.exists() && agendaSnap.data().materializado) {
    const data = agendaSnap.data() as AgendaDoc
    return Object.entries(data.bloques)
      .filter(([, bloque]) => esBloqueOcupado(bloque, ahora))
      .map(([hora]) => hora)
  }

  // Materialización perezosa: construir desde reservas existentes
  const reservasExistentes = await getReservasMesa(mesaId, fechaLocal)
  const bloquesIniciales: Record<string, BloqueAgenda> = {}
  const ahora2 = new Date()

  for (const r of reservasExistentes) {
    const bloquesReserva = r.bloques ?? bloquesDeRango(r.fechaInicio, r.fechaFin)
    const confirmado = r.estadoPago === 'pagado'
    // Reutilizar holdExpira original si existe; si no, asignar TTL desde ahora
    const holdExpiraLegacy = confirmado
      ? null
      : (r.holdExpira ?? new Date(ahora2.getTime() + HOLD_TTL_MS).toISOString())
    for (const b of bloquesReserva) {
      bloquesIniciales[b] = {
        reservaId: r.id,
        estado: confirmado ? 'confirmado' : 'hold',
        holdExpira: holdExpiraLegacy,
        creadoEn: r.fechaCreacion,
      }
    }
  }

  await setDoc(agendaRef, {
    mesaId,
    espacioId: 'salas-coworking',
    fecha: fechaLocal,
    materializado: true,
    bloques: bloquesIniciales,
    actualizadoEn: new Date().toISOString(),
  })

  return Object.entries(bloquesIniciales)
    .filter(([, bloque]) => esBloqueOcupado(bloque, ahora))
    .map(([hora]) => hora)
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

export async function cancelarReserva(reservaId: string) {
  await updateDoc(doc(db, COLLECTION_NAME, reservaId), { estadoReserva: 'cancelada' })
}

export async function marcarReservaCompletada(reservaId: string) {
  // Marcar como completada y confirmar pago al mismo tiempo
  await updateDoc(doc(db, COLLECTION_NAME, reservaId), {
    estadoReserva: 'completada',
    estadoPago: 'pagado',
    fechaCompletada: new Date().toISOString(),
  })
}

/**
 * Registra el ingreso de una reserva en la colección ventas,
 * usando transferencia como método de pago (Wompi web).
 */
export async function registrarIngresoReserva(params: {
  reservaId: string
  clienteNombre: string
  mesaId: string
  espacioId: string
  montoTotal: number
  turnoId: string
  cajeroId: string
}) {
  const ventasRef = collection(db, 'ventas')
  const nuevaVentaDoc = doc(ventasRef)

  await runTransaction(db, async (transaction) => {
    // Leer y actualizar consecutivo
    const configRef = doc(db, 'configuracion', 'general')
    const configSnap = await transaction.get(configRef)
    const nuevoConsecutivo = (configSnap.exists() ? (configSnap.data().consecutivo_actual || 0) : 0) + 1
    transaction.set(configRef, { consecutivo_actual: nuevoConsecutivo }, { merge: true })

    // Crear registro de venta
    transaction.set(nuevaVentaDoc, {
      consecutivo: nuevoConsecutivo,
      fecha: serverTimestamp(),
      turnoId: params.turnoId,
      cajeroId: params.cajeroId,
      espacioId: params.espacioId,
      clienteNombre: params.clienteNombre,
      metodoPago: 'transferencia',
      estado: 'pagada',
      origenReserva: params.reservaId,
      items: [
        {
          id: `reserva-${params.reservaId}`,
          nombre: `Reserva sala: ${params.mesaId}`,
          cantidad: 1,
          precioUnitario: params.montoTotal,
          costoUnitario: 0,
          subtotal: params.montoTotal,
        },
      ],
      totales: {
        subtotal: params.montoTotal,
        iva: 0,
        impoconsumo: 0,
        total: params.montoTotal,
      },
    })

    return nuevoConsecutivo
  })
}
