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
  runTransaction 
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
